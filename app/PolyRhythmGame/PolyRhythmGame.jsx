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
const MIN_ALLOWED_NEGATIVE_LATENCY_MS = 0;
const END_TAP_GRACE_MS = AUTO_LATENCY_SAMPLE_MAX_MS + 100;
const END_TAP_BASE_BUFFER_MS = 220;
const BEAT_ACCENT_TONE_HZ = 1175;
const BEAT_PULSE_TONE_HZ = 988;
const RHYTHM_TONES_HZ = [880, 740, 659, 587, 523];

const GAME_TUNING = {
    input: {
        dedupWindowMs: 24, // Minimum time between taps to be considered separate
        recentTrackClaimWindowMs: 45 // How long after a tap the claimed track is protected from being claimed by other taps (for better multi-touch support)
    },
    scoring: {
        beatHitWindowMultiplier: 0.42,
        extraTapPenaltyWeight: 0.32,
        timingWeight: 0.80,
        coverageWeight: 0.14,
        precisionWeight: 0.06,
        finalScoreExponent: 0.95,
        finalScoreScale: 10
    }
};

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


const distanceSquared = (ax, ay, bx, by) => {
    const dx = ax - bx;
    const dy = ay - by;
    return (dx * dx) + (dy * dy);
};

const getPointCentroid = (points) => {
    if (!points.length) return { x: 0, y: 0 };

    const totals = points.reduce((accumulator, point) => ({
        x: accumulator.x + point.x,
        y: accumulator.y + point.y
    }), { x: 0, y: 0 });

    return {
        x: totals.x / points.length,
        y: totals.y / points.length
    };
};

const selectInitialClusterCenters = (points, clusterCount) => {
    if (!points.length || clusterCount <= 0) return [];

    const centers = [];
    const selectedIndices = new Set();
    const centroid = getPointCentroid(points);

    let firstIndex = 0;
    let smallestDistance = Infinity;

    points.forEach((point, index) => {
        const dist = distanceSquared(point.x, point.y, centroid.x, centroid.y);
        if (dist < smallestDistance) {
            smallestDistance = dist;
            firstIndex = index;
        }
    });

    centers.push({ ...points[firstIndex] });
    selectedIndices.add(firstIndex);

    while (centers.length < clusterCount) {
        let candidateIndex = -1;
        let candidateDistance = -1;

        points.forEach((point, index) => {
            if (selectedIndices.has(index)) return;

            const nearestDistance = centers.reduce((nearest, center) => Math.min(
                nearest,
                distanceSquared(point.x, point.y, center.x, center.y)
            ), Infinity);

            if (
                nearestDistance > candidateDistance ||
                (nearestDistance === candidateDistance && candidateIndex > index)
            ) {
                candidateDistance = nearestDistance;
                candidateIndex = index;
            }
        });

        if (candidateIndex === -1) {
            centers.push({ ...centers[centers.length - 1] });
            continue;
        }

        centers.push({ ...points[candidateIndex] });
        selectedIndices.add(candidateIndex);
    }

    return centers;
};

