"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NumberStepper } from '../PolyRhythmGame/components/NumberStepper';

// --- SCORING CONFIG
// --- SCORING CONFIG (Kalibriert auf 103ms->80pt / 22ms->95pt) ---
// --- SCORING CONFIG (Hardcore-Modus: 159ms Accuracy -> ~35pt) ---
// --- SCORING CONFIG (Metronom-Kalibriert: 15ms = 100% / 159ms Accuracy = ~35pt) ---
const SCORING_CONFIG = {
    returnBars: 1,

    // --- ACCURACY (Ziel: Unter 20ms = 100% | 159ms = ~35%) ---
    accuracyInflectionPct: 0.18,  // Wendepunkt (50 Pkt) bei ca. 120ms (bei 120 BPM)
    accuracySteepness: 3.8,       // Etwas steiler, um das Plateau oben zu halten
    // Sehr hoher Wert = fast kein Abzug bei perfekten Schlägen (< 20ms)
    accuracyLinearDropMs: 1200,   

    // --- CONSISTENCY (Ziel: Unter 15ms = 100% | 31ms = ~85% | 36ms = ~75%) ---
    consistencyInflectionPct: 0.10, // Sehr strenger Wendepunkt (ca. 45ms bei 120 BPM)
    consistencySteepness: 4.9,      // Extreme S-Form: oben flach, dann Klippe
    consistencyLinearDropMs: 1500,  

    weightConsistency: 0.6,
    weightAccuracy: 0.4,

    faultPenaltyMultiplier: 1.4,
    earlyLateThresholdMs: 15
};

const BEATS = [
    { id: 'solid-95', name: 'Solid 70s Drumset', bpm: 95, bars: 2, src: '/drumSamples/Solid 70s Drumset 16 95bpm 2bars.wav' },
    { id: 'shuffle-125', name: '60s Shuffle Drumset', bpm: 125, bars: 2, src: '/drumSamples/60s Shuffle Drumset 03 125bpm 2bars.wav' },
    { id: 'funked-105', name: 'Funked Out Drumset', bpm: 105, bars: 2, src: '/drumSamples/Funked Out Drumset 05 105bpm 2bars.wav' },
    { id: 'funky-98', name: 'Funky Shuffle Drumset', bpm: 98, bars: 1, src: '/drumSamples/Funky Shuffle Drumset 21 98bpm 1bars.wav' },
];

const RETURN_BARS = 1;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const median = (values) => {
    if (!values.length) return 0;
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle];
};

const formatMs = (value) => `${value > 0 ? '+' : ''}${Math.round(value)}ms`;

// Kalibrierung isoliert auf Listening Phase
const estimateCalibrationMs = (taps, beatMs, actualActiveMs) => {
    const listeningTaps = taps.filter(t => t.time <= actualActiveMs);
    if (listeningTaps.length === 0) return 0;

    const offsets = listeningTaps.map(tap => {
        let offset = tap.time % beatMs;
        if (offset > beatMs / 2) offset -= beatMs;
        return offset;
    });

    return median(offsets);
};

