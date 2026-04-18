'use client'

import React, { useState, useEffect, useRef } from 'react';
import SetupPhase from './SetupPhase/SetupPhase';
import PlayingPhase from './PlayingPhase';
import ResultPhase from './ResultPhase';
import LatencyTestPhase from './LatencyTestPhase';

const MAX_LATENCY_COMP_MS = 2000;
const DEFAULT_LATENCY_COMP_MS = 0; 
const AUTO_LATENCY_SAMPLE_MAX_MS = 800;
const MAX_AUTO_CORRECTION_MS = 600;
const START_TAP_GRACE_MS = AUTO_LATENCY_SAMPLE_MAX_MS;
const MIN_ALLOWED_NEGATIVE_LATENCY_MS = -10;
const END_TAP_GRACE_MS = AUTO_LATENCY_SAMPLE_MAX_MS + 100;
const END_TAP_BASE_BUFFER_MS = 220;
const BEAT_ACCENT_TONE_HZ = 1175;
const BEAT_PULSE_TONE_HZ = 988;
const RHYTHM_TONES_HZ = [880, 740, 659, 587, 523];
const MOBILE_LAYOUT_STORAGE_KEY = 'synchro_poly_mobile_layout_v1';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const getRhythmToneHz = (trackIndex) => RHYTHM_TONES_HZ[trackIndex] || RHYTHM_TONES_HZ[RHYTHM_TONES_HZ.length - 1];

const median = (values) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
};

const signOf = (value, deadzone = 0) => {
    if (Math.abs(value) <= deadzone) return 0;
    return value > 0 ? 1 : -1;
};

const normalizeLatencyMs = (latencyMs, cycleMs) => {
    if (!Number.isFinite(latencyMs)) return 0;
    if (latencyMs >= MIN_ALLOWED_NEGATIVE_LATENCY_MS) return latencyMs;
    if (!Number.isFinite(cycleMs) || cycleMs <= 0) return MIN_ALLOWED_NEGATIVE_LATENCY_MS;

    let adjusted = latencyMs;
    while (adjusted < MIN_ALLOWED_NEGATIVE_LATENCY_MS) {
        adjusted += cycleMs;
    }

    return adjusted;
};

const estimateAutoLatencyCorrectionMs = ({ matchedResults, tracks, measureDuration }) => {
    const MIN_MATCHED_SAMPLES = 8;
    const MIN_ABS_MEDIAN_MS = 8;
    const DIRECTION_DEADZONE_MS = 10;
    const BUCKET_DEADZONE_MS = 8;
    if (matchedResults.length < MIN_MATCHED_SAMPLES) return 0;

    const diffs = matchedResults.map((result) => result.diff);
    const overallMedian = median(diffs);
    const overallDirection = signOf(overallMedian, DIRECTION_DEADZONE_MS);

    if (overallDirection === 0 || Math.abs(overallMedian) < MIN_ABS_MEDIAN_MS) return 0;

    const directionalHits = diffs.filter((diff) => signOf(diff, DIRECTION_DEADZONE_MS) === overallDirection).length;
    const directionalRatio = directionalHits / diffs.length;
    if (directionalRatio < 0.68) return 0;

    const groupedBySubdivision = new Map();

    matchedResults.forEach((result) => {
        const track = tracks.find((candidate) => candidate.id === result.trackId);
        if (!track || track.pulses <= 0) return;

        const pulseDuration = measureDuration / track.pulses;
        const pulseIndex = Math.round(result.baseTime / pulseDuration) % track.pulses;
        const bucketKey = `${track.id}:${pulseIndex}`;

        if (!groupedBySubdivision.has(bucketKey)) {
            groupedBySubdivision.set(bucketKey, []);
        }
        groupedBySubdivision.get(bucketKey).push(result.diff);
    });

    let sameDirectionWeight = 0;
    let oppositeDirectionWeight = 0;

    groupedBySubdivision.forEach((bucketDiffs) => {
        if (bucketDiffs.length < 2) return;
        const bucketMedian = median(bucketDiffs);
        const bucketDirection = signOf(bucketMedian, BUCKET_DEADZONE_MS);
        if (bucketDirection === 0) return;

        if (bucketDirection === overallDirection) {
            sameDirectionWeight += bucketDiffs.length;
        } else {
            oppositeDirectionWeight += bucketDiffs.length;
        }
    });

    if (sameDirectionWeight === 0) return 0;
    if (oppositeDirectionWeight > sameDirectionWeight * 0.3) return 0;

    return clamp(overallMedian, MIN_ALLOWED_NEGATIVE_LATENCY_MS, MAX_AUTO_CORRECTION_MS);
};