const runKMeansClustering = (points, clusterCount, maxIterations = 24, epsilon = 0.02) => {
    if (!points.length || clusterCount <= 0) {
        return {
            centers: [],
            assignments: [],
            counts: []
        };
    }

    const usableClusterCount = Math.min(clusterCount, points.length);
    let centers = selectInitialClusterCenters(points, usableClusterCount);
    let assignments = new Array(points.length).fill(0);

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
        let changedAssignments = false;

        points.forEach((point, pointIndex) => {
            let closestCluster = 0;
            let closestDistance = Infinity;

            centers.forEach((center, clusterIndex) => {
                const currentDistance = distanceSquared(point.x, point.y, center.x, center.y);
                if (currentDistance < closestDistance) {
                    closestDistance = currentDistance;
                    closestCluster = clusterIndex;
                }
            });

            if (assignments[pointIndex] !== closestCluster) {
                assignments[pointIndex] = closestCluster;
                changedAssignments = true;
            }
        });

        const nextCenters = centers.map((center, clusterIndex) => {
            const clusterPoints = points.filter((_, pointIndex) => assignments[pointIndex] === clusterIndex);
            if (clusterPoints.length === 0) {
                return null;
            }

            const totals = clusterPoints.reduce((accumulator, point) => ({
                x: accumulator.x + point.x,
                y: accumulator.y + point.y
            }), { x: 0, y: 0 });

            return {
                x: totals.x / clusterPoints.length,
                y: totals.y / clusterPoints.length
            };
        });

        const emptyClusters = nextCenters
            .map((center, clusterIndex) => (center === null ? clusterIndex : null))
            .filter((clusterIndex) => clusterIndex !== null);

        if (emptyClusters.length > 0) {
            const occupiedCenters = nextCenters.filter(Boolean);

            emptyClusters.forEach((clusterIndex) => {
                let replacementIndex = 0;
                let furthestDistance = -1;

                points.forEach((point, pointIndex) => {
                    if (assignments[pointIndex] === clusterIndex) return;

                    const nearestDistance = occupiedCenters.length > 0
                        ? occupiedCenters.reduce((nearest, center) => Math.min(
                            nearest,
                            distanceSquared(point.x, point.y, center.x, center.y)
                        ), Infinity)
                        : 0;

                    if (nearestDistance > furthestDistance) {
                        furthestDistance = nearestDistance;
                        replacementIndex = pointIndex;
                    }
                });

                nextCenters[clusterIndex] = { ...points[replacementIndex] };
            });
        }

        const centerShift = nextCenters.reduce((largestShift, center, clusterIndex) => {
            if (!center || !centers[clusterIndex]) return largestShift;

            return Math.max(
                largestShift,
                Math.sqrt(distanceSquared(
                    centers[clusterIndex].x,
                    centers[clusterIndex].y,
                    center.x,
                    center.y
                ))
            );
        }, 0);

        centers = nextCenters.map((center) => center || { ...points[0] });

        if (!changedAssignments || centerShift <= epsilon) {
            break;
        }
    }

    const counts = new Array(centers.length).fill(0);
    assignments.forEach((clusterIndex) => {
        counts[clusterIndex] = (counts[clusterIndex] || 0) + 1;
    });

    return {
        centers,
        assignments,
        counts
    };
};

const buildClusterTrackMatrix = ({ clusterEntries, expectedTaps, tracks, measureDuration }) => {
    return clusterEntries.map((clusterEntry) => tracks.map((track) => {
        const expectedCount = expectedTaps.filter(e => e.trackId === track.id).length || 1;
        const pulseDuration = measureDuration / Math.max(1, track.pulses || 1);
        const baseToleranceMs = Math.max(35, pulseDuration * 0.35); // Leicht erhöhte Toleranz

        let bestF1Score = 0;
        let bestAvgErrorMs = Infinity;
        let bestInToleranceCount = 0;

        const testShifts = [-250, -150, -75, 0, 75, 150, 250];

        testShifts.forEach(shiftMs => {
            let inToleranceCount = 0;
            let fitSum = 0;
            let errorSum = 0;

            clusterEntry.taps.forEach((tap) => {
                const adjustedTime = tap.time - shiftMs;
                const timeInMeasure = ((adjustedTime % measureDuration) + measureDuration) % measureDuration;
                const phaseInPulse = timeInMeasure % pulseDuration;
                const distanceToPulse = Math.min(phaseInPulse, pulseDuration - phaseInPulse);

                errorSum += distanceToPulse;
                if (distanceToPulse <= baseToleranceMs) {
                    inToleranceCount += 1;
                    fitSum += 1 - (distanceToPulse / baseToleranceMs);
                }
            });

            const tapCount = clusterEntry.taps.length || 1;
            const precisionFit = fitSum / tapCount;
            const recallFit = fitSum / expectedCount;
            const f1Score = (precisionFit + recallFit > 0)
                ? (2 * precisionFit * recallFit) / (precisionFit + recallFit)
                : 0;
            const avgErrorMs = errorSum / tapCount;

            if (f1Score > bestF1Score || (f1Score === bestF1Score && avgErrorMs < bestAvgErrorMs)) {
                bestF1Score = f1Score;
                bestAvgErrorMs = avgErrorMs;
                bestInToleranceCount = inToleranceCount;
            }
        });

        const tapCount = clusterEntry.taps.length || 1;
        return {
            trackId: track.id,
            trackKey: track.key || '',
            inToleranceCount: bestInToleranceCount,
            hitRatio: bestInToleranceCount / tapCount,
            rhythmFit: bestF1Score,
            avgErrorMs: bestAvgErrorMs,
            score: bestF1Score
        };
    }));
};