const analyzeSession = ({ taps, beatMs, actualActiveMs, silentBars, returnBars }) => {
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

    const uiStartMs = Math.max(0, silenceStartGridMs - (4 * beatMs));
    
    const expectedBeats = [];
    for (let t = uiStartMs; t <= sessionEndGridMs + 0.001; t += beatMs) {
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
    // Accuracy S-Kurve berechnen
    let accuracyRaw = 100;
    const accuracyInflectionMs = beatMs * SCORING_CONFIG.accuracyInflectionPct;
    if (averageAbsOffsetMs > 0) {
        // Hinzugefügt: + (averageAbsOffsetMs / SCORING_CONFIG.accuracyLinearDropMs)
        accuracyRaw = 100 / (1 + Math.pow(averageAbsOffsetMs / accuracyInflectionMs, SCORING_CONFIG.accuracySteepness) + (averageAbsOffsetMs / SCORING_CONFIG.accuracyLinearDropMs));
    }

    // Consistency S-Kurve berechnen
    let consistencyRawBeforePenalty = 0;
    const consistencyInflectionMs = beatMs * SCORING_CONFIG.consistencyInflectionPct;
    if (silenceIntervals.length > 0) {
        if (stdDeviationMs === 0) {
            consistencyRawBeforePenalty = 100;
        } else {
            // Hinzugefügt: + (stdDeviationMs / SCORING_CONFIG.consistencyLinearDropMs)
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

function BeatCard({ beat, selected, onSelect }) {
    return (
        <button
            type="button"
            onClick={() => onSelect(beat.id)}
            className={`rounded-2xl border px-4 py-3 text-left transition-colors ${selected ? 'border-cyan-300/30 bg-cyan-400/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.05]'}`}
        >
            <div className="text-sm font-semibold text-stone-100">{beat.name}</div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.22em] text-neutral-500">{beat.bpm} BPM</div>
        </button>
    );
}

function StatCard({ label, value, highlight = false }) {
    return (
        <div className={`rounded-2xl border px-3 py-3 ${highlight ? 'border-amber-500/30 bg-amber-500/10' : 'border-white/10 bg-white/[0.03]'}`}>
            <div className={`text-[10px] uppercase tracking-[0.2em] ${highlight ? 'text-amber-200/80' : 'text-neutral-500'}`}>{label}</div>
            <div className={`mt-1 text-lg font-semibold ${highlight ? 'text-amber-100' : 'text-stone-100'}`}>{value}</div>
        </div>
    );
}

function CombinedTimelineRow({ startMs, endMs, silenceStartMs, silenceEndMs, expectedBeats = [], pairs = [], extraTaps = [], missedBeats = [] }) {
    const widthMs = Math.max(1, endMs - startMs);
    const silenceLeftPct = ((silenceStartMs - startMs) / widthMs) * 100;
    const silenceWidthPct = ((silenceEndMs - silenceStartMs) / widthMs) * 100;

    return (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 md:p-4 mt-3">
            <div className="mb-4 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.22em] text-neutral-500">
                <span>Session Timeline</span>
                <div className="flex gap-4">
                    <span className="flex items-center gap-2 text-amber-500/80">
                        <div className="w-3 h-3 rounded-sm bg-amber-500/20 border border-amber-500/30"></div>
                        Silence
                    </span>
                    <span className="flex items-center gap-2 text-fuchsia-400">
                        <div className="w-3 h-3 rounded-sm bg-fuchsia-500/40 border border-fuchsia-500"></div>
                        The "One"
                    </span>
                </div>
            </div>
            
            <div className="relative h-24 overflow-hidden rounded-xl border border-white/10 bg-neutral-950/50">
                <div className="absolute inset-y-0 left-4 right-4">
                    <div 
                        className="absolute top-0 bottom-0 bg-amber-500/20 border-x border-amber-500/20"
                        style={{ left: `${silenceLeftPct}%`, width: `${silenceWidthPct}%` }}
                    />
                    
                    {expectedBeats.map((beatTime) => {
                        const leftPct = ((beatTime - startMs) / widthMs) * 100;
                        const isReturnOne = Math.abs(beatTime - silenceEndMs) < 1; 
                        
                        return (
                            <div 
                                key={`beat-${beatTime}`} 
                                className={`absolute top-0 bottom-0 ${isReturnOne ? 'w-[2px] bg-fuchsia-500 shadow-[0_0_8px_#d946ef] z-10' : 'w-px bg-white/20'}`} 
                                style={{ left: `${leftPct}%` }} 
                            />
                        );
                    })}
                    
                    {pairs.filter(p => !p.missed).map((pair) => {
                        const leftPct = ((pair.correctedTime - startMs) / widthMs) * 100;
                        const isReturnOne = Math.abs(pair.expectedTime - silenceEndMs) < 1;
                        
                        let styleClass = 'absolute top-2 bottom-2 rounded-full shadow-[0_0_6px_currentColor] ';
                        if (isReturnOne) {
                            styleClass += 'w-[4px] bg-fuchsia-300 z-20 shadow-[0_0_12px_#d946ef]';
                        } else {
                            const tone = pair.deltaMs < -15 ? 'bg-emerald-400' : pair.deltaMs > 15 ? 'bg-amber-400' : 'bg-cyan-400';
                            styleClass += `w-[3px] ${tone}`;
                        }

                        return (
                            <div 
                                key={`tap-${pair.expectedTime}`} 
                                className={styleClass} 
                                style={{ left: `${leftPct}%` }} 
                                title={`${Math.round(pair.deltaMs)}ms`} 
                            />
                        );
                    })}

                    {missedBeats.map((time, idx) => {
                        const leftPct = ((time - startMs) / widthMs) * 100;
                        if (leftPct < 0 || leftPct > 100) return null;
                        return (
                            <div 
                                key={`missed-${idx}`} 
                                className="absolute top-0 bottom-0 w-[2px] bg-red-500 shadow-[0_0_8px_#ef4444]" 
                                style={{ left: `${leftPct}%` }} 
                            />
                        );
                    })}

                    {extraTaps.map((tap, idx) => {
                        const leftPct = ((tap.correctedTime - startMs) / widthMs) * 100;
                        if (leftPct < 0 || leftPct > 100) return null; 
                        return (
                            <div 
                                key={`extra-${idx}`} 
                                className="absolute top-2 bottom-2 w-[3px] rounded-full bg-rose-400 shadow-[0_0_6px_#f43f5e] z-30" 
                                style={{ left: `${leftPct}%` }} 
                            />
                        );
                    })}
                </div>
            </div>
            
            <div className="mt-2 flex justify-between px-1 text-[10px] uppercase tracking-[0.18em] text-neutral-500">
                <span>Start</span>
                <span>{Math.round(widthMs / 1000)}s</span>
            </div>
        </div>
    );
}

function SetupDesktop({ triggerTaps, setTriggerTaps, silentBars, setSilentBars, selectedBeatId, setSelectedBeatId, onStart }) {
    return (
        <div className="flex h-full flex-col gap-4 overflow-y-auto pr-1">
            <div className="grid gap-3 md:grid-cols-2">
                <NumberStepper label="Taps to Trigger" value={triggerTaps} onChange={setTriggerTaps} min={4} max={32} compact />
                <NumberStepper label="Silent bars" value={silentBars} onChange={setSilentBars} min={1} max={16} compact />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
                {BEATS.map((beat) => (
                    <BeatCard key={beat.id} beat={beat} selected={beat.id === selectedBeatId} onSelect={setSelectedBeatId} />
                ))}
            </div>
            <div className="mt-auto flex justify-center">
                <button type="button" onClick={onStart} className="rounded-full bg-stone-200 px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-neutral-950 transition-transform active:scale-95">Start</button>
            </div>
        </div>
    );
}

function SetupMobile({ triggerTaps, setTriggerTaps, silentBars, setSilentBars, selectedBeatId, setSelectedBeatId, onStart }) {
    return (
        <div className="flex h-full flex-col gap-4 overflow-y-auto pr-1">
            <div className="grid gap-2">
                <NumberStepper label="Taps to Trigger" value={triggerTaps} onChange={setTriggerTaps} min={4} max={32} compact />
                <NumberStepper label="Silent bars" value={silentBars} onChange={setSilentBars} min={1} max={16} compact />
            </div>
            <div className="grid grid-cols-2 gap-2">
                {BEATS.map((beat) => (
                    <BeatCard key={beat.id} beat={beat} selected={beat.id === selectedBeatId} onSelect={setSelectedBeatId} />
                ))}
            </div>
            <button type="button" onClick={onStart} className="mt-auto rounded-full bg-stone-200 px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-neutral-950 active:scale-95">Start</button>
        </div>
    );
}

function PlayDesktop({ subLabel, label, progressPct, beatName, bpm }) {
    return (
        <div className="flex h-full min-h-0 flex-col gap-4">
            <div className="rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-[11px] uppercase tracking-[0.24em] text-neutral-500">{subLabel}</div>
                        <div className="mt-1 text-3xl font-black text-stone-100">{label}</div>
                    </div>
                    <div className="text-right text-xs uppercase tracking-[0.22em] text-neutral-500">
                        <div>{beatName}</div>
                        <div className="mt-1">{bpm} BPM</div>
                    </div>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300 transition-all duration-75" style={{ width: `${progressPct}%` }} />
                </div>
            </div>

            <div className="flex flex-1 items-center justify-center rounded-[1.8rem] border border-white/10 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.14),transparent_35%),linear-gradient(to_bottom,rgba(255,255,255,0.04),rgba(255,255,255,0.02))]">
                <div className="relative flex h-64 w-64 items-center justify-center rounded-full border border-white/10 bg-black/25 md:h-72 md:w-72">
                    <div className="absolute inset-6 rounded-full border border-white/10" />
                    <div className="absolute inset-12 rounded-full border border-cyan-200/10" />
                    <div className="text-center">
                        <div className="text-[11px] uppercase tracking-[0.34em] text-neutral-500">Press</div>
                        <div className="mt-2 text-4xl font-black text-stone-100">SPACEBAR</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function PlayMobile({ subLabel, label, progressPct, onTap, beatName, bpm }) {
    return (
        <div
            role="button" tabIndex={0} onPointerDown={onTap}
            className="relative flex h-full min-h-0 flex-col rounded-[1.8rem] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.12),transparent_30%),radial-gradient(circle_at_bottom,rgba(16,185,129,0.10),transparent_34%),linear-gradient(to_bottom,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-4 outline-none touch-none select-none"
            style={{ touchAction: 'none' }}
        >
            <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.22em] text-neutral-500">
                <span>{subLabel}</span>
                <span>{label}</span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300 transition-all duration-75" style={{ width: `${progressPct}%` }} />
            </div>

            <div className="flex flex-1 items-center justify-center">
                <div className="relative flex h-52 w-52 items-center justify-center rounded-full border border-white/10 bg-black/25">
                    <div className="absolute inset-5 rounded-full border border-white/10" />
                    <div className="absolute inset-10 rounded-full border border-cyan-200/10" />
                    <div className="text-center">
                        <div className="text-[11px] uppercase tracking-[0.34em] text-neutral-500">{beatName}</div>
                        <div className="mt-2 text-5xl font-black text-stone-100">{bpm}</div>
                        <div className="mt-2 text-[11px] uppercase tracking-[0.24em] text-neutral-500">BPM</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ScoreGraph({ label, currentError, inflection, steepness, accuracyLinearDropMs, colorClass, score }) {
    const points = [];
    const maxMs = inflection * 2.5; 
    
    for (let x = 0; x <= maxMs; x += maxMs / 50) {
        const y = 100 / (1 + Math.pow(x / inflection, steepness) + (x / accuracyLinearDropMs));
        points.push(`${(x / maxMs) * 100},${100 - y}`);
    }

    const userX = (clamp(currentError, 0, maxMs) / maxMs) * 100;
    const userY = 100 - score;

    return (
        <div className="flex flex-col gap-2">
            <div className="flex justify-between text-[10px] uppercase tracking-wider text-neutral-500">
                <span>{label}</span>
                <span className={colorClass}>Score: {Math.round(score)}%</span>
            </div>
            
            <div className="relative h-32 w-full rounded-lg border border-white/5 bg-black/20 p-2">
                <div className="relative h-full w-full">
                    {/* Y-Achse Beschriftung */}
                    <div className="absolute -left-1 top-0 text-[8px] text-neutral-600 -translate-y-1/2">100</div>
                    <div className="absolute -left-1 bottom-0 text-[8px] text-neutral-600 translate-y-1/2">0</div>
                    
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
                        {/* Rasterlinie */}
                        <line x1="0" y1="50" x2="100" y2="50" stroke="white" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeDasharray="4" opacity="0.1" />
                        
                        <polyline
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            vectorEffect="non-scaling-stroke"
                            className={colorClass}
                            points={points.join(' ')}
                        />
                    </svg>
                    
                    <div 
                        className={`absolute h-2 w-2 -ml-1 -mt-1 rounded-full bg-white z-10 ${colorClass}`}
                        style={{ 
                            left: `${userX}%`, 
                            top: `${userY}%`,
                            boxShadow: '0 0 10px currentColor' 
                        }}
                    />
                </div>
            </div>
            
            <div className="flex justify-between text-[8px] text-neutral-600">
                <span>0ms</span>
                <span>Fehler (ms) →</span>
                <span>{Math.round(maxMs)}ms</span>
            </div>
        </div>
    );
}

function ResultView({ analysis, selectedBeat, onPlayAgain, onBackToSetup }) {
    const [showAnalysis, setShowAnalysis] = useState(false);

    if (!analysis) return null;

    return (
        <div className="w-full max-w-4xl mx-auto h-full overflow-y-auto pr-1 md:pr-2 flex flex-col">
            
            <div className="mb-4 flex flex-col md:flex-row items-start md:items-end justify-between gap-4">
                <div>
                    <div className="text-[11px] uppercase tracking-[0.34em] text-neutral-500">Session Complete</div>
                    <div className="mt-1 text-3xl font-black text-stone-100 md:text-4xl">Hold The Time</div>
                </div>
                
                <div className="flex items-end gap-3 md:gap-4 bg-white/[0.02] border border-white/5 p-3 rounded-2xl w-full md:w-auto">
                    <div className="text-right flex-1 md:flex-none">
                        <div className="text-[9px] md:text-[10px] uppercase tracking-[0.2em] text-neutral-500">Consistency</div>
                        <div className="mt-1 text-2xl md:text-3xl font-black text-amber-200/80">{analysis.consistencyScore || 0}</div>
                    </div>
                    <div className="w-px h-10 bg-white/10 hidden md:block"></div>
                    <div className="text-right flex-1 md:flex-none">
                        <div className="text-[9px] md:text-[10px] uppercase tracking-[0.2em] text-neutral-500">Accuracy</div>
                        <div className="mt-1 text-2xl md:text-3xl font-black text-emerald-200/80">{analysis.accuracyScore || 0}</div>
                    </div>
                    <div className="w-px h-12 bg-white/10 hidden md:block"></div>
                    <div className="text-right flex-1 md:flex-none">
                        <div className="text-[10px] md:text-[11px] uppercase tracking-[0.22em] text-cyan-400/80">Overall</div>
                        <div className="mt-1 text-4xl md:text-5xl font-black text-cyan-100">{analysis.score || 0}</div>
                    </div>
                </div>
            </div>

            <CombinedTimelineRow 
                startMs={analysis.uiStartMs || 0} 
                endMs={analysis.uiTotalMs || 0} 
                silenceStartMs={analysis.uiSilenceStartMs || 0} 
                silenceEndMs={analysis.uiSilenceEndMs || 0}
                expectedBeats={analysis.expectedBeats || []} 
                pairs={analysis.pairs || []} 
                extraTaps={analysis.extraTaps || []}
                missedBeats={analysis.missedBeats || []}
            />

            {!showAnalysis ? (
                <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                    <StatCard label="Start Delay Fix" value={formatMs(analysis.calibrationMs)} />
                    <StatCard label="Avg Offset" value={formatMs(analysis.averageOffsetMs)} />
                    <StatCard label="Early Taps" value={analysis.earlyCount} />
                    <StatCard label="Late Taps" value={analysis.lateCount} />
                    <StatCard label="Missed/Extra" value={analysis.totalFaults} highlight={analysis.totalFaults > 0} />
                    <StatCard label="Selected Beat" value={`${selectedBeat?.bpm} BPM`} />
                </div>
            ) : (
                <div className="mt-3 flex flex-col gap-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {/* Accuracy S-Kurve Details */}
                        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                            <ScoreGraph 
                                label="Accuracy Kurve"
                                currentError={analysis.rawMath.averageAbsOffsetMs}
                                inflection={analysis.rawMath.accuracyInflectionMs}
                                steepness={SCORING_CONFIG.accuracySteepness}
                                accuracyLinearDropMs={SCORING_CONFIG.accuracyLinearDropMs}
                                colorClass="text-emerald-400"
                                score={analysis.rawMath.accuracyRaw}
                            />
                            <div className="mt-4 space-y-1 text-[11px] text-stone-400 border-t border-white/5 pt-2">
                                <div className="flex justify-between"><span>Fehler:</span> <span className="text-white">{Math.round(analysis.rawMath.averageAbsOffsetMs)}ms</span></div>
                                <div className="flex justify-between"><span>Multiplikator:</span> <span className="text-white">x{analysis.rawMath.coveragePenalty.toFixed(2)}</span></div>
                            </div>
                        </div>

                        {/* Consistency S-Kurve Details */}
                        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                            <ScoreGraph 
                                label="Consistency Kurve"
                                currentError={analysis.rawMath.stdDeviationMs}
                                inflection={analysis.rawMath.consistencyInflectionMs}
                                steepness={SCORING_CONFIG.consistencySteepness}
                                accuracyLinearDropMs={SCORING_CONFIG.accuracyLinearDropMs}
                                colorClass="text-amber-400"
                                score={analysis.rawMath.consistencyRawBeforePenalty}
                            />
                            <div className="mt-4 space-y-1 text-[11px] text-stone-400 border-t border-white/5 pt-2">
                                <div className="flex justify-between"><span>Streuung:</span> <span className="text-white">{Math.round(analysis.rawMath.stdDeviationMs)}ms</span></div>
                                <div className="flex justify-between"><span>Fehler-Abzug:</span> <span className="text-rose-400">-{Math.round(analysis.rawMath.totalFaults * analysis.rawMath.penaltyPerFault)}</span></div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="mt-auto pt-4 flex flex-wrap justify-center gap-2 pb-2">
                <button 
                    type="button" 
                    onClick={() => setShowAnalysis(!showAnalysis)} 
                    className={`rounded-full border px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.22em] transition ${showAnalysis ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-200' : 'border-white/10 bg-white/[0.03] text-neutral-300 hover:bg-white/[0.06]'}`}
                >
                    {showAnalysis ? 'Hide Details' : 'Math Details'}
                </button>
                <button type="button" onClick={onPlayAgain} className="rounded-full bg-stone-200 px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-neutral-950 transition-transform hover:scale-[1.02] active:scale-95">Play Again</button>
                <button type="button" onClick={onBackToSetup} className="rounded-full border border-white/10 bg-white/[0.03] px-6 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-neutral-200 transition hover:bg-white/[0.06]">Back</button>
            </div>
        </div>
    );
}

export default function HoldTheTime() {
    const [selectedBeatId, setSelectedBeatId] = useState(BEATS[0].id);
    const [triggerTaps, setTriggerTaps] = useState(8);
    const [silentBars, setSilentBars] = useState(4);
    const [gameState, setGameState] = useState('setup');
    const [phase, setPhase] = useState('listening');
    const [tapCount, setTapCount] = useState(0);
    const [sessionProgress, setSessionProgress] = useState(0);
    const [analysis, setAnalysis] = useState(null);
    const [isTouchPreferred, setIsTouchPreferred] = useState(false);
    const [tapRipples, setTapRipples] = useState([]);

    const selectedBeat = useMemo(() => BEATS.find((beat) => beat.id === selectedBeatId) || BEATS[0], [selectedBeatId]);
    const beatMs = 60000 / selectedBeat.bpm;
    const isMobile = isTouchPreferred;

    const audioRef = useRef(null);
    const timerRefs = useRef([]);
    const clockRef = useRef(0);
    
    const sessionStartRef = useRef(0);
    const silenceStartRef = useRef(0);
    
    const hasTriggeredSilenceRef = useRef(false);
    
    const tapEntriesRef = useRef([]);
    const audioCtxRef = useRef(null);
    const sourceNodeRef = useRef(null);
    const gainNodeRef = useRef(null);

    useEffect(() => {
        const handleGlobalKeyDown = (e) => {
            if (e.repeat) return;
            
            if (e.key === ' ') {
                e.preventDefault();
                
                if (gameState === 'setup') {
                    startSession();
                    return;
                }

                if (gameState === 'running' && !isMobile) {
                    recordTap({ isKeyboard: true }); 
                }
            }
            if (e.key === 'Enter' && gameState === 'results') {
                startSession();
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                clearSession(); 
                setGameState('setup');
                setPhase('listening');
            }
        };

        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gameState, isMobile, triggerTaps]);

    useEffect(() => {
        const mediaQuery = window.matchMedia('(pointer: coarse)');
        const updatePreference = () => setIsTouchPreferred(mediaQuery.matches || navigator.maxTouchPoints > 0);
        updatePreference();
        mediaQuery.addEventListener('change', updatePreference);
        return () => mediaQuery.removeEventListener('change', updatePreference);
    }, []);

    useEffect(() => () => {
        timerRefs.current.forEach((timerId) => clearTimeout(timerId));
        if (clockRef.current) cancelAnimationFrame(clockRef.current);
    }, []);

    const clearSession = () => {
        timerRefs.current.forEach((timerId) => clearTimeout(timerId));
        timerRefs.current = [];
        if (clockRef.current) cancelAnimationFrame(clockRef.current);
        clockRef.current = 0;
        
        if (sourceNodeRef.current) {
            try {
                sourceNodeRef.current.stop();
                sourceNodeRef.current.disconnect();
            } catch (e) {}
            sourceNodeRef.current = null;
        }
        
        if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
            audioCtxRef.current.close().catch(() => {});
        }
        audioCtxRef.current = null;

        setTapRipples([]);
        tapEntriesRef.current = [];
        setTapCount(0);
        setSessionProgress(0);
        hasTriggeredSilenceRef.current = false;
        silenceStartRef.current = 0;
    };

    const spawnRipple = (event) => {
        let x = 50;
        let y = 50;
        if (event && event.currentTarget && !event.isKeyboard) {
            const rect = event.currentTarget.getBoundingClientRect();
            if (rect.width && rect.height) {
                const point = event.clientX != null && event.clientY != null
                    ? { clientX: event.clientX, clientY: event.clientY }
                    : event.changedTouches?.[0];
                if (point) {
                    x = ((point.clientX - rect.left) / rect.width) * 100;
                    y = ((point.clientY - rect.top) / rect.height) * 100;
                }
            }
        }

        const ripple = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, x, y };
        setTapRipples((current) => [...current, ripple]);
        window.setTimeout(() => {
            setTapRipples((current) => current.filter((item) => item.id !== ripple.id));
        }, 350);
    };

    const triggerSilencePhase = () => {
        setPhase('silence');
        const nowMs = performance.now();
        silenceStartRef.current = nowMs;

        const silentMs = silentBars * beatMs * 4;
        const returnMs = SCORING_CONFIG.returnBars * beatMs * 4;

        if (gainNodeRef.current && audioCtxRef.current) {
            const ctx = audioCtxRef.current;
            const nowAudio = ctx.currentTime;
            const silentSecs = silentMs / 1000;
            
            gainNodeRef.current.gain.cancelScheduledValues(nowAudio);
            gainNodeRef.current.gain.setValueAtTime(gainNodeRef.current.gain.value, nowAudio);
            gainNodeRef.current.gain.linearRampToValueAtTime(0, nowAudio + 0.05);

            const returnAudioTime = nowAudio + silentSecs;
            gainNodeRef.current.gain.setValueAtTime(0, returnAudioTime - 0.05);
            gainNodeRef.current.gain.linearRampToValueAtTime(1, returnAudioTime);
        }

        timerRefs.current.push(window.setTimeout(() => {
            setPhase('return');
        }, silentMs));

        timerRefs.current.push(window.setTimeout(() => {
            finishSession();
        }, silentMs + returnMs));
    };

    const recordTap = (event) => {
        if (gameState !== 'running') return;
    
        const time = performance.now() - sessionStartRef.current;
        
        if (tapEntriesRef.current.length > 0) {
            const lastTime = tapEntriesRef.current[tapEntriesRef.current.length - 1].time;
            if (time - lastTime < 150) return; // Debounce
        }

        event?.preventDefault?.(); 
        tapEntriesRef.current.push({ time });
        
        const newCount = tapEntriesRef.current.length;
        setTapCount(newCount);
        spawnRipple(event);

        if (phase === 'listening' && newCount === triggerTaps && !hasTriggeredSilenceRef.current) {
            hasTriggeredSilenceRef.current = true;
            window.setTimeout(() => {
                triggerSilencePhase();
            }, beatMs);
        }
    };

    const finishSession = () => {
        const actualActiveMs = silenceStartRef.current > 0 
            ? silenceStartRef.current - sessionStartRef.current 
            : triggerTaps * beatMs;

        const result = analyzeSession({
            taps: tapEntriesRef.current,
            beatMs,
            actualActiveMs,
            silentBars,
            returnBars: SCORING_CONFIG.returnBars,
        });

        clearSession();
        setAnalysis(result);
        setGameState('results');
        setPhase('return');
    };

    const startSession = async () => {
        clearSession();
        setGameState('running');
        setPhase('listening');
        sessionStartRef.current = performance.now();

        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;

        const response = await fetch(selectedBeat.src);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

        const source = ctx.createBufferSource();
        const gainNode = ctx.createGain();
        
        source.buffer = audioBuffer;
        source.loop = true;
        
        const exactLoopLengthSec = (60 / selectedBeat.bpm) * 4 * selectedBeat.bars;
        source.loopStart = 0;
        source.loopEnd = exactLoopLengthSec; 
        
        source.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        sourceNodeRef.current = source;
        gainNodeRef.current = gainNode;

        source.start(ctx.currentTime);

        const updateClock = () => {
            setSessionProgress(performance.now());
            clockRef.current = requestAnimationFrame(updateClock);
        };
        clockRef.current = requestAnimationFrame(updateClock);
    };

    const restartToSetup = () => {
        clearSession();
        setAnalysis(null);
        setGameState('setup');
        setPhase('listening');
    };

    let progressPct = 0;
    let playLabel = '';
    let playSubLabel = '';

    if (gameState === 'running') {
        if (phase === 'listening') {
            playSubLabel = 'Listening';
            if (tapCount === 0) {
                playLabel = isMobile ? 'Tap along to start' : 'Spacebar to start';
            } else {
                playLabel = tapCount >= triggerTaps ? '0 taps until silence' : `${triggerTaps - tapCount} taps until silence`;
            }
            progressPct = clamp((tapCount / triggerTaps) * 100, 0, 100);
        } else if (phase === 'silence') {
            playSubLabel = 'Silence Phase';
            playLabel = 'Keep the pulse';
            const elapsed = sessionProgress - silenceStartRef.current;
            const silentMs = silentBars * beatMs * 4;
            progressPct = clamp((elapsed / silentMs) * 100, 0, 100);
        } else if (phase === 'return') {
            playSubLabel = 'Return Phase';
            playLabel = 'Beat returns';
            const elapsed = sessionProgress - (silenceStartRef.current + (silentBars * beatMs * 4));
            const returnMs = RETURN_BARS * beatMs * 4;
            progressPct = clamp((elapsed / returnMs) * 100, 0, 100);
        }
    }

    return (
        <div className="w-full h-full px-2 py-2 md:px-4 md:py-4 flex items-center justify-center">
            <div 
                className="relative mx-auto w-full overflow-hidden rounded-[1.6rem] border border-white/10 bg-neutral-950/80 shadow-[0_20px_60px_rgba(0,0,0,0.4)] backdrop-blur transition-all duration-500 ease-in-out"
                style={{ 
                    maxWidth: gameState === 'results' ? '56rem' : '28rem' 
                }}
            >
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.05),transparent_26%),linear-gradient(to_bottom,rgba(255,255,255,0.03),transparent_20%,transparent_80%,rgba(255,255,255,0.02))]" />

                <div className="relative z-10 flex min-h-[30rem] md:min-h-[32rem] flex-col p-4 md:p-6 transition-all duration-500">
                    
                    {gameState === 'setup' && (
                        <div className="flex flex-1 min-h-0 flex-col gap-4">
                            {isMobile ? (
                                <SetupMobile
                                    triggerTaps={triggerTaps} setTriggerTaps={setTriggerTaps}
                                    silentBars={silentBars} setSilentBars={setSilentBars}
                                    selectedBeatId={selectedBeatId} setSelectedBeatId={setSelectedBeatId}
                                    onStart={startSession}
                                />
                            ) : (
                                <SetupDesktop
                                    triggerTaps={triggerTaps} setTriggerTaps={setTriggerTaps}
                                    silentBars={silentBars} setSilentBars={setSilentBars}
                                    selectedBeatId={selectedBeatId} setSelectedBeatId={setSelectedBeatId}
                                    onStart={startSession}
                                />
                            )}
                        </div>
                    )}

                    {gameState === 'running' && (
                        <div className="flex flex-1 min-h-0 flex-col gap-4">
                            {isMobile ? (
                                <PlayMobile
                                    subLabel={playSubLabel} label={playLabel}
                                    progressPct={progressPct} onTap={recordTap}
                                    beatName={selectedBeat.name} bpm={selectedBeat.bpm}
                                />
                            ) : (
                                <PlayDesktop
                                    subLabel={playSubLabel} label={playLabel}
                                    progressPct={progressPct}
                                    beatName={selectedBeat.name} bpm={selectedBeat.bpm}
                                />
                            )}
                        </div>
                    )}

                    {gameState === 'results' && analysis && (
                        <div className="flex flex-1 min-h-0 flex-col gap-4">
                            <ResultView
                                analysis={analysis} selectedBeat={selectedBeat}
                                onPlayAgain={startSession} onBackToSetup={restartToSetup}
                            />
                        </div>
                    )}
                </div>

                {gameState === 'running' && tapRipples.map((ripple) => (
                    <div
                        key={ripple.id}
                        className="pointer-events-none absolute z-20 h-24 w-24 rounded-full"
                        style={{
                            left: `${ripple.x}%`, top: `${ripple.y}%`,
                            transform: 'translate(-50%, -50%)',
                            background: 'radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(125,211,252,0.7) 24%, rgba(34,211,238,0.22) 48%, transparent 72%)',
                            filter: 'drop-shadow(0 0 12px rgba(125,211,252,0.55))',
                            animation: 'tapRipple 0.35s ease-out forwards',
                        }}
                    />
                ))}
            </div>

            <style jsx>{`
                @keyframes tapRipple {
                    0% { opacity: 0.45; transform: translate(-50%, -50%) scale(0.7); }
                    100% { opacity: 0; transform: translate(-50%, -50%) scale(1.8); }
                }
            `}</style>
        </div>
    );
}