import { clamp, estimateCalibrationMs } from "./mathHelpers";
import { SCORING_CONFIG } from "../constants/gameConfig";

export const analyzeSession = ({ taps, beatMs, actualActiveMs, silentBars, returnBars }) => {
    if (!taps || taps.length === 0) return null;

    // 1. Sichere Kalibrierung nur aus der Listening Phase
    const calibrationMs = estimateCalibrationMs(taps, beatMs, actualActiveMs);

    // 2. Zeitpunkte korrigieren
    const correctedTaps = taps.map(tap => ({
        rawTime: tap.time,
        correctedTime: tap.time - calibrationMs
    }));

    // 3. Perfektes globales Raster aufbauen
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

    // Grundgerüst der Pairs
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

    // 4. RELATIVE INTENT DETECTION (Schritt-für-Schritt Analyse)
    const extraTaps = [];
    
    // Finde den Start-Beat für den ersten Tap (falls er etwas abweicht)
    let currentGridIndex = pairs.findIndex(p => Math.abs(p.expectedTime - correctedTaps[0].correctedTime) <= beatMs / 2);
    if (currentGridIndex === -1) currentGridIndex = 0;

    // Ersten Tap mappen
    pairs[currentGridIndex].correctedTime = correctedTaps[0].correctedTime;
    pairs[currentGridIndex].deltaMs = correctedTaps[0].correctedTime - pairs[currentGridIndex].expectedTime;
    pairs[currentGridIndex].missed = false;

    let lastValidTime = correctedTaps[0].correctedTime;

    // Alle weiteren Taps in Relation setzen
    for (let i = 1; i < correctedTaps.length; i++) {
        const tapTime = correctedTaps[i].correctedTime;
        const interval = tapTime - lastValidTime;
        
        // Berechne "Wie viele Beats waren gemeint?"
        const steps = Math.round(interval / beatMs);

        if (steps === 0) {
            // Zeit war unter 0.5 Beats -> Eindeutig ein versehentlicher Extra-Tap
            extraTaps.push(correctedTaps[i]);
        } else {
            // Es ist ein gewollter Tap! (Auch wenn er stark driftet)
            currentGridIndex += steps; // steps > 1 überspringt automatisch Beats (Lücken/Missed)
            lastValidTime = tapTime;

            // Auf das globale Raster mappen, solange wir nicht über das Ende hinausschießen
            if (currentGridIndex < pairs.length) {
                pairs[currentGridIndex].correctedTime = tapTime;
                pairs[currentGridIndex].deltaMs = tapTime - pairs[currentGridIndex].expectedTime;
                pairs[currentGridIndex].missed = false;
            }
        }
    }

    // 5. Intervalle berechnen (nur für getroffene Beats)
    const intervals = [];
    for (let i = 1; i < pairs.length; i++) {
        const current = pairs[i];
        const prev = pairs[i - 1];
        // Da wir Sequenzen springen können, berechnen wir das Intervall über die Distanz
        if (!current.missed && !prev.missed) {
            const expectedInterval = current.expectedTime - prev.expectedTime;
            const actualInterval = current.correctedTime - prev.correctedTime;
            intervals.push({
                deltaMs: actualInterval - expectedInterval,
                phase: current.phase 
            });
        }
    }

    // 6. ISOLIERTE AUSWERTUNG FÜR DIE STILLE
    const expectedSilenceBeats = pairs.filter(p => p.phase === 'silence');
    const silencePairs = expectedSilenceBeats.filter(p => !p.missed);
    const silenceIntervals = intervals.filter(i => i.phase === 'silence');
    
    // Fehlerzählung basierend auf dem neuen System
    const missedSilenceBeats = expectedSilenceBeats.length - silencePairs.length;
    const extraSilenceTaps = extraTaps.filter(t => 
        t.correctedTime >= silenceStartGridMs && t.correctedTime < silenceStartGridMs + silentMs
    ).length;
    const totalFaults = missedSilenceBeats + extraSilenceTaps;

    // Metriken
    const averageAbsOffsetMs = silencePairs.length > 0
        ? silencePairs.reduce((sum, p) => sum + Math.abs(p.deltaMs), 0) / silencePairs.length : 0;

    const averageIntervalDeltaMs = silenceIntervals.length > 0
        ? silenceIntervals.reduce((sum, i) => sum + i.deltaMs, 0) / silenceIntervals.length : 0;
    
    const varianceMs = silenceIntervals.length > 0
        ? silenceIntervals.reduce((sum, i) => sum + Math.pow(i.deltaMs - averageIntervalDeltaMs, 2), 0) / silenceIntervals.length : 0;
    const stdDeviationMs = Math.sqrt(Math.max(0, varianceMs));

    // --- MATHEMATIK (S-Kurven / Hill-Gleichung) ---
    const penaltyPerFault = (100 / Math.max(1, expectedSilenceBeats.length)) * SCORING_CONFIG.faultPenaltyMultiplier;

    // Accuracy S-Kurve berechnen
    let accuracyRaw = 100;
    const accuracyInflectionMs = beatMs * SCORING_CONFIG.accuracyInflectionPct;
    if (averageAbsOffsetMs > 0) {
        accuracyRaw = 100 / (1 + Math.pow(averageAbsOffsetMs / accuracyInflectionMs, SCORING_CONFIG.accuracySteepness) + (averageAbsOffsetMs / SCORING_CONFIG.accuracyLinearDropMs));
    }

    // Consistency S-Kurve berechnen
    let consistencyRawBeforePenalty = 0;
    const consistencyInflectionMs = beatMs * SCORING_CONFIG.consistencyInflectionPct;
    if (silenceIntervals.length > 0) {
        if (stdDeviationMs === 0) {
            consistencyRawBeforePenalty = 100;
        } else {
            consistencyRawBeforePenalty = 100 / (1 + Math.pow(stdDeviationMs / consistencyInflectionMs, SCORING_CONFIG.consistencySteepness) + (stdDeviationMs / SCORING_CONFIG.consistencyLinearDropMs));
        }
    }
    
    // Strafe für ausgelassene / zusätzliche Schläge (zieht direkt vom Konsistenz-Score ab)
    let consistencyRaw = clamp(consistencyRawBeforePenalty - (totalFaults * penaltyPerFault), 0, 100);

    const coveragePct = expectedSilenceBeats.length > 0
        ? clamp((silencePairs.length / expectedSilenceBeats.length) * 100, 0, 100) : 0;
    const coveragePenalty = coveragePct / 100;

    const accuracyScore = Math.round(accuracyRaw * coveragePenalty);
    const consistencyScore = expectedSilenceBeats.length > 0 && silencePairs.length === 0 
        ? 0 
        : Math.round(consistencyRaw);
    
    const finalScore = Math.round((consistencyScore * SCORING_CONFIG.weightConsistency) + (accuracyScore * SCORING_CONFIG.weightAccuracy));

    const missedBeats = pairs
        .filter(p => p.missed && p.phase === 'silence')
        .map(p => p.expectedTime);

    return {
        calibrationMs, beatMs, 
        uiStartMs, uiTotalMs: sessionEndGridMs, 
        uiSilenceStartMs: silenceStartGridMs, uiSilenceEndMs: silenceStartGridMs + silentMs,
        expectedBeats: expectedBeats.map(b => b), 
        pairs, 
        averageOffsetMs: silencePairs.length > 0 ? silencePairs.reduce((sum, p) => sum + p.deltaMs, 0) / silencePairs.length : 0, 
        coveragePct, 
        consistencyScore, accuracyScore, score: finalScore,
        earlyCount: silencePairs.filter((p) => p.deltaMs < -SCORING_CONFIG.earlyLateThresholdMs).length,
        lateCount: silencePairs.filter((p) => p.deltaMs > SCORING_CONFIG.earlyLateThresholdMs).length,
        totalFaults, extraTaps, missedBeats,
        rawMath: {
            averageAbsOffsetMs, accuracyInflectionMs, accuracyRaw,
            stdDeviationMs, consistencyInflectionMs, consistencyRawBeforePenalty,
            totalFaults, penaltyPerFault, coveragePenalty
        }
    };
};