'use client'

import React, { useState, useEffect, useRef } from 'react';
import SetupPhase from './SetupPhase';
import PlayingPhase from './PlayingPhase';
import ResultPhase from './ResultPhase';
import CalibrationPhase from './CalibrationPhase';

const LATENCY_STORAGE_KEY = 'polyrhythm_latency_comp_ms';
const MAX_LATENCY_COMP_MS = 300;
const DEFAULT_LATENCY_COMP_MS = 0; 

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

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

const estimateAutoLatencyCorrectionMs = ({ matchedResults, tracks, measureDuration }) => {
    const MIN_MATCHED_SAMPLES = 8;
    const MIN_ABS_MEDIAN_MS = 8;
    const DIRECTION_DEADZONE_MS = 10;
    const BUCKET_DEADZONE_MS = 8;
    const MAX_AUTO_CORRECTION_MS = 120;

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

    return clamp(overallMedian, -MAX_AUTO_CORRECTION_MS, MAX_AUTO_CORRECTION_MS);
};

export default function PolyrhythmGame() {
    const [gameState, setGameState] = useState('setup'); 
    const [count, setCount] = useState(4); 
    const [bpm, setBpm] = useState(90);
    const [measures, setMeasures] = useState(4);
    const [beatsPerMeasure, setBeatsPerMeasure] = useState(4); 
    const [tracks, setTracks] = useState([
        { id: 1, pulses: 4, key: 'shift' },
        { id: 2, pulses: 3, key: ' ' }
    ]);
    const [score, setScore] = useState(0);
    const [activeKeys, setActiveKeys] = useState({});
    const [expectedTaps, setExpectedTaps] = useState([]);
    const [detailedResults, setDetailedResults] = useState([]);
    const [latencyCompMs, setLatencyCompMs] = useState(DEFAULT_LATENCY_COMP_MS);
    const [hasManualCalibration, setHasManualCalibration] = useState(false);
    const [lastAutoCorrectionMs, setLastAutoCorrectionMs] = useState(0);

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
    const detailedResultsRef = useRef([]); 
    const timeoutsRef = useRef([]); 

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const stored = window.localStorage.getItem(LATENCY_STORAGE_KEY);
        if (stored !== null) {
            const parsed = Number(stored);
            if (Number.isFinite(parsed)) {
                setLatencyCompMs(clamp(parsed, -MAX_LATENCY_COMP_MS, MAX_LATENCY_COMP_MS));
                setHasManualCalibration(true);
            }
        }
    }, []);

    const addTrack = () => {
        if (tracks.length >= 5) return; 
        const newTotal = tracks.length + 1;
        const defaultKeys = getAssignedKey(0, newTotal) !== '' ? Array.from({length: newTotal}).map((_,i) => getAssignedKey(i, newTotal)) : ['a', 'shift', 'w', ' ', 'd'];
        
        const newTracks = [...tracks, { id: Date.now(), pulses: 4 }].map((t, index) => ({
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
        timeoutsRef.current.forEach(clearTimeout);
        timeoutsRef.current = [];

        const nextExpectedTaps = calculateExpectedTaps();
        expectedTapsRef.current = nextExpectedTaps;
        setExpectedTaps(nextExpectedTaps);
        actualTapsRef.current = [];

        setGameState('countIn');
        setCount(beatsPerMeasure); 
    
        const startOffset = 0.1;
        const now = audioCtxRef.current.currentTime + startOffset;
        const measureDurationSecs = measureDuration / 1000;
        const audioToPerfOffset = getAudioContextOffset();
    
        startTimeRef.current = ((now + measureDurationSecs) * 1000) + audioToPerfOffset + latencyCompMs;
    
        tracks.forEach((track, index) => {
            const trackFreq = index === 0 ? 1000 : (index === 1 ? 600 : 400); 
            for (let p = 0; p < track.pulses; p++) {
                const time = now + (p / track.pulses) * measureDurationSecs;
                const isBeatOne = (p === 0);
                playMetronomeClick(time, isBeatOne ? Math.max(trackFreq, 1200) : trackFreq);
            }
        });

        for (let b = 0; b < beatsPerMeasure; b++) {
            timeoutsRef.current.push(setTimeout(() => {
                setCount(beatsPerMeasure - b);
            }, (startOffset * 1000) + b * (measureDuration / beatsPerMeasure)));
        }

        timeoutsRef.current.push(setTimeout(() => {
            setGameState('playing');
        }, (startOffset * 1000) + measureDuration));
    
        for (let m = 0; m < measures; m++) {
            for (let p = 0; p < beatsPerMeasure; p++) {
                const isMeasureStart = (p === 0);
                const time = now + measureDurationSecs + m * measureDurationSecs + (p / beatsPerMeasure) * measureDurationSecs;
                playMetronomeClick(time, isMeasureStart ? 1200 : 1000);
            }
        }
    
        playMetronomeClick(now + measureDurationSecs + measures * measureDurationSecs, 1200);

        timeoutsRef.current.push(setTimeout(() => {
            endGame();
        }, (startOffset * 1000) + measureDuration + (measureDuration * measures) + 500));
    };

    const abortGame = () => {
        timeoutsRef.current.forEach(clearTimeout);
        timeoutsRef.current = [];
        if (audioCtxRef.current) {
            audioCtxRef.current.close().catch(console.error);
            audioCtxRef.current = null;
        }
        setGameState('setup');
    };

    const endGame = () => {
        setGameState('result');
        calculateScore();
    };

    const calculateScore = () => {
        let totalDeviation = 0; 
        let maxAllowedDeviation = 0; 
        const expected = expectedTapsRef.current;
        const availableActualTaps = [...actualTapsRef.current];
        const nextDetailedResults = [];
        let autoCorrectionMs = 0;

        expected.forEach(exp => {
            const track = tracks.find(t => t.id === exp.trackId);
            const maxErrorForBeat = (measureDuration / track.pulses) / 2;
            maxAllowedDeviation += maxErrorForBeat;

            const matchingTaps = availableActualTaps.filter(act => act.key === exp.key);
      
            if (matchingTaps.length === 0) {
                totalDeviation += maxErrorForBeat;
                nextDetailedResults.push({ ...exp, actualTime: null, diff: null });
                return; 
            }

            let closestTap = matchingTaps.reduce((prev, curr) => 
                Math.abs(curr.time - exp.time) < Math.abs(prev.time - exp.time) ? curr : prev
            );

            const diff = closestTap.time - exp.time;
            const absDiff = Math.abs(diff);
      
            if (absDiff <= maxErrorForBeat) {
                totalDeviation += absDiff;
                nextDetailedResults.push({
                    ...exp,
                    actualTime: closestTap.time,
                    diff
                });

                const usedIndex = availableActualTaps.findIndex(act => act === closestTap);
                if (usedIndex > -1) {
                    availableActualTaps.splice(usedIndex, 1);
                }
            } else {
                totalDeviation += maxErrorForBeat;
                nextDetailedResults.push({ ...exp, actualTime: null, diff: null });
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
                nextDetailedResults.push({
                    trackId: track.id,
                    key: act.key,
                    baseTime: baseTime,
                    diff: 0,
                    actualTime: act.time,
                    measureIndex: measureIndex,
                    isExtra: true
                });
            }
        });

        if (!hasManualCalibration) {
            const matchedResults = nextDetailedResults.filter(result => !result.isExtra && result.diff !== null);
            autoCorrectionMs = estimateAutoLatencyCorrectionMs({
                matchedResults,
                tracks,
                measureDuration
            });

            setLastAutoCorrectionMs(autoCorrectionMs);

            if (autoCorrectionMs !== 0) {
                totalDeviation = 0;
                nextDetailedResults.forEach((result) => {
                    if (result.isExtra) return;

                    const track = tracks.find(t => t.id === result.trackId);
                    if (!track) return;
                    const maxErrorForBeat = (measureDuration / track.pulses) / 2;

                    if (result.diff === null) {
                        totalDeviation += maxErrorForBeat;
                        return;
                    }

                    const correctedDiff = result.diff - autoCorrectionMs;
                    const absCorrectedDiff = Math.abs(correctedDiff);

                    if (absCorrectedDiff <= maxErrorForBeat) {
                        totalDeviation += absCorrectedDiff;
                        result.diff = correctedDiff;
                    } else {
                        totalDeviation += maxErrorForBeat;
                        result.actualTime = null;
                        result.diff = null;
                    }
                });

                totalDeviation += extraTaps.length * (avgMaxError / 2);
            }
        }

        detailedResultsRef.current = nextDetailedResults;
        setDetailedResults(nextDetailedResults);

        const finalPercentage = maxAllowedDeviation > 0 
            ? 100 - ((totalDeviation / maxAllowedDeviation) * 100) 
            : 0;
    
        setScore(Math.max(0, Math.round(finalPercentage)));
    };

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.repeat) return;

            if (e.key === 'Escape' && (gameState === 'playing' || gameState === 'countIn')) {
                e.preventDefault();
                abortGame();
                return;
            }

            if (gameState === 'calibrating') {
                e.preventDefault();
                return;
            }

            if (e.key === 'Enter') {
                e.preventDefault();
                if (gameState === 'setup') {
                    startGame();
                } else if (gameState === 'result') {
                    setGameState('setup');
                }
                return;
            }
      
            if (gameState !== 'playing' && gameState !== 'countIn') return;

            const key = e.key.toLowerCase();
            if (key === ' ') e.preventDefault();
      
            const validKeys = tracks.map(t => t.key || '');
      
            if (validKeys.includes(key)) {
                const pressTime = performance.now() - startTimeRef.current;
                actualTapsRef.current.push({ key, time: pressTime });
        
                setActiveKeys(prev => ({ ...prev, [key]: true }));
                setTimeout(() => setActiveKeys(prev => ({ ...prev, [key]: false })), 100);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    });

    return (
        <div className="w-full px-4 py-4 text-neutral-100 font-sans flex items-center justify-center">
            <div 
                className="tempo-window isolate flex flex-col w-full rounded-[1.7rem] border border-white/10 bg-neutral-900/80 shadow-[0_28px_80px_rgba(0,0,0,0.5)] backdrop-blur"
                style={{
                    minHeight: '30rem',
                    maxHeight: '55rem',
                    width: `min(100%, ${windowTargetWidth})`,
                    maxWidth: gameState === 'setup' ? '31rem' : `${clampedInGameWidthRem.toFixed(2)}rem`,
                    transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
            >
                <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
                    <div className="tempo-orb tempo-orb-a" />
                    <div className="tempo-orb tempo-orb-b" />
                    <div className="tempo-orb tempo-orb-c" />
                    <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.04),transparent_24%,transparent_76%,rgba(255,255,255,0.03))]" />
                </div>

                <div className="relative z-10 flex-1 p-5 md:p-7 rounded-[1.7rem] flex flex-col items-center justify-center overflow-y-auto">

                    {gameState === 'setup' && (
                        <SetupPhase
                            tracks={tracks}
                            addTrack={addTrack}
                            updateTrack={updateTrack}
                            removeTrack={removeTrack}
                            startGame={startGame}
                            onForceCalibrate={() => setGameState('calibrating')}
                            latencyCompMs={latencyCompMs}
                            hasManualCalibration={hasManualCalibration}
                            onResetCalibration={() => {
                                setLatencyCompMs(DEFAULT_LATENCY_COMP_MS);
                                setHasManualCalibration(false);
                                if (typeof window !== 'undefined') {
                                    window.localStorage.removeItem(LATENCY_STORAGE_KEY);
                                }
                            }}
                            bpm={bpm}
                            setBpm={setBpm}
                            measures={measures}
                            setMeasures={setMeasures}
                            beatsPerMeasure={beatsPerMeasure}
                            setBeatsPerMeasure={setBeatsPerMeasure}
                        />
                    )}

                    {gameState === 'calibrating' && (
                        <CalibrationPhase
                            onCancel={() => setGameState('setup')}
                            onComplete={(offsetMs) => {
                                const clampedOffsetMs = clamp(offsetMs, -MAX_LATENCY_COMP_MS, MAX_LATENCY_COMP_MS);
                                setLatencyCompMs(clampedOffsetMs);
                                setHasManualCalibration(true);
                                window.localStorage.setItem(LATENCY_STORAGE_KEY, String(Math.round(clampedOffsetMs)));
                                setGameState('setup');
                            }}
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
                            measures={measures}
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
                            hasManualCalibration={hasManualCalibration}
                            setGameState={setGameState}
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