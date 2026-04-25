import { clamp, estimateCalibrationMs } from "./mathHelpers";
import { SCORING_CONFIG } from "../constants/gameConfig";

export const analyzeSession = ({ taps, beatMs, actualActiveMs, silentBars, returnBars }) => {
    if (!taps || taps.length === 0) return null;

    const calibrationMs = estimateCalibrationMs(taps, beatMs, actualActiveMs);

    const correctedTaps = taps.map(tap => ({
        rawTime: tap.time,
        correctedTime: tap.time - calibrationMs
    }));

    const firstCorrectedTime = correctedTaps[0].correctedTime;
    const startGridMs = Math.round(firstCorrectedTime / beatMs) * beatMs;

    const correctedActiveMs = actualActiveMs - calibrationMs;
    const activeTimeMs = Math.round((correctedActiveMs - startGridMs) / beatMs) * beatMs;
    const silenceStartGridMs = startGridMs + activeTimeMs;
    
    const silentMs = silentBars * 4 * beatMs;
    const returnMs = returnBars * 4 * beatMs;
    const sessionEndGridMs = silenceStartGridMs + silentMs + returnMs;

    const uiStartMs = Math.max(startGridMs, silenceStartGridMs - (4 * beatMs));
    
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
            : expectedTime < silenceStartGridMs + silentMs - 0.1 ? 'silence' 
                : 'return',
        missed: true
    }));

    const extraTaps = [];
    
    let currentGridIndex = pairs.findIndex(p => Math.abs(p.expectedTime - correctedTaps[0].correctedTime) <= beatMs / 2);
    if (currentGridIndex === -1) currentGridIndex = 0;

    pairs[currentGridIndex].correctedTime = correctedTaps[0].correctedTime;
    pairs[currentGridIndex].deltaMs = correctedTaps[0].correctedTime - pairs[currentGridIndex].expectedTime;
    pairs[currentGridIndex].missed = false;

    let lastValidTime = correctedTaps[0].correctedTime;

    for (let i = 1; i < correctedTaps.length; i++) {
        const tapTime = correctedTaps[i].correctedTime;
        const interval = tapTime - lastValidTime;
        
        const ratio = interval / beatMs;
        let steps = 0;

        if (ratio < SCORING_CONFIG.extraTapThresholdPct) {
            steps = 0;
        } else if (ratio <= SCORING_CONFIG.missingTapThresholdPct) {
            steps = 1;
        } else {
            steps = Math.round(ratio); 
        }

        if (steps === 0) {
            extraTaps.push(correctedTaps[i]);
        } else {
            currentGridIndex += steps; 
            
            lastValidTime = tapTime; 

            if (currentGridIndex < pairs.length) {
                pairs[currentGridIndex].correctedTime = tapTime;
                pairs[currentGridIndex].deltaMs = tapTime - pairs[currentGridIndex].expectedTime;
                pairs[currentGridIndex].missed = false;
            }
        }
    }

    const intervals = [];
    for (let i = 1; i < pairs.length; i++) {
        const current = pairs[i];
        const prev = pairs[i - 1];
        if (!current.missed && !prev.missed) {
            const expectedInterval = current.expectedTime - prev.expectedTime;
            const actualInterval = current.correctedTime - prev.correctedTime;
            intervals.push({
                deltaMs: actualInterval - expectedInterval,
                phase: current.phase 
            });
        }
    }

    const expectedSilenceBeats = pairs.filter(p => p.phase === 'silence');
    const silencePairs = expectedSilenceBeats.filter(p => !p.missed);
    const silenceIntervals = intervals.filter(i => i.phase === 'silence');
    
    const missedSilenceBeats = silencePairs.length > 0 
        ? expectedSilenceBeats.filter(p => p.missed && p.expectedTime < silencePairs[silencePairs.length - 1].expectedTime).length 
        : expectedSilenceBeats.length;
    const extraSilenceTaps = extraTaps.filter(t => 
        t.correctedTime >= silenceStartGridMs && t.correctedTime < silenceStartGridMs + silentMs
    ).length;
    const totalFaults = missedSilenceBeats + extraSilenceTaps;

    const averageAbsOffsetMs = silencePairs.length > 0
        ? silencePairs.reduce((sum, p) => sum + Math.abs(p.deltaMs), 0) / silencePairs.length : 0;

    const averageIntervalDeltaMs = silenceIntervals.length > 0
        ? silenceIntervals.reduce((sum, i) => sum + i.deltaMs, 0) / silenceIntervals.length : 0;
    
    const varianceMs = silenceIntervals.length > 0
        ? silenceIntervals.reduce((sum, i) => sum + Math.pow(i.deltaMs - averageIntervalDeltaMs, 2), 0) / silenceIntervals.length : 0;
    const stdDeviationMs = Math.sqrt(Math.max(0, varianceMs));

    const penaltyPerFault = (100 / Math.max(1, expectedSilenceBeats.length)) * SCORING_CONFIG.faultPenaltyMultiplier;

    let leniencyMultiplier = 1.0;
    const totalSilenceBeats = expectedSilenceBeats.length;
    if (totalSilenceBeats > SCORING_CONFIG.baseSilenceBeats) {
        const extraBeats = totalSilenceBeats - SCORING_CONFIG.baseSilenceBeats;
        leniencyMultiplier += SCORING_CONFIG.leniencyFactor * Math.pow(extraBeats, 2);
    }

    let generalAccuracyRaw = 100;
    const accuracyInflectionMs = (beatMs * SCORING_CONFIG.accuracyInflectionPct) * leniencyMultiplier; 
    
    const effectiveOffsetMs = Math.max(0, averageAbsOffsetMs - SCORING_CONFIG.perfectAccuracyThresholdMs);

    if (effectiveOffsetMs > 0) {
        generalAccuracyRaw = 100 / (1 + Math.pow(effectiveOffsetMs / accuracyInflectionMs, SCORING_CONFIG.accuracySteepness) + (effectiveOffsetMs / SCORING_CONFIG.accuracyLinearDropMs));
    }

    // DOWNBEAT ACCURACY ---
    const downbeatPair = pairs.find(p => p.phase === 'return');
    let downbeatAccuracyRaw = 0;
    let downbeatOffsetMs = beatMs; 
    let effectiveDownbeatOffsetMs = beatMs;
    
    if (downbeatPair) {
        if (!downbeatPair.missed) {
            downbeatOffsetMs = Math.abs(downbeatPair.deltaMs);
        }
        
        effectiveDownbeatOffsetMs = Math.max(0, downbeatOffsetMs - SCORING_CONFIG.perfectAccuracyThresholdMs);
        
        const maxDownbeatError = Math.max(1, beatMs - SCORING_CONFIG.perfectAccuracyThresholdMs); 
        
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
    let effectiveStdDevMs = stdDeviationMs;
    
    if (silenceIntervals.length > 0) {
        effectiveStdDevMs = Math.max(0, stdDeviationMs - SCORING_CONFIG.perfectConsistencyThresholdMs);

        if (effectiveStdDevMs === 0) {
            consistencyRawBeforePenalty = 100;
        } else {
            consistencyRawBeforePenalty = 100 / (1 + Math.pow(effectiveStdDevMs / consistencyInflectionMs, SCORING_CONFIG.consistencySteepness) + (effectiveStdDevMs / SCORING_CONFIG.consistencyLinearDropMs));
        }
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

    return {
        calibrationMs, beatMs, 
        uiStartMs, uiTotalMs: sessionEndGridMs, 
        uiSilenceStartMs: silenceStartGridMs, uiSilenceEndMs: silenceStartGridMs + silentMs,
        expectedBeats: expectedBeats.map(b => b), 
        pairs, 
        averageOffsetMs: silencePairs.length > 0 ? silencePairs.reduce((sum, p) => sum + p.deltaMs, 0) / silencePairs.length : 0, 
        consistencyScore, accuracyScore, score: finalScore,
        earlyCount: silencePairs.filter((p) => p.deltaMs < -SCORING_CONFIG.earlyLateThresholdMs).length,
        lateCount: silencePairs.filter((p) => p.deltaMs > SCORING_CONFIG.earlyLateThresholdMs).length,
        totalFaults, extraTaps, missedBeats,
        rawMath: {
            averageAbsOffsetMs, effectiveOffsetMs, accuracyInflectionMs, generalAccuracyRaw,
            downbeatOffsetMs, effectiveDownbeatOffsetMs, downbeatAccuracyRaw, accuracyRaw,
            stdDeviationMs, effectiveStdDevMs, consistencyInflectionMs, consistencyRawBeforePenalty,
            totalFaults, penaltyPerFault, leniencyMultiplier
        }
    };
};