import React, { useState } from 'react';

const DEBUG_RESULTS_ENABLED = process.env.NEXT_PUBLIC_DEBUG_MODE === 'true';

export default function ResultView({
    score,
    tracks,
    expectedTaps,
    detailedResults,
    measureDuration,
    measures,
    lastAutoCorrectionMs,
    debugAnalysis,
    onTryAgain
}) {
    const [showDebug, setShowDebug] = useState(false);
    const matchedCount = detailedResults.filter((d) => d.actualTime !== null && !d.isExtra).length;
    const extraCount = detailedResults.filter((d) => d.isExtra).length;
    const missedCount = Math.max(0, expectedTaps.length - matchedCount);
    const coveragePct = expectedTaps.length > 0
        ? Math.round((matchedCount / expectedTaps.length) * 100)
        : 0;
    const clusterDebug = debugAnalysis?.clustering;
    const mobileEntries = clusterDebug?.mobileEntries || [];
    const clusterEntries = clusterDebug?.clusterEntries || [];
    const clusterToTrack = clusterDebug?.clusterToTrack || new Map();
    const scoreMatrix = clusterDebug?.matrix || [];
    const orderedClusters = clusterDebug?.orderedClusters || clusterEntries;

    const colorPalette = ['#22d3ee', '#f472b6', '#facc15', '#a3a3a3', '#c084fc'];

    const getClusterColor = (clusterIndex) => colorPalette[clusterIndex % colorPalette.length];

    const matrixMaxScore = scoreMatrix.flat().reduce((maxScore, cell) => (
        Number.isFinite(cell?.score) && cell.score > maxScore ? cell.score : maxScore
    ), 0);

    const getMatrixCellTone = (score) => {
        if (!Number.isFinite(score) || score <= 0) return 'rgba(255,255,255,0.04)';
        const normalized = matrixMaxScore > 0 ? Math.min(1, score / matrixMaxScore) : 0;
        return `rgba(34, 211, 238, ${0.08 + (normalized * 0.74)})`;
    };

    const renderTapMap = () => {
        if (!clusterDebug) return null;

        return (
            <div className="w-full rounded-3xl border border-cyan-300/15 bg-neutral-950/80 p-3 md:p-4 shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div>
                        <div className="text-sm font-bold tracking-wide text-cyan-100 uppercase">Tap Map</div>
                        <div className="text-xs text-neutral-500">Pressed locations, calculated centers and assignment in a map</div>
                    </div>
                    <div className="text-xs text-neutral-400">
                        Raw taps: {mobileEntries.length} · Clusters: {clusterEntries.length}
                    </div>
                </div>

                <div className="relative w-full aspect-square overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.08),transparent_36%),linear-gradient(to_bottom,rgba(255,255,255,0.03),rgba(255,255,255,0.01))]">
                    <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
                        <defs>
                            <pattern id="tap-map-grid" width="10" height="10" patternUnits="userSpaceOnUse">
                                <path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="0.6" />
                            </pattern>
                        </defs>

                        <rect x="0" y="0" width="100" height="100" fill="url(#tap-map-grid)" opacity="0.9" />
                        <line x1="50" y1="3" x2="50" y2="97" stroke="rgba(255,255,255,0.12)" strokeWidth="0.5" />
                        <line x1="3" y1="50" x2="97" y2="50" stroke="rgba(255,255,255,0.12)" strokeWidth="0.5" />
                        <text x="50" y="7" textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize="2.8" fontWeight="700">TOP</text>
                        <text x="50" y="98" textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize="2.8" fontWeight="700">BOTTOM</text>
                        <text x="6" y="52" textAnchor="start" fill="rgba(255,255,255,0.45)" fontSize="2.8" fontWeight="700">LEFT</text>
                        <text x="94" y="52" textAnchor="end" fill="rgba(255,255,255,0.45)" fontSize="2.8" fontWeight="700">RIGHT</text>

                        {mobileEntries.map((tap, index) => {
                            const clusterIndex = clusterDebug.assignments?.[index];
                            const cluster = clusterEntries[clusterIndex];
                            const color = Number.isFinite(clusterIndex) ? getClusterColor(clusterIndex) : '#9ca3af';
                            return cluster ? (
                                <line
                                    key={`tap-link-${index}`}
                                    x1={tap.x}
                                    y1={tap.y}
                                    x2={cluster.center.x}
                                    y2={cluster.center.y}
                                    stroke={color}
                                    strokeOpacity="0.18"
                                    strokeDasharray="1.5 2.5"
                                    strokeWidth="0.6"
                                />
                            ) : null;
                        })}

                        {mobileEntries.map((tap, index) => {
                            const clusterIndex = clusterDebug.assignments?.[index];
                            const color = Number.isFinite(clusterIndex) ? getClusterColor(clusterIndex) : '#9ca3af';
                            return (
                                <circle
                                    key={`tap-${index}`}
                                    cx={tap.x}
                                    cy={tap.y}
                                    r="1.15"
                                    fill={color}
                                    fillOpacity="0.9"
                                    stroke="rgba(0,0,0,0.45)"
                                    strokeWidth="0.3"
                                />
                            );
                        })}

                        {clusterEntries.map((cluster) => {
                            const mappedTrack = clusterToTrack.get(cluster.index);
                            
                            const fullTrack = mappedTrack ? tracks.find(t => t.id === mappedTrack.trackId) : null;
                            const color = getClusterColor(cluster.index);

                            return (
                                <g key={`cluster-${cluster.index}`}>
                                    <circle cx={cluster.center.x} cy={cluster.center.y} r="4.0" fill="none" stroke={color} strokeWidth="0.85" />
                                    <circle cx={cluster.center.x} cy={cluster.center.y} r="1.6" fill={color} fillOpacity="0.35" stroke={color} strokeWidth="0.5" />
                                    <text x={cluster.center.x + 2.2} y={cluster.center.y + 1.2} fill="rgba(255,255,255,0.9)" fontSize="3.2" fontWeight="700">
                                        C{cluster.index + 1}{fullTrack ? `→${fullTrack.key === ' ' ? 'SPACE' : fullTrack.key.toUpperCase()} (${fullTrack.pulses})` : ''}
                                    </text>
                                </g>
                            );
                        })}
                    </svg>
                </div>
            </div>
        );
    };

    return (
        <div className="w-full max-w-3xl h-full flex flex-col items-center animate-fade-in-up overflow-y-auto pr-2 md:pr-3">
            <h2 className="text-xl md:text-2xl font-light text-neutral-400 my-2 text-center tracking-wide">Your Score</h2>
            <div className="text-6xl md:text-7xl font-black text-stone-300 mb-4 md:mb-6 drop-shadow-lg text-center">
                {score.toFixed(1)}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 mb-5 md:mb-7">
                <button 
                    onClick={onTryAgain}
                    className="px-6 py-2.5 flex items-center gap-2 rounded-full bg-white/[0.03] border border-white/15 hover:bg-white/[0.06] transition-colors font-medium text-sm"
                >
                    Try Again
                </button>
                {DEBUG_RESULTS_ENABLED && debugAnalysis && (
                    <button
                        onClick={() => setShowDebug((prev) => !prev)}
                        className="sm:hidden px-5 py-2.5 rounded-full bg-cyan-400/10 border border-cyan-300/20 text-cyan-200 hover:bg-cyan-400/15 transition-colors font-medium text-sm"
                    >
                        {showDebug ? 'Hide Analysis' : 'Show Analysis'}
                    </button>
                )}
            </div>

            <div className="w-full max-w-2xl p-3 md:p-4 mb-4 md:mb-6 text-center">
                <div className="flex gap-6 justify-center">
                    {lastAutoCorrectionMs !== 0 && (
                        <div>
                            <div className="text-xs text-neutral-500 mb-1">Auto Correction</div>
                            <div className="text-sm font-bold text-stone-300">
                                {lastAutoCorrectionMs > 0 ? '+' : ''}{lastAutoCorrectionMs.toFixed(0)}ms
                            </div>
                        </div>
                    )}
                    {lastAutoCorrectionMs === 0 && (
                        <div>
                            <div className="text-xs text-neutral-500 mb-1">Auto Correction</div>
                            <div className="text-sm font-bold text-neutral-400">None detected</div>
                        </div>
                    )}
                </div>

                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div className="rounded-lg border border-white/10 bg-white/[0.02] px-2 py-2">
                        <div className="text-neutral-500">Matched</div>
                        <div className="text-stone-300 font-bold">{matchedCount}</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/[0.02] px-2 py-2">
                        <div className="text-neutral-500">Missed</div>
                        <div className="text-stone-300 font-bold">{missedCount}</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/[0.02] px-2 py-2">
                        <div className="text-neutral-500">Extra</div>
                        <div className="text-stone-300 font-bold">{extraCount}</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/[0.02] px-2 py-2">
                        <div className="text-neutral-500">Coverage</div>
                        <div className="text-stone-300 font-bold">{coveragePct}%</div>
                    </div>
                </div>
            </div>
      
            {/* VISUALIZATION */}
            <div className="w-full space-y-4 bg-white/[0.03] p-3 md:p-4 rounded-2xl border border-white/10 mb-2">
                {tracks.map(track => {
                    const assignedKey = track.key || '';
                    const displayKey = assignedKey === ' ' ? 'SPACE' : assignedKey.toUpperCase();
                    const expectedForTrack = expectedTaps.filter(e => e.trackId === track.id && e.measureIndex === 0);
          
                    const expectedBaseTimes = [...expectedForTrack.map(e => e.baseTime)];
                    const hitsForTrack = detailedResults.filter(d => d.trackId === track.id && d.actualTime !== null);
                    const totalRowsForTrack = measures + 1;

                    return (
                        <div key={track.id} className="relative bg-neutral-900/35 rounded-lg border border-white/10 mt-5 overflow-visible px-5 py-3">
                            <div className="hidden sm:absolute -top-3 left-4 px-2 bg-neutral-900 text-xs font-bold text-neutral-400 rounded border border-white/10 z-30">
                                Key &apos;{displayKey}&apos; ({track.pulses} Beats)
                            </div>
               
                            <div className="relative w-[94%] left-[3%] mt-2">
                                {/* Expected Base Lines */}
                                <div className="absolute inset-0 pointer-events-none">
                                    {expectedBaseTimes.map((baseT, idx) => (
                                        <div 
                                            key={`exp-${idx}`} 
                                            className="absolute top-0 bottom-0 w-[1px] bg-neutral-300 z-10 -ml-[0.5px] opacity-50"
                                            style={{ left: `${(baseT / measureDuration) * 100}%` }}
                                        />
                                    ))}
                                </div>

                                {/* compact horizontal lanes for each measure */}
                                <div className="relative z-20 flex flex-col gap-0.5">
                                    {Array.from({ length: totalRowsForTrack }).map((_, mIdx) => {
                                        const hitsInThisMeasure = hitsForTrack.filter(h => h.measureIndex === mIdx);
                                        const colors = ['bg-cyan-400', 'bg-pink-400', 'bg-yellow-400', 'bg-stone-400', 'bg-purple-400'];
                                        const colorCls = colors[mIdx % colors.length];

                                        return (
                                            <div key={`m-${mIdx}`} className="relative h-3.5 w-full bg-white/[0.04] rounded-sm overflow-visible">
                                                {/* Die echten Hits in dieser Row */}
                                                {hitsInThisMeasure.map((hit, hIdx) => {
                                                    let posPercent = ((hit.baseTime + hit.diff) / measureDuration) * 100;
                                                    posPercent = Math.max(-5, Math.min(105, posPercent));
                           
                                                    const isExtra = hit.isExtra;
                                                    const visualClasses = isExtra 
                                                        ? 'opacity-10 z-10'
                                                        : 'opacity-100 shadow-[0_0_4px_currentColor] z-30';
                           
                                                    return (
                                                        <div 
                                                            key={`act-${mIdx}-${hIdx}`}
                                                            className={`absolute top-0 bottom-0 w-1 ${colorCls} rounded-full transform -translate-x-1/2 transition-all cursor-help ${visualClasses}`}
                                                            style={{ left: `${posPercent}%` }}
                                                            title={`Measure ${mIdx + 1} ${isExtra ? '(Extra/Spam)' : ''}: ${hit.diff > 0 ? '+' : ''}${Math.round(hit.diff)}ms`}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    );
                })}
        
                <div className="flex flex-wrap justify-center gap-5 mt-6 p-4 bg-neutral-900/35 rounded-lg border border-white/10 text-xs text-neutral-400 tracking-widest">
                    {Array.from({ length: measures }).map((_, idx) => {
                        const colors = ['bg-cyan-400', 'bg-pink-400', 'bg-yellow-400', 'bg-stone-400', 'bg-purple-400'];
                        const colorCls = colors[idx % colors.length];
                        return (
                            <span key={`legend-${idx}`} className="flex items-center gap-2"><div className={`w-4 h-2 ${colorCls} rounded-full`}></div> Bar {idx + 1}</span>
                        );
                    })}
                    <span className="flex items-center gap-2">
                        <div className={`w-4 h-2 ${['bg-cyan-400', 'bg-pink-400', 'bg-yellow-400', 'bg-stone-400', 'bg-purple-400'][measures % 5]} rounded-full`}></div> Final Downbeat
                    </span>
                </div>
            </div>

            {showDebug && debugAnalysis && clusterDebug && (
                <>
                    <div className="w-full max-w-2xl mt-2">
                        {renderTapMap()}
                    </div>
                    <div className="w-full max-w-2xl mt-4 p-3 md:p-4 rounded-2xl border border-cyan-300/15 bg-cyan-400/[0.04] space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="text-sm font-bold tracking-wide text-cyan-100 uppercase">Debug View</h3>
                            <div className="text-xs text-neutral-400">
                                Raw taps: {mobileEntries.length} · Clusters: {clusterEntries.length} · Latency: {debugAnalysis.selectedLatencyCompMs?.toFixed?.(0) || 0}ms
                            </div>
                        </div>

                        {scoreMatrix.length > 0 && (
                            <div className="w-full overflow-x-auto rounded-xl border border-white/10 bg-white/[0.03] p-2">
                                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">Cluster to Track Matrix</div>
                                <div className="min-w-max">
                                    <div className="grid gap-1" style={{ gridTemplateColumns: `140px repeat(${orderedClusters.length}, minmax(72px, 1fr))` }}>
                                        <div className="px-2 py-1 text-[11px] text-neutral-500">Key \ Cluster</div>
                                        {orderedClusters.map((cluster) => (
                                            <div key={`matrix-head-cluster-${cluster.index}`} className="px-2 py-1 text-[11px] font-semibold text-stone-300 text-center">
                                                C{cluster.index + 1}
                                            </div>
                                        ))}

                                        {tracks.map((track) => (
                                            <React.Fragment key={`matrix-row-track-${track.id}`}>
                                                <div className="px-2 py-2 text-[11px] text-neutral-400">
                                                    {track.key === ' ' ? 'SPACE' : track.key.toUpperCase()}
                                                </div>
                                                {orderedClusters.map((cluster, clusterColumnIndex) => {
                                                    const clusterRow = scoreMatrix[clusterColumnIndex] || [];
                                                    const trackColumnIndex = tracks.findIndex((candidate) => candidate.id === track.id);
                                                    const cell = trackColumnIndex >= 0 ? clusterRow[trackColumnIndex] : null;
                                                    const mappedTrack = clusterToTrack.get(cluster.index);
                                                    const isSelected = mappedTrack?.trackId === track.id;
                                                    return (
                                                        <div
                                                            key={`matrix-cell-${track.id}-${cluster.index}`}
                                                            className={`rounded-md border px-2 py-2 text-center text-[11px] ${isSelected ? 'border-cyan-200/30 text-cyan-50' : 'border-white/10 text-neutral-300'}`}
                                                            style={{ backgroundColor: getMatrixCellTone(cell?.score) }}
                                                        >
                                                            {Number.isFinite(cell?.rhythmFit) ? `${Math.round(cell.rhythmFit * 100)}%` : '—'}
                                                            {Number.isFinite(cell?.avgErrorMs) && (
                                                                <div className="text-[10px] text-neutral-500 mt-0.5">{Math.round(cell.avgErrorMs)}ms</div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </React.Fragment>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                            {clusterEntries.map((cluster) => {
                                const mappedTrack = clusterToTrack.get(cluster.index);
                                return (
                                    <div key={`cluster-row-${cluster.index}`} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="font-semibold text-stone-200">Cluster {cluster.index + 1}</div>
                                            <div className="text-neutral-400">{cluster.taps.length} taps</div>
                                        </div>
                                        <div className="mt-1 text-neutral-400">
                                            Center: {cluster.center.x.toFixed(1)}%, {cluster.center.y.toFixed(1)}%
                                        </div>
                                        <div className="mt-1 text-neutral-400">
                                            Track: {mappedTrack ? (mappedTrack.trackKey === ' ' ? 'SPACE' : mappedTrack.trackKey.toUpperCase()) : 'unmapped'}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="text-xs text-neutral-500">
                            Matrix value = Rhythm fit for this key (higher is better). Second line shows average distance to the nearest pulse in ms (lower is better).
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}