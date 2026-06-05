import React, { useEffect, useRef } from 'react';
import { SCORING_CONFIG } from './constants/gameConfig';
import { formatMs } from './utils/mathHelpers';

function StatCard({ label, value, highlight = false }) {
    return (
        <div className={`rounded-2xl border px-3 py-3 ${highlight ? 'border-amber-500/30 bg-amber-500/10' : 'border-white/10 bg-white/[0.03]'}`}>
            <div className={`text-[10px] uppercase tracking-[0.2em] ${highlight ? 'text-amber-200/80' : 'text-neutral-500'}`}>{label}</div>
            <div className={`mt-1 text-lg font-semibold ${highlight ? 'text-amber-100' : 'text-stone-100'}`}>{value}</div>
        </div>
    );
}

function TempoDriftGraph({ pairs }) {
    const playedBeats = pairs.filter(p => !p.missed && p.phase === 'silence');
    if (playedBeats.length < 2) return (
        <div className="flex h-32 items-center justify-center rounded-lg border border-white/5 bg-black/20 text-xs text-neutral-500">
            Not enough data for Tempo Drift analysis.
        </div>
    );

    const maxAbsOffset = Math.max(50, ...playedBeats.map(p => Math.abs(p.deltaMs)));
    const maxIndex = playedBeats.length - 1;
    
    const points = playedBeats.map((p, i) => {
        const x = (i / maxIndex) * 100;
        const y = 50 - ((p.deltaMs / maxAbsOffset) * 50);
        return `${x},${y}`;
    }).join(' ');

    return (
        <div className="flex flex-col gap-2">
            <div className="flex justify-between text-[10px] uppercase tracking-wider text-neutral-500">
                <span>Tempo Drift</span>
            </div>
            
            <div className="relative h-32 w-full rounded-lg border border-white/5 bg-black/20 p-2">
                <div className="relative h-full w-full">
                    {/* Y-Achsen Labels */}
                    <div className="absolute -left-1 top-0 text-[8px] text-amber-500/80 -translate-y-1/2">LATE (+{Math.round(maxAbsOffset)}ms)</div>
                    <div className="absolute -left-1 top-1/2 text-[8px] text-emerald-500/80 -translate-y-1/2">0</div>
                    <div className="absolute -left-1 bottom-0 text-[8px] text-cyan-500/80 translate-y-1/2">EARLY (-{Math.round(maxAbsOffset)}ms)</div>
                    
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
                        <line x1="0" y1="50" x2="100" y2="50" stroke="#10b981" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity="0.6" strokeDasharray="2" />
                        
                        <polyline
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinejoin="round"
                            vectorEffect="non-scaling-stroke"
                            className="text-white/80 drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]"
                            points={points}
                        />

                        {playedBeats.map((p, i) => {
                            const x = (i / maxIndex) * 100;
                            const y = 50 - ((p.deltaMs / maxAbsOffset) * 50);
                            const isLate = p.deltaMs > 0;
                            return (
                                <circle 
                                    key={i} 
                                    cx={x} 
                                    cy={y} 
                                    r="2" 
                                    vectorEffect="non-scaling-stroke"
                                    className={isLate ? "fill-amber-400" : "fill-cyan-400"}
                                />
                            );
                        })}
                    </svg>
                </div>
            </div>
            
            <div className="flex justify-between text-[8px] text-neutral-600">
                <span>Start (Silence)</span>
                <span>Timepoint</span>
                <span>End</span>
            </div>
        </div>
    );
}

