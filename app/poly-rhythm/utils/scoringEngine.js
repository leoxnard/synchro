import {
    MAX_LATENCY_COMP_MS,
    MIN_ALLOWED_NEGATIVE_LATENCY_MS,
    MAX_AUTO_CORRECTION_MS,
    END_TAP_GRACE_MS,
    GAME_TUNING
} from '../constants/gameConfig';

import {
    distanceSquared,
    getPointCentroid,
    clamp,
    normalizeLatencyMs,
} from './mathHelpers';

import { 
    buildAutoLatencySamples,
    estimateAutoLatencyCorrectionMs,
    estimateFallbackAutoLatencyMs,
} from './latencyAnalysis';

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

export const clusterMobileTapsForScoring = (actualTaps, expectedTaps, tracks, measureDuration) => {
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
export const computeFinalScore = ({
    expectedTaps,
    actualTaps,
    tracks,
    measureDuration,
    beatsPerMeasure,
    rawLatencyCompMs,
    isMobileLayoutEnabled
}) => {
    const beatDurationMs = measureDuration / Math.max(1, beatsPerMeasure);
    const currentLatencyCompMs = clamp(
        normalizeLatencyMs(rawLatencyCompMs, beatDurationMs),
        MIN_ALLOWED_NEGATIVE_LATENCY_MS,
        MAX_LATENCY_COMP_MS
    );
    const hasSpatialTapData = actualTaps.some((tap) => (
        Number.isFinite(tap.tapX) && Number.isFinite(tap.tapY)
    ));
    const shouldUseClusterMapping = isMobileLayoutEnabled || hasSpatialTapData;

    const clusteringResult = shouldUseClusterMapping
        ? clusterMobileTapsForScoring(actualTaps, expectedTaps, tracks, measureDuration)
        : { taps: actualTaps, debug: null };
    const scoringActualTaps = clusteringResult.taps;

    const scoreWithCorrection = (correctionMs) => {
        let totalDeviation = 0;
        let maxAllowedDeviation = 0;
        const availableActualTaps = [...scoringActualTaps];
        const detailed = [];
        let matchedCount = 0;
        let missedCount = 0;

        expectedTaps.forEach(exp => {
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
            const lastExpectedTime = expectedTaps.length > 0 
                ? Math.max(...expectedTaps.map(e => e.time))
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

        const avgMaxError = expectedTaps.length > 0 ? (maxAllowedDeviation / expectedTaps.length) : 200;
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
        expectedTaps: expectedTaps,
        actualTaps: scoringActualTaps
    });

    const candidateCorrections = new Set();
    candidateCorrections.add(currentLatencyCompMs);
    candidateCorrections.add(0);

    const hintCorrectionMs = estimateAutoLatencyCorrectionMs({
        matchedResults,
        tracks,
        measureDuration,
        beatsPerMeasure
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
        const coverage = expectedTaps.length > 0 ? candidateScoring.matchedCount / expectedTaps.length : 0;
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

    let scoring = bestScoring || scoreWithCorrection(updatedLatencyCompMs);

    const timingQuality = scoring.maxAllowedDeviation > 0
        ? 1 - (scoring.totalDeviation / scoring.maxAllowedDeviation)
        : 0;
    const coverage = expectedTaps.length > 0 ? scoring.matchedCount / expectedTaps.length : 0;
    const precision = (scoring.matchedCount + scoring.extraCount) > 0
        ? scoring.matchedCount / (scoring.matchedCount + scoring.extraCount)
        : 0;

    // Timing Quality: distance of taps from expectedTaps beats
    // Coverage: how many expectedTaps beats were hit
    // Precision: how many extra taps were there compared to matched taps
    const blendedQuality =
        (clamp(timingQuality, 0, 1) * GAME_TUNING.scoring.timingWeight) +
        (clamp(coverage, 0, 1) * GAME_TUNING.scoring.coverageWeight) +
        (clamp(precision, 0, 1) * GAME_TUNING.scoring.precisionWeight);

    const easedQuality = Math.pow(clamp(blendedQuality, 0, 1), GAME_TUNING.scoring.finalScoreExponent);
    const finalScore = easedQuality * GAME_TUNING.scoring.finalScoreScale;

    return {
        score: Math.max(0, finalScore.toFixed(1)),
        detailedResults: scoring.detailed,
        debugAnalysis: {
            isMobile: shouldUseClusterMapping,
            rawTaps: actualTaps,
            clusteredTaps: scoringActualTaps,
            clustering: clusteringResult.debug,
            currentLatencyCompMs,
            selectedLatencyCompMs: updatedLatencyCompMs,
            lastAutoCorrectionMs: updatedLatencyCompMs - currentLatencyCompMs,
            candidateCorrections: [...candidateCorrections].sort((left, right) => left - right),
            expectedTaps: expectedTaps
        },
        updatedLatencyCompMs,
        lastAutoCorrectionMs: updatedLatencyCompMs - currentLatencyCompMs
    };
};