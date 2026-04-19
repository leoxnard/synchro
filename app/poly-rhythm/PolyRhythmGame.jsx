'use client'

import React, { useState, useEffect, useRef } from 'react';
import SetupPhase from './SetupPhase/SetupPhase';
import PlayingPhase from './PlayingPhase';
import ResultPhase from './ResultPhase';
import LatencyTestPhase from './LatencyTestPhase';

import { useAudioEngine } from '../hooks/useAudioEngine';
import { computeFinalScore } from './utils/scoringEngine';
import { 
    getOrientationFromWindow,
    getRhythmToneHz,
    distanceSquared,
} from './utils/mathHelpers';

import {
    DEFAULT_LATENCY_COMP_MS,
    START_TAP_GRACE_MS,
    END_TAP_GRACE_MS,
    END_TAP_BASE_BUFFER_MS,
    BEAT_ACCENT_TONE_HZ,
    BEAT_PULSE_TONE_HZ,
    GAME_TUNING
} from './constants/gameConfig';

// ==================== MOBILE FREE-TAP CAPTURE ====================

export default function PolyrhythmGame() {
    const [gameState, setGameState] = useState('setup'); 
    const [count, setCount] = useState(4); 
    const [bpm, setBpm] = useState(90);
    const [measures, setMeasures] = useState(4);
    const [beatsPerMeasure, setBeatsPerMeasure] = useState(4); 
    const [countInBars, setCountInBars] = useState(1);
    const [tracks, setTracks] = useState([
        { id: 1, pulses: 4, key: 'shift' },
        { id: 2, pulses: 3 , key: ' ' }
    ]);
    const [score, setScore] = useState(0);
    const [activeKeys, setActiveKeys] = useState({});
    const [expectedTaps, setExpectedTaps] = useState([]);
    const [detailedResults, setDetailedResults] = useState([]);
    const [latencyCompMs, setLatencyCompMs] = useState(DEFAULT_LATENCY_COMP_MS);
    const [lastAutoCorrectionMs, setLastAutoCorrectionMs] = useState(0);
    const [debugAnalysis, setDebugAnalysis] = useState(null);
    const [isClientReady, setIsClientReady] = useState(false);
    const [isTouchPreferred, setIsTouchPreferred] = useState(false);
    const [orientation, setOrientation] = useState('portrait');
    const isGameplayActive = gameState === 'countIn' || gameState === 'playing' || gameState === 'practice';
    const isMobileLayoutEnabled = isClientReady && isTouchPreferred;

    const { 
        audioCtxRef, 
        initAudioContext, 
        closeAudioContext, 
        getAudioContextOffset, 
        scheduleDedupedClickEvents, 
        stopAllAudioNodes 
    } = useAudioEngine();

    const measureDuration = (60 / bpm) * beatsPerMeasure * 1000;
    const extraTracks = Math.max(0, tracks.length - 3);
    const circleSizePx = Math.max(92, 112 - (extraTracks * 10));
    const gapPx = Math.max(24, 40 - (extraTracks * 8));
    const playingRowWidthPx = (tracks.length * circleSizePx) + (Math.max(0, tracks.length - 1) * gapPx);
    const inGameWidthRem = Math.max(31, (playingRowWidthPx + 84) / 16);
    const clampedInGameWidthRem = Math.min(inGameWidthRem, 46);
    const windowTargetWidth = gameState === 'setup'
        ? '31rem'
        : `${clampedInGameWidthRem.toFixed(2)}rem`;
    const windowMinHeight = isMobileLayoutEnabled
        ? undefined
        : (gameState === 'latencyTest' ? '55rem' : '30rem');
    const windowMaxHeight = isMobileLayoutEnabled
        ? undefined
        : '55rem';

    const getAssignedKey = (index, total) => {
        const configs = {
            1: [' '],
            2: ['shift', ' '],
            3: ['shift', 'w', ' '],
            4: ['shift', 'w', 'd', ' '],
            5: ['shift', 'a', 'w', 'd', ' ']
        };
        const config = configs[Math.min(total, 5)] || configs[5];
        return config[index] || '';
    };

    const startTimeRef = useRef(0);
    const actualTapsRef = useRef([]);
    const expectedTapsRef = useRef([]);
    const detailedResultsRef = useRef([]); 
    const timeoutsRef = useRef([]); 
    const activePointerToKeyRef = useRef(new Map());
    const keyPressCountRef = useRef(new Map());
    const touchFallbackPressIdRef = useRef(0);
    const lastTouchInteractionAtRef = useRef(0);
    const recentMobileTapSignatureRef = useRef([]);
    const practiceIntervalRef = useRef(null);

    const supportsPointerEvents = () => (
        typeof window !== 'undefined' && 'PointerEvent' in window
    );

    const normalizeInputKey = (key) => {
        if (typeof key !== 'string') return '';
        if (key === 'Spacebar') return ' ';
        if (key === 'Space') return ' ';
        return key.toLowerCase();
    };

    const clearInputVisualState = () => {
        activePointerToKeyRef.current.clear();
        keyPressCountRef.current.clear();
        setActiveKeys({});
    };

    const isLikelyDuplicateMobileTap = (tapXPct, tapYPct, tapTimeMs) => {
        const DUPLICATE_TIME_WINDOW_MS = 120;
        const DUPLICATE_DISTANCE_PCT = 2.5;

        return recentMobileTapSignatureRef.current.some((signature) => (
            Math.abs(signature.timeMs - tapTimeMs) <= DUPLICATE_TIME_WINDOW_MS
            && Math.sqrt(distanceSquared(signature.x, signature.y, tapXPct, tapYPct)) <= DUPLICATE_DISTANCE_PCT
        ));
    };

    const rememberMobileTapSignature = (tapXPct, tapYPct, tapTimeMs) => {
        recentMobileTapSignatureRef.current.push({ x: tapXPct, y: tapYPct, timeMs: tapTimeMs });
        recentMobileTapSignatureRef.current = recentMobileTapSignatureRef.current.filter((signature) => (
            tapTimeMs - signature.timeMs <= 120
        ));
    };

    const setKeyPressedState = (key, isPressed) => {
        if (!key) return;

        const currentCount = keyPressCountRef.current.get(key) || 0;
        const nextCount = isPressed
            ? currentCount + 1
            : Math.max(0, currentCount - 1);

        if (nextCount === 0) {
            keyPressCountRef.current.delete(key);
        } else {
            keyPressCountRef.current.set(key, nextCount);
        }

        setActiveKeys((prev) => {
            const next = { ...prev };
            if (nextCount > 0) {
                next[key] = true;
            } else {
                delete next[key];
            }
            return next;
        });
    };

    const registerTapForKey = (rawKey, tapData = null) => {
        const key = normalizeInputKey(rawKey);
        if (!key) return false;

        if (gameState !== 'playing' && gameState !== 'countIn' && gameState !== 'practice') return false;

        const validKeys = tracks
            .map((track) => normalizeInputKey(track.key || ''))
            .filter(Boolean);
        if (!validKeys.includes(key)) return false;

        const pressTime = performance.now() - startTimeRef.current;
        
        if (gameState !== 'playing' && gameState !== 'practice' && pressTime < -START_TAP_GRACE_MS) return false;

        const DEDUP_WINDOW_MS = GAME_TUNING.input.dedupWindowMs;
        const recentSameKeyTap = actualTapsRef.current.find(
            (tap) => tap.key === key && Math.abs(tap.time - pressTime) < DEDUP_WINDOW_MS
        );

        if (recentSameKeyTap) {
            return false;
        }

        actualTapsRef.current.push({
            key,
            time: pressTime,
            ...(tapData || {})
        });
        
        if (gameState === 'practice' && actualTapsRef.current.length > 500) {
            actualTapsRef.current = actualTapsRef.current.slice(-250);
        }

        return true;
    };

    const handleInputDown = (rawKey, options = {}) => {
        const { releaseAfterMs, tapData = null } = options;
        const key = normalizeInputKey(rawKey);
        if (!registerTapForKey(key, tapData)) return false;

        setKeyPressedState(key, true);

        if (Number.isFinite(releaseAfterMs) && releaseAfterMs > 0) {
            setTimeout(() => {
                setKeyPressedState(key, false);
            }, releaseAfterMs);
        }

        return true;
    };

    const handleInputUp = (rawKey) => {
        const key = normalizeInputKey(rawKey);
        if (!key) return;
        setKeyPressedState(key, false);
    };

    const beginTrackPress = ({ trackKey, pointerId, tapData = null }) => {
        if (gameState !== 'playing' && gameState !== 'countIn' && gameState !== 'practice') return false;
        if (pointerId == null) return false;
        if (activePointerToKeyRef.current.has(pointerId)) return false;

        const normalizedTrackKey = normalizeInputKey(trackKey);
        if (!normalizedTrackKey) return false;
        if (!handleInputDown(normalizedTrackKey, { tapData })) return false;

        activePointerToKeyRef.current.set(pointerId, normalizedTrackKey);

        return true;
    };

    const endTrackPress = (pointerId) => {
        if (pointerId == null) return;
        releasePointerById(pointerId);
    };

    const handleTrackPointerDown = (event, trackKey) => {
        event.preventDefault();
        event.stopPropagation();
        beginTrackPress({
            trackKey,
            pointerId: event.pointerId
        });
    };

    const releasePointerById = (pointerId) => {
        const normalizedKey = activePointerToKeyRef.current.get(pointerId);
        if (!normalizedKey) return;

        activePointerToKeyRef.current.delete(pointerId);
        handleInputUp(normalizedKey);
    };

    const handleTrackPointerUp = (event) => {
        event.preventDefault();
        event.stopPropagation();
        endTrackPress(event.pointerId);
    };

    const handleTrackTouchStart = (event, trackKey) => {
        if (supportsPointerEvents()) return;
        event.preventDefault();
        event.stopPropagation();
        lastTouchInteractionAtRef.current = Date.now();
        const changedTouches = event.changedTouches || [];

        for (let i = 0; i < changedTouches.length; i += 1) {
            const touch = changedTouches[i];
            beginTrackPress({
                trackKey,
                pointerId: `touch-${touch.identifier}`
            });
        }
    };

    const processMobileFreeTapPoint = ({ clientX, clientY, eventTarget }) => {
        const playingSurface = eventTarget;
        const rect = playingSurface?.getBoundingClientRect?.();
        if (!rect || rect.width === 0 || rect.height === 0) return;

        const tapTimeMs = performance.now() - startTimeRef.current;

        const relativeX = clientX - rect.left;
        const relativeY = clientY - rect.top;
        const tapXPct = (relativeX / rect.width) * 100;
        const tapYPct = (relativeY / rect.height) * 100;

        if (isLikelyDuplicateMobileTap(tapXPct, tapYPct, tapTimeMs)) return;

        actualTapsRef.current.push({
            time: tapTimeMs,
            tapX: tapXPct,
            tapY: tapYPct,
            source: 'mobile-free-tap'
        });

        rememberMobileTapSignature(tapXPct, tapYPct, tapTimeMs);
    };

    const handleMobileFreeTapTouchStart = (event) => {
        if (!isMobileLayoutEnabled) return; 
        if (gameState !== 'playing' && gameState !== 'countIn' && gameState !== 'practice') return;

        if (supportsPointerEvents()) return;

        event.preventDefault();
        lastTouchInteractionAtRef.current = Date.now();
        const changedTouches = event.changedTouches || [];

        for (let i = 0; i < changedTouches.length; i += 1) {
            const touch = changedTouches[i];
            processMobileFreeTapPoint({
                clientX: touch.clientX,
                clientY: touch.clientY,
                eventTarget: event.currentTarget
            });
        }
    };

    const handleMobileFreeTapPointerDown = (event) => {
        if (!isMobileLayoutEnabled) return;
        if (gameState !== 'playing' && gameState !== 'countIn' && gameState !== 'practice') return;

        event.preventDefault();
        processMobileFreeTapPoint({
            clientX: event.clientX,
            clientY: event.clientY,
            eventTarget: event.currentTarget
        });
    };

    const handleTrackTouchEnd = (event) => {
        if (supportsPointerEvents()) return;
        event.preventDefault();
        event.stopPropagation();
        lastTouchInteractionAtRef.current = Date.now();
        const changedTouches = event.changedTouches || [];

        for (let i = 0; i < changedTouches.length; i += 1) {
            const touch = changedTouches[i];
            endTrackPress(`touch-${touch.identifier}`);
        }
    };

    const handleMobileFreeTapTouchEnd = (event) => {
        if (!isMobileLayoutEnabled) return;
        
        if (supportsPointerEvents()) return;

        event.preventDefault();
        lastTouchInteractionAtRef.current = Date.now();
        const changedTouches = event.changedTouches || [];

        for (let i = 0; i < changedTouches.length; i += 1) {
            const touch = changedTouches[i];
            endTrackPress(`touch-free-${touch.identifier}`);
        }
    };

    const handleMobileFreeTapPointerUp = (event) => {
        if (!isMobileLayoutEnabled) return;
        endTrackPress(`pointer-free-${event.pointerId}`);
    };

    const handleTrackClick = (event, trackKey) => {
        event.preventDefault();
        if (gameState !== 'playing' && gameState !== 'countIn' && gameState !== 'practice') return;

        if (Date.now() - lastTouchInteractionAtRef.current < 700) return;

        if (supportsPointerEvents()) return;

        const pointerId = `tap-${touchFallbackPressIdRef.current}`;
        touchFallbackPressIdRef.current += 1;

        const didPress = beginTrackPress({ trackKey, pointerId });
        if (!didPress) return;

        setTimeout(() => {
            endTrackPress(pointerId);
        }, 90);
    };

    const addTrack = () => {
        if (tracks.length >= 5) return; 
        const newTotal = tracks.length + 1;
        const defaultKeys = getAssignedKey(0, newTotal) !== '' ? Array.from({length: newTotal}).map((_,i) => getAssignedKey(i, newTotal)) : ['a', 'shift', 'w', ' ', 'd'];
        
        const newTracks = [...tracks, { id: Date.now(), pulses: 1 }].map((t, index) => ({
            ...t,
            key: defaultKeys[index] || t.key
        }));
        setTracks(newTracks);
    };

    const updateTrack = (id, field, value) => {
        setTracks(tracks.map(t => t.id === id ? { ...t, [field]: value } : t));
    };

    const removeTrack = (id) => {
        if (tracks.length > 1) {
            const remainingTracks = tracks.filter(t => t.id !== id);
            const newTotal = remainingTracks.length;
            const defaultKeys = Array.from({length: newTotal}).map((_,i) => getAssignedKey(i, newTotal));
      
            const newTracks = remainingTracks.map((t, index) => ({
                ...t,
                key: defaultKeys[index] || t.key
            }));
            setTracks(newTracks);
        }
    };

    const calculateExpectedTaps = () => {
        let taps = [];
        tracks.forEach((track) => {
            const assignedKey = track.key || '';
            for (let m = 0; m < measures; m++) {
                for (let p = 0; p < track.pulses; p++) {
                    taps.push({
                        trackId: track.id,
                        key: assignedKey,
                        time: m * measureDuration + (p / track.pulses) * measureDuration,
                        measureIndex: m,
                        baseTime: (p / track.pulses) * measureDuration
                    });
                }
            }
            taps.push({
                trackId: track.id,
                key: assignedKey,
                time: measures * measureDuration,
                measureIndex: measures,
                baseTime: 0
            });
        });
        return taps;
    };

    const startPractice = async () => {
        if (tracks.some(t => t.pulses <= 0)) {
            alert("Please configure all rhythms correctly!");
            return;
        }

        await initAudioContext();
        stopAllAudioNodes();
        timeoutsRef.current.forEach(clearTimeout);
        timeoutsRef.current = [];
        if (practiceIntervalRef.current) clearInterval(practiceIntervalRef.current);

        setGameState('practice');
        actualTapsRef.current = [];

        const now = audioCtxRef.current.currentTime + 0.1;
        const measureDurationSecs = measureDuration / 1000;
        const audioToPerfOffset = getAudioContextOffset();

        startTimeRef.current = (now * 1000) + audioToPerfOffset;
        let nextMeasureStartTime = now;

        const scheduleAhead = () => {
            if (!audioCtxRef.current) return;
            const currentAudioTime = audioCtxRef.current.currentTime;
            while (nextMeasureStartTime < currentAudioTime + 2.0) {
                const clickEvents = [];

                for (let p = 0; p < beatsPerMeasure; p += 1) {
                    clickEvents.push({
                        time: nextMeasureStartTime + (p / beatsPerMeasure) * measureDurationSecs,
                        freq: p === 0 ? BEAT_ACCENT_TONE_HZ : BEAT_PULSE_TONE_HZ,
                        rank: 0
                    });
                }

                tracks.forEach((track, trackIndex) => {
                    const pulseDurationSecs = measureDurationSecs / Math.max(1, track.pulses);
                    const rhythmToneHz = getRhythmToneHz(trackIndex);
                    const rank = trackIndex + 1;

                    for (let p = 0; p < track.pulses; p += 1) {
                        clickEvents.push({
                            time: nextMeasureStartTime + (p * pulseDurationSecs),
                            freq: rhythmToneHz, rank
                        });
                    }
                });

                scheduleDedupedClickEvents(clickEvents);
                nextMeasureStartTime += measureDurationSecs;
            }
        };

        scheduleAhead();
        practiceIntervalRef.current = setInterval(scheduleAhead, 500);
    };

    const startGame = async () => {
        if (tracks.some(t => t.pulses <= 0)) {
            alert("Please configure all rhythms correctly!");
            return;
        }

        await initAudioContext();
        stopAllAudioNodes();
        timeoutsRef.current.forEach(clearTimeout);
        timeoutsRef.current = [];

        const nextExpectedTaps = calculateExpectedTaps();
        expectedTapsRef.current = nextExpectedTaps;
        setExpectedTaps(nextExpectedTaps);
        actualTapsRef.current = [];
        setDebugAnalysis(null);

        const countInTotalBeats = Math.max(1, countInBars * beatsPerMeasure);
        setGameState('countIn');
        setCount(countInTotalBeats); 
    
        const startOffset = 0.1;
        const now = audioCtxRef.current.currentTime + startOffset;
        const beatDurationMs = measureDuration / beatsPerMeasure;
        const countInDurationMs = countInBars * measureDuration;
        const countInDurationSecs = countInDurationMs / 1000;
        const measureDurationSecs = measureDuration / 1000;
        const audioToPerfOffset = getAudioContextOffset();
    
        startTimeRef.current = ((now + countInDurationSecs) * 1000) + audioToPerfOffset;
    
        const clickEvents = [];

        for (let b = 0; b < countInTotalBeats; b++) {
            const time = now + ((b * beatDurationMs) / 1000);
            const isBarStart = (b % Math.max(1, beatsPerMeasure)) === 0;
            clickEvents.push({
                time,
                freq: isBarStart ? BEAT_ACCENT_TONE_HZ : BEAT_PULSE_TONE_HZ,
                rank: 0
            });
        }

        for (let b = 0; b < countInTotalBeats; b++) {
            timeoutsRef.current.push(setTimeout(() => {
                setCount(countInTotalBeats - b);
            }, (startOffset * 1000) + (b * beatDurationMs)));
        }

        timeoutsRef.current.push(setTimeout(() => {
            setGameState('playing');
        }, (startOffset * 1000) + countInDurationMs));
    
        const countInRhythmBars = countInBars;

        tracks.forEach((track, trackIndex) => {
            const pulseDurationSecs = measureDurationSecs / Math.max(1, track.pulses);
            const rhythmToneHz = getRhythmToneHz(trackIndex);
            const rank = trackIndex + 1;

            for (let m = 0; m < countInRhythmBars; m += 1) {
                for (let p = 0; p < track.pulses; p += 1) {
                    const time = now + (m * measureDurationSecs) + (p * pulseDurationSecs);
                    clickEvents.push({ time, freq: rhythmToneHz, rank });
                }
            }
        });

        for (let m = 0; m < measures; m += 1) {
            for (let p = 0; p < beatsPerMeasure; p += 1) {
                const time = now + countInDurationSecs + m * measureDurationSecs + (p / beatsPerMeasure) * measureDurationSecs;
                clickEvents.push({
                    time,
                    freq: p === 0 ? BEAT_ACCENT_TONE_HZ : BEAT_PULSE_TONE_HZ,
                    rank: 0
                });
            }
        }

        clickEvents.push({
            time: now + countInDurationSecs + (measures * measureDurationSecs),
            freq: BEAT_ACCENT_TONE_HZ,
            rank: 0
        });

        scheduleDedupedClickEvents(clickEvents);

        const dynamicEndTapGraceMs = Math.max(
            END_TAP_GRACE_MS,
            Math.abs(latencyCompMs) + END_TAP_BASE_BUFFER_MS
        );

        timeoutsRef.current.push(setTimeout(() => {
            endGame();
        }, (startOffset * 1000) + countInDurationMs + (measureDuration * measures) + dynamicEndTapGraceMs));
    };

    const abortGame = () => {
        timeoutsRef.current.forEach(clearTimeout);
        timeoutsRef.current = [];
        if (practiceIntervalRef.current) {
            clearInterval(practiceIntervalRef.current);
            practiceIntervalRef.current = null;
        }
        stopAllAudioNodes();
        closeAudioContext();
        actualTapsRef.current = [];
        expectedTapsRef.current = [];
        recentMobileTapSignatureRef.current = [];
        setDebugAnalysis(null);
        clearInputVisualState();
        setGameState('setup');
    };

    const endGame = () => {
        setGameState('result');
        
        const result = computeFinalScore({
            expectedTaps: expectedTapsRef.current,
            actualTaps: actualTapsRef.current,
            tracks,
            measureDuration,
            beatsPerMeasure,
            currentLatencyCompMs: latencyCompMs,
            isMobileLayoutEnabled
        });

        setScore(result.score);
        detailedResultsRef.current = result.detailedResults;
        setDetailedResults(result.detailedResults);
        setDebugAnalysis(result.debugAnalysis);
        setLatencyCompMs(result.updatedLatencyCompMs);
        setLastAutoCorrectionMs(result.lastAutoCorrectionMs);
    };

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const coarsePointerQuery = window.matchMedia('(pointer: coarse)');
        const touchPoints = navigator.maxTouchPoints || 0;

        const updateDeviceProfile = () => {
            setIsClientReady(true);
            setIsTouchPreferred(coarsePointerQuery.matches || touchPoints > 0);
            setOrientation(getOrientationFromWindow());
        };

        updateDeviceProfile();

        const orientationQuery = window.matchMedia('(orientation: landscape)');
        orientationQuery.addEventListener('change', updateDeviceProfile);
        coarsePointerQuery.addEventListener('change', updateDeviceProfile);

        return () => {
            orientationQuery.removeEventListener('change', updateDeviceProfile);
            coarsePointerQuery.removeEventListener('change', updateDeviceProfile);
        };
    }, []);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.repeat) return;

            if (e.key === 'Escape' && (gameState === 'playing' || gameState === 'countIn' || gameState === 'practice' || gameState === 'result')) {
                e.preventDefault();
                abortGame();
                return;
            }

            if (gameState === 'latencyTest') {
                return;
            }

            if (e.key === 'Enter') {
                e.preventDefault();
                if (gameState === 'setup') {
                    startGame();
                } else if (gameState === 'result') {
                    abortGame();
                }
                return;
            }
      
            if (gameState !== 'playing' && gameState !== 'countIn' && gameState !== 'practice') return;

            const key = normalizeInputKey(e.key);
            if (key === ' ') e.preventDefault();

            handleInputDown(key, { releaseAfterMs: 100 });
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    });

    useEffect(() => {
        if (!isGameplayActive) {
            clearInputVisualState();
            return;
        }

        const preventNativeGesture = (event) => {
            event.preventDefault();
        };

        let lastTouchEnd = 0;
        const preventGameplayTouchDefaults = (event) => {
            if (event.touches && event.touches.length > 1) {
                event.preventDefault();
                return;
            }

            const now = Date.now();
            if (event.type === 'touchend' && now - lastTouchEnd < 320) {
                event.preventDefault();
            }

            if (event.type === 'touchend') {
                lastTouchEnd = now;
            }
        };

        document.addEventListener('gesturestart', preventNativeGesture);
        document.addEventListener('gesturechange', preventNativeGesture);
        document.addEventListener('gestureend', preventNativeGesture);
        document.addEventListener('touchmove', preventGameplayTouchDefaults, { passive: false });
        document.addEventListener('touchend', preventGameplayTouchDefaults, { passive: false });

        return () => {
            document.removeEventListener('gesturestart', preventNativeGesture);
            document.removeEventListener('gesturechange', preventNativeGesture);
            document.removeEventListener('gestureend', preventNativeGesture);
            document.removeEventListener('touchmove', preventGameplayTouchDefaults);
            document.removeEventListener('touchend', preventGameplayTouchDefaults);
        };
    }, [isGameplayActive]);

    useEffect(() => {
        return () => {
            if (timeoutsRef.current) {
                timeoutsRef.current.forEach(clearTimeout);
            }
            if (practiceIntervalRef.current) {
                clearInterval(practiceIntervalRef.current);
            }
            stopAllAudioNodes();
            closeAudioContext();
        };
    }, []);

    return (
        <div className={`w-full h-full min-h-0 px-0 py-0 md:px-4 md:py-4 text-neutral-100 font-sans flex items-stretch justify-stretch md:items-center md:justify-center ${isGameplayActive ? 'gameplay-gesture-lock' : ''}`}>
            <div 
                className={`tempo-window isolate flex flex-col w-full min-w-0 min-h-0 rounded-[1.7rem] border border-white/10 bg-neutral-900/80 shadow-[0_28px_80px_rgba(0,0,0,0.5)] backdrop-blur`}
                style={{
                    minHeight: isMobileLayoutEnabled ? '0' : windowMinHeight,
                    maxHeight: isMobileLayoutEnabled ? '100%' : windowMaxHeight,
                    width: isMobileLayoutEnabled ? '100%' : `min(100%, ${windowTargetWidth})`,
                    maxWidth: isMobileLayoutEnabled ? 'none' : (gameState === 'setup' ? '31rem' : `${clampedInGameWidthRem.toFixed(2)}rem`),
                    height: isMobileLayoutEnabled ? '100%' : undefined,
                    transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
            >
                <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
                    <div className="tempo-orb tempo-orb-a" />
                    <div className="tempo-orb tempo-orb-b" />
                    <div className="tempo-orb tempo-orb-c" />
                    <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.04),transparent_24%,transparent_76%,rgba(255,255,255,0.03))]" />
                </div>

                <div className={`relative z-10 flex-1 min-h-0 ${isMobileLayoutEnabled ? 'p-2 md:p-7' : 'p-5 md:p-7'} ${isMobileLayoutEnabled ? 'rounded-[inherit]' : 'rounded-[1.7rem]'} flex flex-col items-stretch ${isMobileLayoutEnabled ? 'justify-start' : 'justify-center'} ${isGameplayActive ? 'overflow-hidden' : 'overflow-y-auto'}`}>

                    {gameState === 'setup' && (
                        <SetupPhase
                            tracks={tracks}
                            addTrack={addTrack}
                            updateTrack={updateTrack}
                            removeTrack={removeTrack}
                            startGame={startGame}
                            startPractice={startPractice}
                            onOpenLatencyTest={() => setGameState('latencyTest')}
                            latencyCompMs={latencyCompMs}
                            bpm={bpm}
                            setBpm={setBpm}
                            measures={measures}
                            setMeasures={setMeasures}
                            beatsPerMeasure={beatsPerMeasure}
                            setBeatsPerMeasure={setBeatsPerMeasure}
                            countInBars={countInBars}
                            setCountInBars={setCountInBars}
                            isTouchPreferred={isMobileLayoutEnabled}
                        />
                    )}

                    {gameState === 'latencyTest' && (
                        <LatencyTestPhase
                            onClose={abortGame}
                        />
                    )}

                    {(gameState === 'countIn' || gameState === 'playing' || gameState === 'practice') && (
                        <PlayingPhase
                            gameState={gameState}
                            count={count}
                            tracks={tracks}
                            activeKeys={activeKeys}
                            startTime={startTimeRef.current}
                            measureDuration={measureDuration}
                            countInDuration={countInBars * measureDuration}
                            onAbortGame={abortGame}
                            onTrackPointerDown={handleTrackPointerDown}
                            onTrackPointerUp={handleTrackPointerUp}
                            onTrackTouchStart={handleTrackTouchStart}
                            onTrackTouchEnd={handleTrackTouchEnd}
                            onMobileFreeTapTouchStart={handleMobileFreeTapTouchStart}
                            onMobileFreeTapTouchEnd={handleMobileFreeTapTouchEnd}
                            onMobileFreeTapPointerDown={handleMobileFreeTapPointerDown}
                            onMobileFreeTapPointerUp={handleMobileFreeTapPointerUp}
                            onTrackClick={handleTrackClick}
                            useCustomLayout={isMobileLayoutEnabled}
                            orientation={orientation}
                        />
                    )}

                    {gameState === 'result' && (
                        <ResultPhase
                            score={score}
                            tracks={tracks}
                            expectedTaps={expectedTaps}
                            detailedResults={detailedResults}
                            measureDuration={measureDuration}
                            measures={measures}
                            lastAutoCorrectionMs={lastAutoCorrectionMs}
                            debugAnalysis={debugAnalysis}
                            onTryAgain={abortGame}
                        />
                    )}
                </div>
            </div>

            <style jsx>{`
                .tempo-orb {
                    position: absolute;
                    border-radius: 9999px;
                    filter: blur(62px) saturate(1.2);
                    mix-blend-mode: screen;
                    pointer-events: none;
                    opacity: 0;
                }

                .tempo-orb-a {
                    width: 16rem;
                    height: 16rem;
                    left: -3rem;
                    top: -4rem;
                    background: radial-gradient(circle, rgba(34, 211, 238, 0.42) 0%, rgba(34, 211, 238, 0.04) 72%);
                    animation: orbFloatA 9s ease-in-out infinite;
                }

                .tempo-orb-b {
                    width: 18rem;
                    height: 18rem;
                    right: -4rem;
                    bottom: -5rem;
                    background: radial-gradient(circle, rgba(16, 185, 129, 0.4) 0%, rgba(16, 185, 129, 0.04) 74%);
                    animation: orbFloatB 11s ease-in-out infinite;
                }

                .tempo-orb-c {
                    width: 13rem;
                    height: 13rem;
                    right: 28%;
                    top: 32%;
                    background: radial-gradient(circle, rgba(167, 139, 250, 0.32) 0%, rgba(167, 139, 250, 0.04) 70%);
                    animation: orbFloatC 8s ease-in-out infinite;
                }

                @keyframes orbFloatA {
                    0%, 100% { transform: translate3d(0, 0, 0) scale(0.95); opacity: 0.34; }
                    35% { transform: translate3d(4rem, 2.5rem, 0) scale(1.08); opacity: 0.6; }
                    70% { transform: translate3d(2rem, 5rem, 0) scale(1); opacity: 0.24; }
                }

                @keyframes orbFloatB {
                    0%, 100% { transform: translate3d(0, 0, 0) scale(1); opacity: 0.3; }
                    40% { transform: translate3d(-3.5rem, -2.5rem, 0) scale(1.12); opacity: 0.55; }
                    75% { transform: translate3d(-1.2rem, -5.5rem, 0) scale(0.96); opacity: 0.22; }
                }

                @keyframes orbFloatC {
                    0%, 100% { transform: translate3d(0, 0, 0) scale(0.9); opacity: 0.22; }
                    50% { transform: translate3d(1.6rem, -1.4rem, 0) scale(1.1); opacity: 0.44; }
                }
            `}</style>
        </div>
    );
}