const estimateFallbackAutoLatencyMs = (samples) => {
    const MIN_FALLBACK_SAMPLES = 3;
    const MIN_FALLBACK_MEDIAN_MS = 12;

    const filteredDiffs = samples
        .map((sample) => sample.diff)
        .filter((diff) => Number.isFinite(diff) && Math.abs(diff) <= AUTO_LATENCY_SAMPLE_MAX_MS);

    if (filteredDiffs.length < MIN_FALLBACK_SAMPLES) return 0;

    const fallbackMedian = median(filteredDiffs);
    if (Math.abs(fallbackMedian) < MIN_FALLBACK_MEDIAN_MS) return 0;

    return clamp(fallbackMedian, MIN_ALLOWED_NEGATIVE_LATENCY_MS, MAX_AUTO_CORRECTION_MS);
};

const buildAutoLatencySamples = ({ expectedTaps, actualTaps }) => {
    const expectedByKey = new Map();
    expectedTaps.forEach((tap) => {
        if (!expectedByKey.has(tap.key)) {
            expectedByKey.set(tap.key, []);
        }
        expectedByKey.get(tap.key).push(tap);
    });

    expectedByKey.forEach((list) => list.sort((a, b) => a.time - b.time));

    const actualByKey = new Map();
    actualTaps.forEach((tap) => {
        if (!actualByKey.has(tap.key)) {
            actualByKey.set(tap.key, []);
        }
        actualByKey.get(tap.key).push(tap);
    });

    actualByKey.forEach((list) => list.sort((a, b) => a.time - b.time));

    const samples = [];

    actualByKey.forEach((actualList, key) => {
        const expectedList = expectedByKey.get(key);
        if (!expectedList || expectedList.length === 0) return;

        let expectedIdx = 0;

        actualList.forEach((actualTap) => {
            while (
                expectedIdx + 1 < expectedList.length &&
                expectedList[expectedIdx + 1].time <= actualTap.time
            ) {
                expectedIdx += 1;
            }

            const expectedTap = expectedList[expectedIdx];
            if (!expectedTap) return;

            const diff = actualTap.time - expectedTap.time;
            if (Math.abs(diff) > AUTO_LATENCY_SAMPLE_MAX_MS) return;

            samples.push({
                trackId: expectedTap.trackId,
                baseTime: expectedTap.baseTime,
                diff
            });
        });
    });

    return samples;
};

const getOrientationFromWindow = () => (
    window.matchMedia('(orientation: landscape)').matches ? 'landscape' : 'portrait'
);

const buildStackedDefaults = (tracks, orientation) => {
    const total = tracks.length;
    const isPortrait = orientation === 'portrait';
    const xBase = isPortrait ? 56 : 54;
    const yStart = isPortrait ? 20 : 18;
    const yEnd = isPortrait ? 82 : 82;

    const xOffsetsByCount = {
        1: [0],
        2: [0, 0],
        3: [0, -8, 0],
        4: [0, -7, -7, 0],
        5: [0, -5, -10, -5, 0]
    };

    const xOffsets = xOffsetsByCount[total];
    if (!xOffsets) return null;

    const layout = {};
    tracks.forEach((track, index) => {
        const t = total <= 1 ? 0.5 : index / (total - 1);
        const y = yStart + (t * (yEnd - yStart));
        const x = xBase + (xOffsets[index] || 0);
        layout[track.id] = {
            x: clamp(x, 10, 90),
            y: clamp(y, 20, 84)
        };
    });

    return layout;
};

