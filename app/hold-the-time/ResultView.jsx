import React, { useState } from 'react';
import { SCORING_CONFIG } from './constants/gameConfig';
import { formatMs, clamp } from './utils/mathHelpers';

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
                <span>Error (ms) →</span>
                <span>{Math.round(maxMs)}ms</span>
            </div>
        </div>
    );
}

export default function ResultView({ analysis, selectedBeat, onPlayAgain, onBackToSetup, isMobile }) {
    const [showAnalysis, setShowAnalysis] = useState(false);
    const isDebugMode = process.env.NEXT_PUBLIC_DEBUG_MODE === 'true';

    if (!analysis) return null;

    return (
        <div className="w-full max-w-4xl mx-auto h-full overflow-y-auto pr-1 md:pr-2 flex flex-col">
            
            <div className="mb-4 flex flex-col md:flex-row items-start md:items-end justify-between gap-4">
                {!isMobile && (
                    <div>
                        <div className="text-xs uppercase tracking-[0.34em] text-neutral-500">Session Complete</div>
                        <div className="mt-1 text-4xl font-black text-stone-100">Hold The Time</div>
                    </div>
                )}
                <div className="flex items-end gap-3 md:gap-4 px-3 rounded-2xl w-full md:w-auto">
                    <div className="text-center flex-1 md:flex-none opacity-80">
                        <div className="text-[11px] md:text-[10px] uppercase tracking-[0.2em] text-neutral-500">Consistency</div>
                        <div className="mt-1 text-6xl md:text-4xl font-black text-neutral-200">{analysis.consistencyScore || 0}</div>
                    </div>
                    <div className="text-center flex-1 md:flex-none opacity-80">
                        <div className="text-[11px] md:text-[10px] uppercase tracking-[0.2em] text-neutral-500">Accuracy</div>
                        <div className="mt-1 text-6xl md:text-4xl font-black text-neutral-200">{analysis.accuracyScore || 0}</div>
                    </div>
                    <div className="text-center flex-1 md:flex-none">
                        <div className="text-[11px] md:text-[11px] uppercase tracking-[0.22em] text-cyan-400/80">Overall</div>
                        <div className="mt-1 text-6xl md:text-6xl font-black text-cyan-100">{analysis.score || 0}</div>
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

            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                <StatCard label="Avg Offset" value={formatMs(analysis.averageOffsetMs)} />
                <StatCard label="Early/Late Taps" value={`${analysis.earlyCount} / ${analysis.lateCount}`} />
                <StatCard label="Missed/Extra" value={`${analysis.missedBeats.length} / ${analysis.extraTaps.length}`} highlight={analysis.totalFaults > 0} />
                <StatCard label="Beat Tempo" value={`${selectedBeat?.bpm} BPM`} />
            </div>

            {showAnalysis && (
                <div className="mt-3 flex flex-col gap-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                            <ScoreGraph 
                                label="Accuracy Curve"
                                currentError={analysis.rawMath.averageAbsOffsetMs}
                                inflection={analysis.rawMath.accuracyInflectionMs}
                                steepness={SCORING_CONFIG.accuracySteepness}
                                accuracyLinearDropMs={SCORING_CONFIG.accuracyLinearDropMs}
                                colorClass="text-emerald-400"
                                score={analysis.rawMath.accuracyRaw}
                            />
                            <div className="mt-4 space-y-1 text-[11px] text-stone-400 border-t border-white/5 pt-2">
                                <div className="flex justify-between"><span>Error:</span> <span className="text-white">{Math.round(analysis.rawMath.averageAbsOffsetMs)}ms</span></div>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                            <ScoreGraph 
                                label="Consistency Curve"
                                currentError={analysis.rawMath.stdDeviationMs}
                                inflection={analysis.rawMath.consistencyInflectionMs}
                                steepness={SCORING_CONFIG.consistencySteepness}
                                accuracyLinearDropMs={SCORING_CONFIG.accuracyLinearDropMs}
                                colorClass="text-amber-400"
                                score={analysis.rawMath.consistencyRawBeforePenalty}
                            />
                            <div className="mt-4 space-y-1 text-[11px] text-stone-400 border-t border-white/5 pt-2">
                                <div className="flex justify-between"><span>Variance:</span> <span className="text-white">{Math.round(analysis.rawMath.stdDeviationMs)}ms</span></div>
                                <div className="flex justify-between"><span>Penalty:</span> <span className="text-rose-400">-{Math.round(analysis.rawMath.totalFaults * analysis.rawMath.penaltyPerFault) / 10}</span></div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="mt-auto pt-4 flex flex-wrap justify-center gap-2 pb-2">
                {!isMobile && isDebugMode && (
                    <button 
                        type="button" 
                        onClick={() => setShowAnalysis(!showAnalysis)} 
                        className={`rounded-full border px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.22em] transition ${showAnalysis ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-200' : 'border-white/10 bg-white/[0.03] text-neutral-300 hover:bg-white/[0.06]'}`}
                    >
                        {showAnalysis ? 'Hide Details' : 'Math Details'}
                    </button>
                )}
                <button type="button" onClick={onPlayAgain} className="rounded-full bg-stone-200 px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-neutral-950 transition-transform hover:scale-[1.02] active:scale-95">Play Again</button>
                <button type="button" onClick={onBackToSetup} className="rounded-full border border-white/10 bg-white/[0.03] px-6 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-neutral-200 transition hover:bg-white/[0.06]">Back</button>
            </div>
        </div>
    );
}
