import { clamp, estimateCalibrationMs } from "./mathHelpers";
import { SCORING_CONFIG } from "../constants/gameConfig";

export const analyzeSession = ({ taps, beatMs, actualActiveMs, silentBars, returnBars }) => {
    if (!taps || taps.length === 0) return null;

    const calibrationMs = estimateCalibrationMs(taps, beatMs, actualActiveMs);

    const correctedTaps = taps.map(tap => ({
        rawTime: tap.time,
        correctedTime: tap.time - calibrationMs
    }));

    const silenceStartGridMs = Math.round(actualActiveMs / beatMs) * beatMs;
    
    const silentMs = silentBars * 4 * beatMs;
    const returnMs = returnBars * 4 * beatMs;
    const sessionEndGridMs = silenceStartGridMs + silentMs + returnMs;

    const firstTapGridMs = Math.round(correctedTaps[0].correctedTime / beatMs) * beatMs;
    const uiStartMs = Math.max(0, firstTapGridMs); 
    
    const expectedBeats = [];
    for (let t = 0; t <= sessionEndGridMs + 0.001; t += beatMs) {
        expectedBeats.push(t);
    }

    const pairs = expectedBeats.map((expectedTime, index) => ({
        expectedIndex: index,
        expectedTime,
        correctedTime: null,
        deltaMs: null,
        phase: expectedTime < silenceStartGridMs - 0.1 ? 'listening' 
            : expectedTime < silenceStartGridMs + silentMs + 0.1 ? 'silence' 
                : 'return',
        missed: true
    }));

    const extraTaps = [];
    
    let currentGridIndex = pairs.findIndex(p => Math.abs(p.expectedTime - correctedTaps[0].correctedTime) <= beatMs / 2);
    
    if (currentGridIndex === -1) {
        let closestIndex = Math.round(correctedTaps[0].correctedTime / beatMs);
        if (isNaN(closestIndex)) closestIndex = 0; 
        
        currentGridIndex = Math.max(0, Math.min(closestIndex, pairs.length - 1));
    }

    if (!pairs || pairs.length === 0 || !pairs[currentGridIndex]) {
        return null;
    }

    pairs[currentGridIndex].correctedTime = correctedTaps[0].correctedTime;
    pairs[currentGridIndex].deltaMs = correctedTaps[0].correctedTime - pairs[currentGridIndex].expectedTime;
    pairs[currentGridIndex].missed = false;

    let lastValidGridIndex = currentGridIndex;
    let lastValidTime = correctedTaps[0].correctedTime;

    for (let i = 1; i < correctedTaps.length; i++) {
        const tapTime = correctedTaps[i].correctedTime;
        const interval = tapTime - lastValidTime;
        const ratio = interval / beatMs;
        
        let steps = Math.round(ratio);
        let isExtraTap = false;

        if (steps === 0) {
            isExtraTap = true;
        } 

        else {
            const distanceToGrid = Math.abs(ratio - steps);

            if (distanceToGrid > 0.25 && (i + 1) < correctedTaps.length) {
                const nextTapTime = correctedTaps[i + 1].correctedTime;
                const nextRatio = (nextTapTime - lastValidTime) / beatMs;
                const nextDistance = Math.abs(nextRatio - steps);
                
                if (nextDistance < distanceToGrid) {
                    isExtraTap = true;
                }
            }
        }

        if (isExtraTap) {
            extraTaps.push(correctedTaps[i]);
        } else {
            lastValidGridIndex += steps; 
            lastValidTime = tapTime;

            if (lastValidGridIndex < pairs.length) {
                pairs[lastValidGridIndex].correctedTime = tapTime;
                pairs[lastValidGridIndex].deltaMs = tapTime - pairs[lastValidGridIndex].expectedTime;
                pairs[lastValidGridIndex].missed = false;
            } else {
                extraTaps.push(correctedTaps[i]);
            }
        }
    }

    const intervals =  [];
    for (let i = 1; i < pairs.length; i++) {
        const current = pairs[i];
        const prev = pairs[i - 1];
        if (!current.missed && !prev.missed) {
            const expectedInterval = current.expectedTime - prev.expectedTime;
            const actualInterval = current.correctedTime - prev.correctedTime;
            intervals.push({
                deltaMs: actualInterval - expectedInterval,
                phase: (current.phase === 'silence' && prev.phase === 'silence') ? 'silence' : 'other'
            });
        }
    }

    const expectedSilenceBeats = pairs.filter(p => p.phase === 'silence');
    const silencePairs = expectedSilenceBeats.filter(p => !p.missed);
    const silenceIntervals = intervals.filter(i => i.phase === 'silence');

    let driftSlope = 0;
    if (silencePairs.length > 1) {
        const n = silencePairs.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
        silencePairs.forEach((p, i) => {
            sumX += i;
            sumY += p.deltaMs;
            sumXY += i * p.deltaMs;
            sumXX += i * i;
        });
        driftSlope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    }

    let tempoTrend = 'steady';
    if (driftSlope > 1.5) tempoTrend = 'slowing_down';
    else if (driftSlope < -1.5) tempoTrend = 'speeding_up';
    else if (Math.abs(driftSlope) > 0.5) tempoTrend = 'wobbly';
    
    const missedSilenceBeats = silencePairs.length > 0 
        ? expectedSilenceBeats.filter(p => p.missed && p.expectedTime < silencePairs[silencePairs.length - 1].expectedTime).length 
        : expectedSilenceBeats.length;
    const extraSilenceTaps = extraTaps.filter(t => 
        t.correctedTime >= silenceStartGridMs && t.correctedTime < silenceStartGridMs + silentMs
    ).length;
    const totalFaults = missedSilenceBeats + extraSilenceTaps;

    const averageAbsOffsetMs = silencePairs.length > 0 
        ? silencePairs.reduce((sum, p) => sum + Math.abs(p.deltaMs), 0) / silencePairs.length : 0;

    // JITTER
    let sumRawDiff = 0;
    let sumEffectiveDiff = 0;
    let consecutiveDiffCount = 0;

    const perfectConsistencyThresholdMs = beatMs * SCORING_CONFIG.perfectConsistencyThresholdPct;

    for (let i = 1; i < silenceIntervals.length; i++) {
        let diff = Math.abs(silenceIntervals[i].deltaMs - silenceIntervals[i - 1].deltaMs);
        sumRawDiff += diff; 
        sumEffectiveDiff += Math.max(0, diff - perfectConsistencyThresholdMs); 
        consecutiveDiffCount++;
    }

    const jitterMs = consecutiveDiffCount > 0 ? (sumRawDiff / consecutiveDiffCount) : 0;
    const effectiveJitterMs = consecutiveDiffCount > 0 ? (sumEffectiveDiff / consecutiveDiffCount) : 0;

    const penaltyPerFault =  (100 / Math.max(1, expectedSilenceBeats.length)) * SCORING_CONFIG.faultPenaltyMultiplier;

    let leniencyMultiplier = 1.0;
    const totalSilenceBeats = expectedSilenceBeats.length;
    if (totalSilenceBeats > SCORING_CONFIG.baseSilenceBeats) {
        const extraBeats = totalSilenceBeats - SCORING_CONFIG.baseSilenceBeats;
        leniencyMultiplier += SCORING_CONFIG.leniencyFactor * Math.pow(extraBeats, 2);
    }

    let generalAccuracyRaw = 100;
    const accuracyInflectionMs = (beatMs * SCORING_CONFIG.accuracyInflectionPct) * leniencyMultiplier; 
    
    const perfectAccuracyThresholdMs = beatMs * SCORING_CONFIG.perfectAccuracyThresholdPct;
    const effectiveOffsetMs = Math.max(0, averageAbsOffsetMs - perfectAccuracyThresholdMs);

    const accuracyLinearDropMs = beatMs * SCORING_CONFIG.accuracyLinearDropPct;
    if (effectiveOffsetMs > 0) {
        generalAccuracyRaw = 100 / (1 + Math.pow(effectiveOffsetMs / accuracyInflectionMs, SCORING_CONFIG.accuracySteepness) + (effectiveOffsetMs / accuracyLinearDropMs));
    }

    // DOWNBEAT ACCURACY ---
    const downbeatPair = pairs.find(p => Math.abs(p.expectedTime - (silenceStartGridMs + silentMs)) < 1);
    let downbeatAccuracyRaw = 0;
    let downbeatOffsetMs = beatMs; 
    let effectiveDownbeatOffsetMs = beatMs;
    
    if (downbeatPair) {
        if (!downbeatPair.missed) {
            downbeatOffsetMs = Math.abs(downbeatPair.deltaMs);
        }
        
        effectiveDownbeatOffsetMs = Math.max(0, downbeatOffsetMs - perfectAccuracyThresholdMs);
        
        const maxDownbeatError = Math.max(1, beatMs - perfectAccuracyThresholdMs); 
        
        downbeatAccuracyRaw = 100 * (1 - (effectiveDownbeatOffsetMs / maxDownbeatError));
        downbeatAccuracyRaw = clamp(downbeatAccuracyRaw, 0, 100);
        
    } else {
        downbeatAccuracyRaw = generalAccuracyRaw; 
        downbeatOffsetMs = averageAbsOffsetMs;
        effectiveDownbeatOffsetMs = effectiveOffsetMs;
    }

    const generalWeight = 1.0 - SCORING_CONFIG.downbeatAccuracyWeight;
    let accuracyRaw = (generalAccuracyRaw * generalWeight) + (downbeatAccuracyRaw * SCORING_CONFIG.downbeatAccuracyWeight);

    // --- CONSISTENCY BERECHNUNG ---
    let consistencyRawBeforePenalty = 0;
    const consistencyInflectionMs = (beatMs * SCORING_CONFIG.consistencyInflectionPct);
    const consistencyLinearDropMs = beatMs * SCORING_CONFIG.consistencyLinearDropPct;
    
    if (effectiveJitterMs > 0) {
        consistencyRawBeforePenalty = 100 / (1 + Math.pow(effectiveJitterMs / consistencyInflectionMs, SCORING_CONFIG.consistencySteepness) + (effectiveJitterMs / consistencyLinearDropMs));
    } else {
        consistencyRawBeforePenalty = 100;
    }
    
    let consistencyRaw = clamp(consistencyRawBeforePenalty - (totalFaults * penaltyPerFault), 0, 100);

    const accuracyScore = ((Math.round(accuracyRaw)) / 10).toFixed(1);
    const consistencyScore = expectedSilenceBeats.length > 0 && silencePairs.length === 0 
        ? 0 
        : ((Math.round(consistencyRaw)) / 10).toFixed(1);
    
    const finalScore = ((consistencyScore * SCORING_CONFIG.weightConsistency) + (accuracyScore * SCORING_CONFIG.weightAccuracy)).toFixed(1);

    const missedBeats = silencePairs.length > 0
        ? pairs.filter(p => p.missed && p.phase === 'silence' && p.expectedTime < silencePairs[silencePairs.length - 1].expectedTime).map(p => p.expectedTime)
        : pairs.filter(p => p.missed && p.phase === 'silence').map(p => p.expectedTime);

    const earlyLateThresholdMs = beatMs * SCORING_CONFIG.earlyLateThresholdPct;

    return {
        calibrationMs, beatMs, 
        uiStartMs, uiTotalMs: sessionEndGridMs, 
        uiSilenceStartMs: silenceStartGridMs, uiSilenceEndMs: silenceStartGridMs + silentMs,
        expectedBeats: expectedBeats.map(b => b), 
        pairs, 
        averageOffsetMs: silencePairs.length > 0 ? silencePairs.reduce((sum, p) => sum + p.deltaMs, 0) / silencePairs.length : 0, 
        consistencyScore, accuracyScore, score: finalScore,
        earlyCount: silencePairs.filter((p) => p.deltaMs < -earlyLateThresholdMs).length,
        lateCount: silencePairs.filter((p) => p.deltaMs > earlyLateThresholdMs).length,
        totalFaults, extraTaps, missedBeats,
        tempoTrend, driftSlope,
        rawMath: {
            averageAbsOffsetMs, effectiveOffsetMs, accuracyInflectionMs, generalAccuracyRaw,
            downbeatOffsetMs, effectiveDownbeatOffsetMs, downbeatAccuracyRaw, accuracyRaw,
            jitterMs, effectiveJitterMs, consistencyInflectionMs, consistencyRawBeforePenalty,
            totalFaults, penaltyPerFault, leniencyMultiplier, earlyLateThresholdMs
        }
    };
};