const mapClustersToTracksBySupport = ({ clusterEntries, expectedTaps, tracks, measureDuration }) => {
    if (!clusterEntries.length || !tracks.length) {
        return {
            clusterToTrack: new Map(),
            matrix: [],
            orderedClusters: [],
            bestScore: -Infinity,
            evaluatedAssignments: []
        };
    }

    const activeClusterEntries = clusterEntries.filter((entry) => entry.taps.length > 0);
    if (activeClusterEntries.length === 0) {
        return {
            clusterToTrack: new Map(),
            matrix: [],
            orderedClusters: [],
            bestScore: -Infinity,
            evaluatedAssignments: []
        };
    }

    const orderedClusters = [...activeClusterEntries].sort((left, right) => left.index - right.index);

    const scoreTable = buildClusterTrackMatrix({
        clusterEntries: orderedClusters,
        expectedTaps,
        tracks,
        measureDuration
    });
    const assignedClusters = new Set();
    const assignedTracks = new Set();
    const assignment = new Map();
    const selectedPairs = [];
    let bestScore = 0;

    while (assignedClusters.size < orderedClusters.length && assignedTracks.size < tracks.length) {
        let bestCandidate = null;

        for (let clusterPosition = 0; clusterPosition < orderedClusters.length; clusterPosition += 1) {
            if (assignedClusters.has(clusterPosition)) continue;

            for (let trackIndex = 0; trackIndex < tracks.length; trackIndex += 1) {
                if (assignedTracks.has(trackIndex)) continue;

                const cell = scoreTable[clusterPosition]?.[trackIndex];
                if (!cell || !Number.isFinite(cell.score)) continue;

                if (!bestCandidate || cell.score > bestCandidate.score) {
                    bestCandidate = {
                        clusterPosition,
                        trackIndex,
                        score: cell.score,
                        inToleranceCount: cell.inToleranceCount,
                        avgErrorMs: cell.avgErrorMs
                    };
                    continue;
                }

                if (cell.score === bestCandidate.score) {
                    const betterSupport = (cell.inToleranceCount || 0) > (bestCandidate.inToleranceCount || 0);
                    const betterTiming = Number.isFinite(cell.avgErrorMs)
                        && Number.isFinite(bestCandidate.avgErrorMs)
                        && cell.avgErrorMs < bestCandidate.avgErrorMs;
                    const betterClusterOrder = clusterPosition < bestCandidate.clusterPosition;
                    const betterTrackOrder = trackIndex < bestCandidate.trackIndex;
                    if (betterSupport || betterTiming || ((cell.inToleranceCount === bestCandidate.inToleranceCount) && (betterClusterOrder || betterTrackOrder))) {
                        bestCandidate = {
                            clusterPosition,
                            trackIndex,
                            score: cell.score,
                            inToleranceCount: cell.inToleranceCount,
                            avgErrorMs: cell.avgErrorMs
                        };
                    }
                }
            }
        }

        if (!bestCandidate) break;

        const cluster = orderedClusters[bestCandidate.clusterPosition];
        const track = tracks[bestCandidate.trackIndex];
        assignment.set(cluster.index, {
            trackId: track.id,
            trackKey: track.key || ''
        });

        assignedClusters.add(bestCandidate.clusterPosition);
        assignedTracks.add(bestCandidate.trackIndex);
        selectedPairs.push(bestCandidate);
        bestScore += bestCandidate.score;
    }

    return {
        clusterToTrack: assignment,
        matrix: scoreTable,
        orderedClusters,
        bestScore,
        evaluatedAssignments: selectedPairs
    };
};