function CombinedTimelineRow({ startMs, endMs, silenceStartMs, silenceEndMs, expectedBeats = [], pairs = [], extraTaps = [], missedBeats = [], earlyLateThresholdMs = 15 }) {
    const outerRef = useRef(null);
    const innerRef = useRef(null);
    const zoomRef = useRef(1);
    const zoomLabelRef = useRef(null); 

    // Zoom
    useEffect(() => {
        const outer = outerRef.current;
        const inner = innerRef.current;
        if (!outer || !inner) return;

        let initialDistance = null;
        let startZoom = 1;

        const updateZoom = (newZoom, pinchCenterX) => {
            const oldZoom = zoomRef.current;
            const rect = outer.getBoundingClientRect();
            const xWithinVisible = pinchCenterX - rect.left;
            const absolutePinchX = outer.scrollLeft + xWithinVisible;
            const percentUnderPinch = absolutePinchX / (rect.width * oldZoom);

            zoomRef.current = newZoom;
            inner.style.width = `${newZoom * 100}%`;
            outer.scrollLeft = (rect.width * newZoom) * percentUnderPinch - xWithinVisible;
            
            if (zoomLabelRef.current) {
                zoomLabelRef.current.textContent = `${newZoom.toFixed(1)}x`;
                if (newZoom > 1.1) {
                    zoomLabelRef.current.classList.remove('opacity-0');
                    zoomLabelRef.current.classList.add('opacity-100');
                } else {
                    zoomLabelRef.current.classList.remove('opacity-100');
                    zoomLabelRef.current.classList.add('opacity-0');
                }
            }
        };

        const onTouchMove = (e) => {
            if (e.touches.length === 2 && initialDistance) {
                e.preventDefault();
                const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
                updateZoom(Math.min(Math.max(1, startZoom * (dist / initialDistance)), 30), (e.touches[0].clientX + e.touches[1].clientX) / 2);
            }
        };

        const onTouchStart = (e) => { if (e.touches.length === 2) { initialDistance = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); startZoom = zoomRef.current; } };
        const onWheel = (e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); updateZoom(Math.min(Math.max(1, zoomRef.current - e.deltaY * 0.02), 30), e.clientX); } };

        outer.addEventListener('touchstart', onTouchStart, { passive: false });
        outer.addEventListener('touchmove', onTouchMove, { passive: false });
        outer.addEventListener('wheel', onWheel, { passive: false });
        return () => { outer.removeEventListener('touchstart', onTouchStart); outer.removeEventListener('touchmove', onTouchMove); outer.removeEventListener('wheel', onWheel); };
    }, []);

    const widthMs = Math.max(1, endMs - startMs);

    return (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 md:p-4 mt-3">
            <div className="mb-4 flex items-center justify-between text-[11px] uppercase tracking-widest text-neutral-500">
                <div className="flex items-center gap-4">
                    <span>Timeline</span>
                    <span 
                        ref={zoomLabelRef} 
                        className="text-cyan-400 font-mono transition-opacity duration-150 opacity-0"
                    >
                        1.0x
                    </span>
                </div>
                <div className="flex gap-4">
                    <span className="flex items-center gap-1.5"><div className="w-2 h-2 bg-amber-500/40 border border-amber-500/50" />Silence</span>
                    <span className="flex items-center gap-1.5"><div className="w-2 h-2 bg-fuchsia-500 shadow-[0_0_5px_#d946ef]" />Downbeat</span>
                </div>
            </div>
            
            <div 
                ref={outerRef}
                className="relative h-28 w-full overflow-x-auto overflow-y-hidden rounded-xl border border-white/10 bg-neutral-950/50 no-scrollbar"
                style={{ 
                    WebkitOverflowScrolling: 'touch',
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none'
                }}
            >
                {/* CSS Inline-Hack für Chrome/Safari */}
                <style dangerouslySetInnerHTML={{__html: `
                    .no-scrollbar::-webkit-scrollbar { display: none; }
                `}} />

                <div 
                    ref={innerRef} 
                    className="relative h-full min-w-full" 
                    style={{ width: `100%`, willChange: 'width' }}
                >
                    {/* Silence Zone */}
                    <div className="absolute inset-y-0 bg-amber-500/5 border-x border-amber-500/10"
                        style={{ left: `${((silenceStartMs - startMs) / widthMs) * 100}%`, width: `${((silenceEndMs - silenceStartMs) / widthMs) * 100}%` }} />
                    
                    {/* Beats */}
                    {expectedBeats.map(bt => (
                        <div key={bt} className={`absolute inset-y-0 ${Math.abs(bt - silenceEndMs) < 1 ? 'w-[2px] bg-fuchsia-500 z-10' : 'w-px bg-white/10'}`} 
                            style={{ left: `${((bt - startMs) / widthMs) * 100}%`, transform: 'translateX(-50%)' }} />
                    ))}
                    
                    {/* Taps */}
                    {pairs.filter(p => !p.missed).map(pair => {
                        const isReturn = Math.abs(pair.expectedTime - silenceEndMs) < 1;
                        const diff = Math.round(pair.deltaMs);
                        return (
                            <div key={pair.expectedTime} 
                                className="group absolute top-4 bottom-4 w-8 flex justify-center items-center z-20 hover:z-50 cursor-crosshair"
                                style={{ left: `${((pair.correctedTime - startMs) / widthMs) * 100}%`, transform: 'translateX(-50%)' }}>
                                <div className={`h-full rounded-full transition-all group-hover:scale-y-110 ${isReturn ? 'w-1 bg-fuchsia-300 shadow-[0_0_10px_#d946ef]' : 'w-[3px] ' + (diff < -earlyLateThresholdMs ? 'bg-emerald-400' : diff > earlyLateThresholdMs ? 'bg-amber-400' : 'bg-cyan-400')}`} />
                                
                                <div className="absolute top-1/3 opacity-0 group-hover:opacity-100 transition-all pointer-events-none scale-90 group-hover:scale-100 z-50">
                                    <div className="bg-neutral-900 border border-white/20 text-white text-[10px] px-2 py-1 rounded-md shadow-2xl font-mono whitespace-nowrap">
                                        {diff > 0 ? '+' : ''}{diff} ms
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {/* Missed Beats */}
                    {missedBeats.map((time, idx) => {
                        const leftPct = ((time - startMs) / widthMs) * 100;
                        if (leftPct < 0 || leftPct > 100) return null;
                        return (
                            <div 
                                key={`missed-${idx}`} 
                                className="group absolute inset-y-0 w-4 z-10 flex justify-center cursor-crosshair hover:z-50" 
                                style={{ left: `${leftPct}%`, transform: 'translateX(-50%)' }} 
                            >
                                <div className="w-[2px] h-full bg-red-500 shadow-[0_0_8px_#ef4444]" />
                                <div className="absolute top-1/2 left-full ml-1 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                    <div className="bg-red-900/90 text-red-100 text-[10px] font-mono px-1.5 py-0.5 rounded whitespace-nowrap border border-red-500/30">
                                        Missed
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {/* Extra Taps */}
                    {extraTaps.map((tap, idx) => {
                        const leftPct = ((tap.correctedTime - startMs) / widthMs) * 100;
                        if (leftPct < 0 || leftPct > 100) return null; 
                        return (
                            <div 
                                key={`extra-${idx}`} 
                                className="group absolute top-4 bottom-4 w-6 z-30 flex justify-center cursor-crosshair hover:z-50" 
                                style={{ left: `${leftPct}%`, transform: 'translateX(-50%)' }} 
                            >
                                <div className="w-[3px] h-full rounded-full bg-rose-400 shadow-[0_0_6px_#f43f5e]" />
                                <div className="absolute top-1/2 left-full ml-1 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                    <div className="bg-rose-900/90 text-rose-100 text-[10px] font-mono px-1.5 py-0.5 rounded whitespace-nowrap border border-rose-500/30">
                                        Extra
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}



function ScoreGraph({ label, currentError, inflection, steepness, linearDropMs, colorClass, score }) {
    const points = [];
    const maxMs = Math.max(inflection * 2.5, currentError * 1.15); 
    
    for (let x = 0; x <= maxMs; x += maxMs / 50) {
        const y = 100 / (1 + Math.pow(x / inflection, steepness) + (x / linearDropMs));
        points.push(`${(x / maxMs) * 100},${100 - y}`);
    }

    const userX = (currentError / maxMs) * 100;
    const userY = 100 - score;

    return (
        <div className="flex flex-col gap-2">
            <div className="flex justify-between text-[10px] uppercase tracking-wider text-neutral-500">
                <span>{label}</span>
                <span className={colorClass}>Score: {Math.round(score)}%</span>
            </div>
            
            <div className="relative h-32 w-full rounded-lg border border-white/5 bg-black/20 p-2">
                <div className="relative h-full w-full">
                    <div className="absolute -left-1 top-0 text-[8px] text-neutral-600 -translate-y-1/2">100</div>
                    <div className="absolute -left-1 bottom-0 text-[8px] text-neutral-600 translate-y-1/2">0</div>
                    
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
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

export default function ResultView({ analysis, onPlayAgain, onBackToSetup, isMobile, showAnalysis, onToggleAnalysis }) {
    const isDebugMode = process.env.NEXT_PUBLIC_DEBUG_MODE === 'true';

    if (!analysis) return null;

    return (
        <div className="w-full max-w-4xl mx-auto flex-1 flex flex-col">            
            <div className="mb-4 flex flex-col md:flex-row items-start md:items-end justify-between gap-4">
                {!isMobile && (
                    <div>
                        <div className="text-xs uppercase tracking-[0.34em] text-neutral-500">Session Complete</div>
                        <div className="mt-1 text-4xl font-black text-stone-100">Hold The Tempo</div>
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
                earlyLateThresholdMs={analysis.rawMath?.earlyLateThresholdMs || 15}
            />

            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                <StatCard label="Avg Offset" value={formatMs(analysis.averageOffsetMs)} />
                {/* <StatCard label="Early/Late Taps" value={`${analysis.earlyCount} / ${analysis.lateCount}`} /> */}
                <StatCard label="Missed/Extra" value={`${analysis.missedBeats.length} / ${analysis.extraTaps.length}`} />
                <StatCard label="Drift" value={`${analysis.driftSlope.toFixed(2)} ms/Beat`} />
                <StatCard
                    label="Tendency"
                    value={
                        analysis.tempoTrend === 'speeding_up' ? 'Rushing' :
                            analysis.tempoTrend === 'slowing_down' ? 'Dragging' :
                                analysis.tempoTrend === 'wobbly' ? 'Wobbly' :
                                    'Steady'
                    }
                />
            </div>

            {showAnalysis && (
                <div className="mt-3 flex flex-col gap-4">
                    <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                        <TempoDriftGraph pairs={analysis.pairs} />
                        <div className="mt-4 text-[11px] text-stone-400 border-t border-white/5 pt-2 text-center">
                            Drift <strong>{analysis.driftSlope > 0 ? '+' : ''}{analysis.driftSlope.toFixed(2)} ms</strong> per Beat.
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                            <ScoreGraph 
                                label="Accuracy Curve (General)"
                                currentError={analysis.rawMath.effectiveOffsetMs}
                                inflection={analysis.rawMath.accuracyInflectionMs}
                                steepness={SCORING_CONFIG.accuracySteepness}
                                linearDropMs={analysis.beatMs * SCORING_CONFIG.accuracyLinearDropPct}
                                colorClass="text-emerald-400"
                                score={analysis.rawMath.generalAccuracyRaw}
                            />
                            <div className="mt-4 space-y-1 text-[11px] text-stone-400 border-t border-white/5 pt-2">
                                <div className="flex justify-between"><span>Leniency Multiplier:</span> <span className="text-white">{analysis.rawMath.leniencyMultiplier.toFixed(2)}x</span></div>
                                <div className="flex justify-between mt-1"><span>Base Error (Raw):</span> <span className="text-white">{Math.round(analysis.rawMath.averageAbsOffsetMs)}ms</span></div>
                                <div className="flex justify-between"><span>Effective Error (Perfect Zone applied):</span> <span className="text-emerald-300">{Math.round(analysis.rawMath.effectiveOffsetMs)}ms</span></div>
                                
                                <div className="flex justify-between border-t border-white/5 mt-2 pt-2"><span>Downbeat Error (Raw):</span> <span className="text-white">{Math.round(analysis.rawMath.downbeatOffsetMs)}ms</span></div>
                                <div className="flex justify-between"><span>Downbeat Effective Error:</span> <span className="text-emerald-300">{Math.round(analysis.rawMath.effectiveDownbeatOffsetMs)}ms</span></div>
                                
                                <div className="flex justify-between border-t border-white/5 mt-2 pt-2"><span>General Accuracy ({(1 - SCORING_CONFIG.downbeatAccuracyWeight) * 100}%):</span> <span className="text-white">{analysis.rawMath.generalAccuracyRaw.toFixed(1)}%</span></div>
                                <div className="flex justify-between"><span>Downbeat Accuracy ({SCORING_CONFIG.downbeatAccuracyWeight * 100}%):</span> <span className="text-white">{analysis.rawMath.downbeatAccuracyRaw.toFixed(1)}%</span></div>
                                <div className="flex justify-between font-bold"><span>Total Accuracy Raw:</span> <span className="text-emerald-300">{analysis.rawMath.accuracyRaw.toFixed(1)}%</span></div>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                            <ScoreGraph 
                                label="Consistency Curve"
                                currentError={analysis.rawMath.effectiveJitterMs}
                                inflection={analysis.rawMath.consistencyInflectionMs}
                                steepness={SCORING_CONFIG.consistencySteepness}
                                linearDropMs={analysis.beatMs * SCORING_CONFIG.consistencyLinearDropPct}
                                colorClass="text-amber-400"
                                score={analysis.rawMath.consistencyRawBeforePenalty}
                            />
                            <div className="mt-4 space-y-1 text-[11px] text-stone-400 border-t border-white/5 pt-2">
                                <div className="flex justify-between"><span>Base Jitter (Interval Change):</span> <span className="text-white">{Math.round(analysis.rawMath.jitterMs)}ms</span></div>
                                <div className="flex justify-between"><span>Effective Jitter (Zone applied):</span> <span className="text-amber-300">{Math.round(analysis.rawMath.effectiveJitterMs)}ms</span></div>
                                
                                <div className="flex justify-between border-t border-white/5 mt-2 pt-2"><span>Consistency Base Score:</span> <span className="text-white">{analysis.rawMath.consistencyRawBeforePenalty.toFixed(1)}%</span></div>
                                <div className="flex justify-between"><span>Faults (Miss/Extra):</span> <span className="text-rose-400">{analysis.rawMath.totalFaults}</span></div>
                                <div className="flex justify-between"><span>Penalty ({analysis.rawMath.penaltyPerFault.toFixed(1)}% per fault):</span> <span className="text-rose-400">-{Math.round(analysis.rawMath.totalFaults * analysis.rawMath.penaltyPerFault * 10) / 10}%</span></div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="mt-auto pt-4 flex flex-wrap justify-center gap-2 pb-4">
                {isDebugMode && (
                    <button 
                        type="button" 
                        onClick={() => onToggleAnalysis()} 
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
