'use client'

import React, { useState, useEffect, useRef } from 'react';
import SetupPhase from './SetupPhase';
import PlayingPhase from './PlayingPhase';
import ResultPhase from './ResultPhase';
import LatencyTestPhase from './LatencyTestPhase';

const MAX_LATENCY_COMP_MS = 2000;
const DEFAULT_LATENCY_COMP_MS = 0; 
const SCORE_UPLIFT_GAMMA = 0.6;
const AUTO_LATENCY_SAMPLE_MAX_MS = 800;
const MAX_AUTO_CORRECTION_MS = 600;
const START_TAP_GRACE_MS = AUTO_LATENCY_SAMPLE_MAX_MS;
const MIN_ALLOWED_NEGATIVE_LATENCY_MS = -10;
const END_TAP_GRACE_MS = AUTO_LATENCY_SAMPLE_MAX_MS + 100;
const END_TAP_BASE_BUFFER_MS = 220;

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
    const windowMinHeight = gameState === 'latencyTest' ? '55rem' : '30rem';

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
    
        startTimeRef.current = ((now + measureDurationSecs) * 1000) + audioToPerfOffset;
    
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

        const dynamicEndTapGraceMs = Math.max(
            END_TAP_GRACE_MS,
            Math.abs(latencyCompMs) + END_TAP_BASE_BUFFER_MS
        );

        timeoutsRef.current.push(setTimeout(() => {
            endGame();
        }, (startOffset * 1000) + measureDuration + (measureDuration * measures) + dynamicEndTapGraceMs));
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

        const normalizedRawScore = clamp(rawPercentage / 100, 0, 1);
        const upliftedPercentage = Math.pow(normalizedRawScore, SCORE_UPLIFT_GAMMA) * 100;

        setScore(Math.max(0, Math.round(upliftedPercentage)));
    };

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
                    setGameState('setup');
                }
                return;
            }
      
            if (gameState !== 'playing' && gameState !== 'countIn') return;

            const key = e.key.toLowerCase();
            if (key === ' ') e.preventDefault();
      
            const validKeys = tracks.map(t => t.key || '');
            const pressTime = performance.now() - startTimeRef.current;

            if (gameState !== 'playing' && (gameState !== 'countIn' || pressTime < -START_TAP_GRACE_MS)) return;
      
            if (validKeys.includes(key)) {
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
                    minHeight: windowMinHeight,
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
                            onOpenLatencyTest={() => setGameState('latencyTest')}
                            latencyCompMs={latencyCompMs}
                            bpm={bpm}
                            setBpm={setBpm}
                            measures={measures}
                            setMeasures={setMeasures}
                            beatsPerMeasure={beatsPerMeasure}
                            setBeatsPerMeasure={setBeatsPerMeasure}
                        />
                    )}

                    {gameState === 'latencyTest' && (
                        <LatencyTestPhase
                            onClose={() => setGameState('setup')}
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