const buildDefaultButtonLayout = (tracks, orientation) => {
    if (!Array.isArray(tracks) || tracks.length === 0) return {};

    const stackedDefaults = buildStackedDefaults(tracks, orientation);
    if (stackedDefaults) return stackedDefaults;

    const total = tracks.length;
    const defaultMap = {};

    tracks.forEach((track, index) => {
        const t = total <= 1 ? 0.5 : index / (total - 1);
        let x;
        let y;

        if (orientation === 'portrait') {
            x = 28 + (t * 52);
            y = 68 - (Math.sin(t * Math.PI) * 14) + (t * 6);
        } else {
            x = 18 + (t * 64);
            y = 58 - (Math.sin(t * Math.PI) * 6);
        }

        defaultMap[track.id] = {
            x: clamp(x, 10, 90),
            y: clamp(y, 20, 84)
        };
    });

    return defaultMap;
};

const normalizeLayoutForTracks = (layoutMap, tracks, orientation) => {
    const fallback = buildDefaultButtonLayout(tracks, orientation);
    const normalized = {};

    tracks.forEach((track) => {
        const existing = layoutMap?.[track.id];
        if (!existing || !Number.isFinite(existing.x) || !Number.isFinite(existing.y)) {
            normalized[track.id] = fallback[track.id];
            return;
        }

        normalized[track.id] = {
            x: clamp(existing.x, 10, 90),
            y: clamp(existing.y, 20, 84)
        };
    });

    return normalized;
};

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
    const [isClientReady, setIsClientReady] = useState(false);
    const [isTouchPreferred, setIsTouchPreferred] = useState(false);
    const [orientation, setOrientation] = useState('portrait');
    const [isLayoutEditorOpen, setIsLayoutEditorOpen] = useState(false);
    const [mobileButtonLayouts, setMobileButtonLayouts] = useState({ portrait: {}, landscape: {} });
    const isGameplayActive = gameState === 'countIn' || gameState === 'playing';
    const isMobileLayoutEnabled = isClientReady && isTouchPreferred;
    const isMobileLayoutEditorActive = isMobileLayoutEnabled && gameState === 'setup' && isLayoutEditorOpen;
    const activeButtonLayout = orientation === 'landscape'
        ? mobileButtonLayouts.landscape
        : mobileButtonLayouts.portrait;

    const measureDuration = (60 / bpm) * beatsPerMeasure * 1000;
    const extraTracks = Math.max(0, tracks.length - 3);
    const circleSizePx = Math.max(92, 112 - (extraTracks * 10));
    const gapPx = Math.max(24, 40 - (extraTracks * 8));
    const playingRowWidthPx = (tracks.length * circleSizePx) + (Math.max(0, tracks.length - 1) * gapPx);
    const inGameWidthRem = Math.max(31, (playingRowWidthPx + 84) / 16);
    const clampedInGameWidthRem = Math.min(inGameWidthRem, 46);
    const windowTargetWidth = (gameState === 'setup' && !isLayoutEditorOpen)
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
    const audioCtxRef = useRef(null);
    const activeAudioNodesRef = useRef([]);
    const detailedResultsRef = useRef([]); 
    const timeoutsRef = useRef([]); 
    const activePointerToKeyRef = useRef(new Map());
    const keyPressCountRef = useRef(new Map());
    const touchFallbackPressIdRef = useRef(0);
    const lastTouchInteractionAtRef = useRef(0);

    const supportsPointerEvents = () => (
        typeof window !== 'undefined' && 'PointerEvent' in window
    );

    const updateActiveOrientationLayoutPosition = (trackId, x, y) => {
        setMobileButtonLayouts((prev) => {
            const key = orientation === 'landscape' ? 'landscape' : 'portrait';
            return {
                ...prev,
                [key]: {
                    ...prev[key],
                    [trackId]: {
                        x: clamp(x, 2, 98),
                        y: clamp(y, 2, 98)
                    }
                }
            };
        });
    };

    const resetActiveOrientationLayout = () => {
        setMobileButtonLayouts((prev) => {
            const key = orientation === 'landscape' ? 'landscape' : 'portrait';
            return {
                ...prev,
                [key]: buildDefaultButtonLayout(tracks, key)
            };
        });
    };

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

    const registerTapForKey = (rawKey) => {
        const key = normalizeInputKey(rawKey);
        if (!key) return false;

        if (gameState !== 'playing' && gameState !== 'countIn') return false;

        const validKeys = tracks
            .map((track) => normalizeInputKey(track.key || ''))
            .filter(Boolean);
        if (!validKeys.includes(key)) return false;

        const pressTime = performance.now() - startTimeRef.current;
        if (gameState !== 'playing' && pressTime < -START_TAP_GRACE_MS) return false;

        actualTapsRef.current.push({ key, time: pressTime });
        return true;
    };

    const handleInputDown = (rawKey, options = {}) => {
        const { releaseAfterMs } = options;
        const key = normalizeInputKey(rawKey);
        if (!registerTapForKey(key)) return false;

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

    const beginTrackPress = ({ trackKey, pointerId, eventTarget }) => {
        if (gameState !== 'playing' && gameState !== 'countIn') return false;
        if (pointerId == null) return false;
        if (activePointerToKeyRef.current.has(pointerId)) return false;

        const normalizedTrackKey = normalizeInputKey(trackKey);
        if (!normalizedTrackKey) return false;
        if (!handleInputDown(normalizedTrackKey)) return false;

        activePointerToKeyRef.current.set(pointerId, normalizedTrackKey);

        if (eventTarget && typeof eventTarget.setPointerCapture === 'function' && typeof pointerId === 'number') {
            try {
                eventTarget.setPointerCapture(pointerId);
            } catch {}
        }

        return true;
    };

    const endTrackPress = (pointerId) => {
        if (pointerId == null) return;
        releasePointerById(pointerId);
    };

    const handleTrackPointerDown = (event, trackKey) => {
        event.preventDefault();
        beginTrackPress({
            trackKey,
            pointerId: event.pointerId,
            eventTarget: event.currentTarget
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
        endTrackPress(event.pointerId);
    };

    const handleTrackTouchStart = (event, trackKey) => {
        if (supportsPointerEvents()) return;

        event.preventDefault();
        lastTouchInteractionAtRef.current = Date.now();
        const changedTouches = event.changedTouches || [];

        for (let i = 0; i < changedTouches.length; i += 1) {
            const touch = changedTouches[i];
            beginTrackPress({
                trackKey,
                pointerId: `touch-${touch.identifier}`,
                eventTarget: event.currentTarget
            });
        }
    };

    const handleTrackTouchEnd = (event) => {
        if (supportsPointerEvents()) return;

        event.preventDefault();
        lastTouchInteractionAtRef.current = Date.now();
        const changedTouches = event.changedTouches || [];

        for (let i = 0; i < changedTouches.length; i += 1) {
            const touch = changedTouches[i];
            endTrackPress(`touch-${touch.identifier}`);
        }
    };

    const handleTrackClick = (event, trackKey) => {
        event.preventDefault();
        if (gameState !== 'playing' && gameState !== 'countIn') return;

        // Mobile browsers can emit a synthetic click right after a touch sequence.
        // Ignore those so taps are not counted twice and scores stay comparable.
        if (Date.now() - lastTouchInteractionAtRef.current < 700) return;

        // Click fallback is only needed on browsers without pointer events.
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
        setMobileButtonLayouts((prev) => {
            const key = orientation === 'landscape' ? 'landscape' : 'portrait';
            return {
                ...prev,
                [key]: buildDefaultButtonLayout(newTracks, key)
            };
        });
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
            setMobileButtonLayouts((prev) => {
                const key = orientation === 'landscape' ? 'landscape' : 'portrait';
                return {
                    ...prev,
                    [key]: buildDefaultButtonLayout(newTracks, key)
                };
            });
        }
    };

    const getAudioContextOffset = () => {
        if (!audioCtxRef.current) return 0;
        return performance.now() - (audioCtxRef.current.currentTime * 1000);
    };

    const playMetronomeClick = (time, freq = 800) => {
        if (!audioCtxRef.current) return;
        const osc = audioCtxRef.current.createOscillator();
        const gain = audioCtxRef.current.createGain();
        osc.connect(gain);
        gain.connect(audioCtxRef.current.destination);
        osc.frequency.value = freq; 
        gain.gain.setValueAtTime(0.5, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
        osc.start(time);
        osc.stop(time + 0.1);
        activeAudioNodesRef.current.push({ osc, gain });
    };

    const scheduleDedupedClickEvents = (events) => {
        if (!Array.isArray(events) || events.length === 0) return;

        const CLICK_DEDUP_EPSILON_MS = 12;
        const sorted = [...events].sort((a, b) => a.time - b.time);
        const deduped = [];

        sorted.forEach((event) => {
            const last = deduped[deduped.length - 1];
            if (!last) {
                deduped.push(event);
                return;
            }

            const isSameTime = Math.abs((event.time - last.time) * 1000) <= CLICK_DEDUP_EPSILON_MS;
            if (!isSameTime) {
                deduped.push(event);
                return;
            }

            if ((event.rank ?? Number.MAX_SAFE_INTEGER) < (last.rank ?? Number.MAX_SAFE_INTEGER)) {
                deduped[deduped.length - 1] = event;
            }
        });

        deduped.forEach((event) => playMetronomeClick(event.time, event.freq));
    };

    const stopAllAudioNodes = () => {
        activeAudioNodesRef.current.forEach(({ osc, gain }) => {
            try { osc.stop(); } catch {}
            try { osc.disconnect(); } catch {}
            try { gain.disconnect(); } catch {}
        });
        activeAudioNodesRef.current = [];
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

    const startGame = async () => {
        if (tracks.some(t => t.pulses <= 0)) {
            alert("Please configure all rhythms correctly!");
            return;
        }

        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtxRef.current.state !== 'running') {
            await audioCtxRef.current.resume().catch(() => {});
        }
        stopAllAudioNodes();
        timeoutsRef.current.forEach(clearTimeout);
        timeoutsRef.current = [];

        const nextExpectedTaps = calculateExpectedTaps();
        expectedTapsRef.current = nextExpectedTaps;
        setExpectedTaps(nextExpectedTaps);
        actualTapsRef.current = [];

        const countInTotalBeats = Math.max(1, countInBars * beatsPerMeasure);
        setIsLayoutEditorOpen(false);
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

        // Base beat track in count-in and playing phase.
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
        stopAllAudioNodes();
        if (audioCtxRef.current) {
            audioCtxRef.current.close().catch(console.error);
            audioCtxRef.current = null;
        }
        actualTapsRef.current = [];
        expectedTapsRef.current = [];
        clearInputVisualState();
        setIsLayoutEditorOpen(false);
        setGameState('setup');
    };

    const endGame = () => {
        setGameState('result');
        calculateScore();
    };

    const calculateScore = () => {
        const expected = expectedTapsRef.current;
        let detectedCorrectionMs = 0;
        const beatDurationMs = measureDuration / Math.max(1, beatsPerMeasure);
        const currentLatencyCompMs = clamp(
            normalizeLatencyMs(latencyCompMs, beatDurationMs),
            MIN_ALLOWED_NEGATIVE_LATENCY_MS,
            MAX_LATENCY_COMP_MS
        );

        const scoreWithCorrection = (correctionMs) => {
            let totalDeviation = 0;
            let maxAllowedDeviation = 0;
            const availableActualTaps = [...actualTapsRef.current];
            const detailed = [];

            expected.forEach(exp => {
                const track = tracks.find(t => t.id === exp.trackId);
                const maxErrorForBeat = (measureDuration / track.pulses) / 2;
                maxAllowedDeviation += maxErrorForBeat;

                const matchingTaps = availableActualTaps.filter(act => act.key === exp.key);

                if (matchingTaps.length === 0) {
                    totalDeviation += maxErrorForBeat;
                    detailed.push({ ...exp, actualTime: null, diff: null });
                    return;
                }

                const closestTap = matchingTaps.reduce((prev, curr) => {
                    const prevCorrectedDiff = (prev.time - exp.time) - correctionMs;
                    const currCorrectedDiff = (curr.time - exp.time) - correctionMs;
                    return Math.abs(currCorrectedDiff) < Math.abs(prevCorrectedDiff) ? curr : prev;
                });

                const correctedDiff = (closestTap.time - exp.time) - correctionMs;
                const absCorrectedDiff = Math.abs(correctedDiff);

                if (absCorrectedDiff <= maxErrorForBeat) {
                    totalDeviation += absCorrectedDiff;
                    detailed.push({
                        ...exp,
                        actualTime: closestTap.time,
                        diff: correctedDiff
                    });

                    const usedIndex = availableActualTaps.findIndex(act => act === closestTap);
                    if (usedIndex > -1) {
                        availableActualTaps.splice(usedIndex, 1);
                    }
                } else {
                    totalDeviation += maxErrorForBeat;
                    detailed.push({ ...exp, actualTime: null, diff: null });
                }
            });

            const extraTaps = availableActualTaps.filter(act => tracks.some(t => t.key === act.key));
            const avgMaxError = expected.length > 0 ? (maxAllowedDeviation / expected.length) : 200;
            totalDeviation += extraTaps.length * (avgMaxError / 2);

            extraTaps.forEach(act => {
                const track = tracks.find(t => t.key === act.key);
                if (track) {
                    const measureIndex = Math.floor(act.time / measureDuration);
                    const baseTime = act.time % measureDuration;
                    detailed.push({
                        trackId: track.id,
                        key: act.key,
                        baseTime,
                        diff: 0,
                        actualTime: act.time,
                        measureIndex,
                        isExtra: true
                    });
                }
            });

            return {
                totalDeviation,
                maxAllowedDeviation,
                detailed
            };
        };

        let scoring = scoreWithCorrection(currentLatencyCompMs);

        const matchedResults = buildAutoLatencySamples({
            expectedTaps: expected,
            actualTaps: actualTapsRef.current
        });
        detectedCorrectionMs = estimateAutoLatencyCorrectionMs({
            matchedResults,
            tracks,
            measureDuration
        });

        if (detectedCorrectionMs === 0) {
            detectedCorrectionMs = estimateFallbackAutoLatencyMs(matchedResults);
        }

        detectedCorrectionMs = clamp(detectedCorrectionMs, MIN_ALLOWED_NEGATIVE_LATENCY_MS, MAX_AUTO_CORRECTION_MS);

        let residualCorrectionMs = detectedCorrectionMs - currentLatencyCompMs;

        const minResidualCorrectionMs = MIN_ALLOWED_NEGATIVE_LATENCY_MS - currentLatencyCompMs;
        residualCorrectionMs = clamp(residualCorrectionMs, minResidualCorrectionMs, MAX_AUTO_CORRECTION_MS);

        const updatedLatencyCompMs = clamp(
            normalizeLatencyMs(currentLatencyCompMs + residualCorrectionMs, beatDurationMs),
            MIN_ALLOWED_NEGATIVE_LATENCY_MS,
            MAX_LATENCY_COMP_MS
        );

        setLastAutoCorrectionMs(detectedCorrectionMs);
        setLatencyCompMs(updatedLatencyCompMs);

        if (updatedLatencyCompMs !== currentLatencyCompMs) {
            scoring = scoreWithCorrection(updatedLatencyCompMs);
        }

        detailedResultsRef.current = scoring.detailed;
        setDetailedResults(scoring.detailed);

        const rawPercentage = scoring.maxAllowedDeviation > 0
            ? 100 - ((scoring.totalDeviation / scoring.maxAllowedDeviation) * 100)
            : 0;

        const x = clamp(rawPercentage / 100, 0, 1);

        const alpha = 1.9; // steepness of the curve
        const k = 0.7; // intercept point on linear scale

        let curveValue = 0;
        if (x < k) {
            curveValue = k * Math.pow(x / k, alpha);
        } else {
            curveValue = 1 - (1 - k) * Math.pow((1 - x) / (1 - k), alpha);
        }
        const finalScore = curveValue * 10;

        setScore(Math.max(0, finalScore.toFixed(1)));
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

        try {
            const rawStored = window.localStorage.getItem(MOBILE_LAYOUT_STORAGE_KEY);
            if (rawStored) {
                const parsed = JSON.parse(rawStored);
                if (parsed && typeof parsed === 'object') {
                    setMobileButtonLayouts({
                        portrait: parsed.portrait || {},
                        landscape: parsed.landscape || {}
                    });
                }
            }
        } catch {}

        return () => {
            orientationQuery.removeEventListener('change', updateDeviceProfile);
            coarsePointerQuery.removeEventListener('change', updateDeviceProfile);
        };
    }, []);

    useEffect(() => {
        setMobileButtonLayouts((prev) => {
            const nextPortrait = normalizeLayoutForTracks(prev.portrait, tracks, 'portrait');
            const nextLandscape = normalizeLayoutForTracks(prev.landscape, tracks, 'landscape');

            const portraitChanged = JSON.stringify(nextPortrait) !== JSON.stringify(prev.portrait);
            const landscapeChanged = JSON.stringify(nextLandscape) !== JSON.stringify(prev.landscape);
            if (!portraitChanged && !landscapeChanged) return prev;

            return {
                portrait: nextPortrait,
                landscape: nextLandscape
            };
        });
    }, [tracks]);

    useEffect(() => {
        if (!isClientReady || typeof window === 'undefined') return;
        try {
            window.localStorage.setItem(
                MOBILE_LAYOUT_STORAGE_KEY,
                JSON.stringify({
                    version: 1,
                    portrait: mobileButtonLayouts.portrait,
                    landscape: mobileButtonLayouts.landscape
                })
            );
        } catch {}
    }, [isClientReady, mobileButtonLayouts]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.repeat) return;

            if (e.key === 'Escape' && (gameState === 'playing' || gameState === 'countIn')) {
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
      
            if (gameState !== 'playing' && gameState !== 'countIn') return;

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

    return (
        <div className={`w-full h-full min-h-0 px-0 py-0 md:px-4 md:py-4 text-neutral-100 font-sans flex items-stretch justify-stretch md:items-center md:justify-center ${isGameplayActive ? 'gameplay-gesture-lock' : ''}`}>
            <div 
                className={`tempo-window isolate flex flex-col w-full min-w-0 min-h-0 ${isMobileLayoutEnabled ? 'rounded-[1.7rem] border border-white/10' : 'rounded-[1.7rem] border border-white/10'} bg-neutral-900/80 shadow-[0_28px_80px_rgba(0,0,0,0.5)] backdrop-blur`}
                style={{
                    minHeight: isMobileLayoutEnabled ? '0' : windowMinHeight,
                    maxHeight: isMobileLayoutEnabled ? '100%' : windowMaxHeight,
                    width: isMobileLayoutEnabled ? '100%' : `min(100%, ${windowTargetWidth})`,
                    maxWidth: isMobileLayoutEnabled ? 'none' : (gameState === 'setup' && !isLayoutEditorOpen ? '31rem' : `${clampedInGameWidthRem.toFixed(2)}rem`),
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

                <div className={`relative z-10 flex-1 min-h-0 ${isMobileLayoutEnabled ? 'p-2 md:p-7' : 'p-5 md:p-7'} ${isMobileLayoutEnabled ? 'rounded-[inherit]' : 'rounded-[1.7rem]'} flex flex-col items-stretch ${isMobileLayoutEnabled ? 'justify-start' : 'justify-center'} ${(isGameplayActive || isMobileLayoutEditorActive) ? 'overflow-hidden' : 'overflow-y-auto'}`}>

                    {gameState === 'setup' && (
                        <SetupPhase
                            tracks={tracks}
                            addTrack={addTrack}
                            updateTrack={updateTrack}
                            removeTrack={removeTrack}
                            startGame={startGame}
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
                            orientation={orientation}
                            isLayoutEditorOpen={isLayoutEditorOpen}
                            onToggleLayoutEditor={() => setIsLayoutEditorOpen((prev) => !prev)}
                            onCloseLayoutEditor={() => setIsLayoutEditorOpen(false)}
                            onResetLayout={resetActiveOrientationLayout}
                            buttonLayout={activeButtonLayout}
                            onMoveLayoutButton={updateActiveOrientationLayoutPosition}
                        />
                    )}

                    {gameState === 'latencyTest' && (
                        <LatencyTestPhase
                            onClose={abortGame}
                        />
                    )}

                    {(gameState === 'countIn' || gameState === 'playing') && (
                        <PlayingPhase
                            gameState={gameState}
                            count={count}
                            tracks={tracks}
                            activeKeys={activeKeys}
                            startTime={startTimeRef.current}
                            measureDuration={measureDuration}
                            countInDuration={countInBars * measureDuration}
                            onTrackPointerDown={handleTrackPointerDown}
                            onTrackPointerUp={handleTrackPointerUp}
                            onTrackTouchStart={handleTrackTouchStart}
                            onTrackTouchEnd={handleTrackTouchEnd}
                            onTrackClick={handleTrackClick}
                            useCustomLayout={isMobileLayoutEnabled}
                            orientation={orientation}
                            buttonLayout={activeButtonLayout}
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