const clusterMobileTapsForScoring = (actualTaps, expectedTaps, tracks, measureDuration) => {
    const mobileEntries = [];

    actualTaps.forEach((tap, index) => {
        if (Number.isFinite(tap.tapX) && Number.isFinite(tap.tapY)) {
            mobileEntries.push({
                ...tap,
                sourceIndex: index,
                x: tap.tapX,
                y: tap.tapY
            });
        }
    });

    if (mobileEntries.length === 0 || tracks.length === 0) {
        return {
            taps: actualTaps,
            debug: {
                mobileEntries,
                centers: [],
                assignments: [],
                clusterEntries: [],
                clusterToTrack: new Map(),
                trackLayout: {}
            }
        };
    }

    const clusterCount = Math.min(tracks.length, mobileEntries.length);
    const points = mobileEntries.map((entry) => ({ x: entry.x, y: entry.y }));
    const { centers, assignments } = runKMeansClustering(points, clusterCount);
    const clusterEntries = centers.map((center, clusterIndex) => ({
        index: clusterIndex,
        center,
        taps: mobileEntries.filter((_, mobileEntryIndex) => assignments[mobileEntryIndex] === clusterIndex)
    }));

    const mappingResult = mapClustersToTracksBySupport({
        clusterEntries,
        expectedTaps,
        tracks,
        measureDuration
    });
    const clusterToTrack = mappingResult.clusterToTrack;

    const clusteredTaps = actualTaps.map((tap, index) => {
        if (!Number.isFinite(tap.tapX) || !Number.isFinite(tap.tapY)) {
            return tap;
        }

        const mobileEntryIndex = mobileEntries.findIndex((entry) => entry.sourceIndex === index);
        if (mobileEntryIndex === -1) return tap;

        const clusterIndex = assignments[mobileEntryIndex];
        const mappedTrack = clusterToTrack.get(clusterIndex);
        if (!mappedTrack) return tap;

        return {
            ...tap,
            originalKey: tap.originalKey || tap.key,
            key: mappedTrack.trackKey,
            clusterIndex,
            clusterTrackId: mappedTrack.trackId
        };
    });

    return {
        taps: clusteredTaps,
        debug: {
            mobileEntries,
            centers,
            assignments,
            clusterEntries,
            clusterToTrack,
            matrix: mappingResult.matrix,
            orderedClusters: mappingResult.orderedClusters,
            bestScore: mappingResult.bestScore,
            evaluatedAssignments: mappingResult.evaluatedAssignments,
            trackLayout: {}
        }
    };
};

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
    const isGameplayActive = gameState === 'countIn' || gameState === 'playing';
    const isMobileLayoutEnabled = isClientReady && isTouchPreferred;

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
    const audioCtxRef = useRef(null);
    const activeAudioNodesRef = useRef([]);
    const detailedResultsRef = useRef([]); 
    const timeoutsRef = useRef([]); 
    const activePointerToKeyRef = useRef(new Map());
    const keyPressCountRef = useRef(new Map());
    const touchFallbackPressIdRef = useRef(0);
    const lastTouchInteractionAtRef = useRef(0);
    const recentMobileTapSignatureRef = useRef([]);

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

        if (gameState !== 'playing' && gameState !== 'countIn') return false;

        const validKeys = tracks
            .map((track) => normalizeInputKey(track.key || ''))
            .filter(Boolean);
        if (!validKeys.includes(key)) return false;

        const pressTime = performance.now() - startTimeRef.current;
        if (gameState !== 'playing' && pressTime < -START_TAP_GRACE_MS) return false;

        // Deduplication: check if an identical tap (same key) was registered within the configured window.
        const DEDUP_WINDOW_MS = GAME_TUNING.input.dedupWindowMs;
        const recentSameKeyTap = actualTapsRef.current.find(
            (tap) => tap.key === key && Math.abs(tap.time - pressTime) < DEDUP_WINDOW_MS
        );

        if (recentSameKeyTap) {
            // Duplicate detected, skip it
            return false;
        }

        actualTapsRef.current.push({
            key,
            time: pressTime,
            ...(tapData || {})
        });
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
        if (gameState !== 'playing' && gameState !== 'countIn') return false;
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
        if (gameState !== 'playing' && gameState !== 'countIn') return;

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
        if (gameState !== 'playing' && gameState !== 'countIn') return;

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

    // Mobile free-tap touch end handler
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
        if (gameState !== 'playing' && gameState !== 'countIn') return;

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
        recentMobileTapSignatureRef.current = [];
        setDebugAnalysis(null);
        clearInputVisualState();
        setGameState('setup');
    };

    const endGame = () => {
        setGameState('result');
        calculateScore();
    };

    const calculateScore = () => {
        const expected = expectedTapsRef.current;
        const beatDurationMs = measureDuration / Math.max(1, beatsPerMeasure);
        const currentLatencyCompMs = clamp(
            normalizeLatencyMs(latencyCompMs, beatDurationMs),
            MIN_ALLOWED_NEGATIVE_LATENCY_MS,
            MAX_LATENCY_COMP_MS
        );
        const hasSpatialTapData = actualTapsRef.current.some((tap) => (
            Number.isFinite(tap.tapX) && Number.isFinite(tap.tapY)
        ));
        const shouldUseClusterMapping = isMobileLayoutEnabled || hasSpatialTapData;

        const clusteringResult = shouldUseClusterMapping
            ? clusterMobileTapsForScoring(actualTapsRef.current, expected, tracks, measureDuration)
            : { taps: actualTapsRef.current, debug: null };
        const scoringActualTaps = clusteringResult.taps;

        const scoreWithCorrection = (correctionMs) => {
            let totalDeviation = 0;
            let maxAllowedDeviation = 0;
            const availableActualTaps = [...scoringActualTaps];
            const detailed = [];
            let matchedCount = 0;
            let missedCount = 0;

            expected.forEach(exp => {
                const track = tracks.find(t => t.id === exp.trackId);
                const maxErrorForBeat = (measureDuration / track.pulses) * GAME_TUNING.scoring.beatHitWindowMultiplier;
                maxAllowedDeviation += maxErrorForBeat;

                const matchingTaps = availableActualTaps.filter(act => act.key === exp.key);

                if (matchingTaps.length === 0) {
                    totalDeviation += maxErrorForBeat;
                    missedCount += 1;
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
                    matchedCount += 1;
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
                    missedCount += 1;
                    detailed.push({ ...exp, actualTime: null, diff: null });
                }
            });

            const extraTaps = availableActualTaps.filter(act => {
                const lastExpectedTime = expected.length > 0 
                    ? Math.max(...expected.map(e => e.time))
                    : 0;
                
                if (act.time > lastExpectedTime && act.time <= lastExpectedTime + END_TAP_GRACE_MS) {
                    return false;
                }
                
                const track = tracks.find(t => t.key === act.key);
                if (track) {
                    const maxErrorForBeat = (measureDuration / track.pulses) * GAME_TUNING.scoring.beatHitWindowMultiplier;
                    
                    if (act.time < -maxErrorForBeat) {
                        return false; 
                    }
                }
                
                return tracks.some(t => t.key === act.key);
            });

            const avgMaxError = expected.length > 0 ? (maxAllowedDeviation / expected.length) : 200;
            const extraTapPenaltyWeight = GAME_TUNING.scoring.extraTapPenaltyWeight;
            totalDeviation += extraTaps.length * (avgMaxError * extraTapPenaltyWeight);

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
                detailed,
                matchedCount,
                missedCount,
                extraCount: extraTaps.length
            };
        };

        const matchedResults = buildAutoLatencySamples({
            expectedTaps: expected,
            actualTaps: scoringActualTaps
        });

        const candidateCorrections = new Set();
        candidateCorrections.add(currentLatencyCompMs);
        candidateCorrections.add(0);

        const hintCorrectionMs = estimateAutoLatencyCorrectionMs({
            matchedResults,
            tracks,
            measureDuration
        });
        if (Number.isFinite(hintCorrectionMs)) {
            candidateCorrections.add(clamp(hintCorrectionMs, MIN_ALLOWED_NEGATIVE_LATENCY_MS, MAX_AUTO_CORRECTION_MS));
        }

        const fallbackCorrectionMs = estimateFallbackAutoLatencyMs(matchedResults);
        if (Number.isFinite(fallbackCorrectionMs)) {
            candidateCorrections.add(clamp(fallbackCorrectionMs, MIN_ALLOWED_NEGATIVE_LATENCY_MS, MAX_AUTO_CORRECTION_MS));
        }

        for (let correction = MIN_ALLOWED_NEGATIVE_LATENCY_MS; correction <= MAX_AUTO_CORRECTION_MS; correction += 5) {
            candidateCorrections.add(correction);
        }

        let bestScoring = null;
        let bestCorrectionMs = currentLatencyCompMs;
        let bestFinalScore = -Infinity;

        candidateCorrections.forEach((candidateCorrectionMs) => {
            const normalizedCandidateCorrectionMs = clamp(
                normalizeLatencyMs(candidateCorrectionMs, beatDurationMs),
                MIN_ALLOWED_NEGATIVE_LATENCY_MS,
                MAX_LATENCY_COMP_MS
            );

            const candidateScoring = scoreWithCorrection(normalizedCandidateCorrectionMs);
            const timingQuality = candidateScoring.maxAllowedDeviation > 0
                ? 1 - (candidateScoring.totalDeviation / candidateScoring.maxAllowedDeviation)
                : 0;
            const coverage = expected.length > 0 ? candidateScoring.matchedCount / expected.length : 0;
            const precision = (candidateScoring.matchedCount + candidateScoring.extraCount) > 0
                ? candidateScoring.matchedCount / (candidateScoring.matchedCount + candidateScoring.extraCount)
                : 0;

            const blendedQuality =
                (clamp(timingQuality, 0, 1) * GAME_TUNING.scoring.timingWeight) +
                (clamp(coverage, 0, 1) * GAME_TUNING.scoring.coverageWeight) +
                (clamp(precision, 0, 1) * GAME_TUNING.scoring.precisionWeight);
            const candidateFinalScore = Math.pow(clamp(blendedQuality, 0, 1), GAME_TUNING.scoring.finalScoreExponent) * GAME_TUNING.scoring.finalScoreScale;

            const isBetterScore = candidateFinalScore > bestFinalScore + 0.0001;
            const isSameScoreButCloser = Math.abs(candidateFinalScore - bestFinalScore) <= 0.0001
                && Math.abs(normalizedCandidateCorrectionMs - currentLatencyCompMs) < Math.abs(bestCorrectionMs - currentLatencyCompMs);

            if (isBetterScore || isSameScoreButCloser) {
                bestFinalScore = candidateFinalScore;
                bestCorrectionMs = normalizedCandidateCorrectionMs;
                bestScoring = candidateScoring;
            }
        });

        const updatedLatencyCompMs = bestCorrectionMs;
        setLastAutoCorrectionMs(updatedLatencyCompMs - currentLatencyCompMs);
        setLatencyCompMs(updatedLatencyCompMs);

        let scoring = bestScoring || scoreWithCorrection(updatedLatencyCompMs);

        detailedResultsRef.current = scoring.detailed;
        setDetailedResults(scoring.detailed);
        setDebugAnalysis({
            isMobile: shouldUseClusterMapping,
            rawTaps: actualTapsRef.current,
            clusteredTaps: scoringActualTaps,
            clustering: clusteringResult.debug,
            currentLatencyCompMs,
            selectedLatencyCompMs: updatedLatencyCompMs,
            lastAutoCorrectionMs: updatedLatencyCompMs - currentLatencyCompMs,
            candidateCorrections: [...candidateCorrections].sort((left, right) => left - right),
            expectedTaps: expected
        });

        const timingQuality = scoring.maxAllowedDeviation > 0
            ? 1 - (scoring.totalDeviation / scoring.maxAllowedDeviation)
            : 0;
        const coverage = expected.length > 0 ? scoring.matchedCount / expected.length : 0;
        const precision = (scoring.matchedCount + scoring.extraCount) > 0
            ? scoring.matchedCount / (scoring.matchedCount + scoring.extraCount)
            : 0;

        // Timing Quality: distance of taps from expected beats
        // Coverage: how many expected beats were hit
        // Precision: how many extra taps were there compared to matched taps
        const blendedQuality =
            (clamp(timingQuality, 0, 1) * GAME_TUNING.scoring.timingWeight) +
            (clamp(coverage, 0, 1) * GAME_TUNING.scoring.coverageWeight) +
            (clamp(precision, 0, 1) * GAME_TUNING.scoring.precisionWeight);

        const easedQuality = Math.pow(clamp(blendedQuality, 0, 1), GAME_TUNING.scoring.finalScoreExponent);
        const finalScore = easedQuality * GAME_TUNING.scoring.finalScoreScale;

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

        return () => {
            orientationQuery.removeEventListener('change', updateDeviceProfile);
            coarsePointerQuery.removeEventListener('change', updateDeviceProfile);
        };
    }, []);

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