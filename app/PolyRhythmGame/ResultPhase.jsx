import React from 'react';

export default function ResultPhase({
    score,
    tracks,
    expectedTaps,
    detailedResults,
    measureDuration,
    measures,
    lastAutoCorrectionMs,
    hasManualCalibration,
    setGameState
}) {
    return (
        <div className="w-full max-w-4xl flex flex-col items-center animate-fade-in-up overflow-y-auto pr-1">
            <h2 className="text-2xl font-light text-neutral-400 mb-3 text-center tracking-wide">Your Score</h2>
            <div className="text-7xl font-black text-stone-300 mb-6 drop-shadow-lg text-center">
                {score}%
            </div>
            <button 
                onClick={() => setGameState('setup')}
                className="px-7 py-2.5 flex items-center gap-2 rounded-full bg-white/[0.03] border border-white/15 hover:bg-white/[0.06] transition-colors font-medium text-sm mb-8"
            >
                Try Again
            </button>

            <div className="w-full max-w-2xl p-4 mb-6 text-center">
                <div className="text-sm text-neutral-400 mb-3">Audio Correction</div>
                <div className="flex gap-6 justify-center">
                    <div>
                        <div className="text-xs text-neutral-500 mb-1">Calibration Mode</div>
                        <div className={`text-sm font-bold ${hasManualCalibration ? 'text-cyan-300' : 'text-amber-300'}`}>
                            {hasManualCalibration ? 'Manual' : 'Auto-Detect'}
                        </div>
                    </div>
                    {!hasManualCalibration && lastAutoCorrectionMs !== 0 && (
                        <div>
                            <div className="text-xs text-neutral-500 mb-1">Auto Correction</div>
                            <div className="text-sm font-bold text-stone-300">
                                {lastAutoCorrectionMs > 0 ? '+' : ''}{lastAutoCorrectionMs}ms
                            </div>
                        </div>
                    )}
                    {!hasManualCalibration && lastAutoCorrectionMs === 0 && (
                        <div>
                            <div className="text-xs text-neutral-500 mb-1">Auto Correction</div>
                            <div className="text-sm font-bold text-neutral-400">None detected</div>
                        </div>
                    )}
                </div>
            </div>
      
            {/* VISUALIZATION */}
            <div className="w-full space-y-4 bg-white/[0.03] p-4 rounded-2xl border border-white/10">
                {tracks.map(track => {
                    const assignedKey = track.key || '';
                    const displayKey = assignedKey === ' ' ? 'ENTER' : assignedKey.toUpperCase();
                    const expectedForTrack = expectedTaps.filter(e => e.trackId === track.id && e.measureIndex === 0);
          
                    const expectedBaseTimes = [...expectedForTrack.map(e => e.baseTime)];
                    const hitsForTrack = detailedResults.filter(d => d.trackId === track.id && d.actualTime !== null);
                    const totalRowsForTrack = measures + 1;

                    return (
                        <div key={track.id} className="relative bg-neutral-900/35 rounded-lg border border-white/10 mt-5 overflow-visible px-5 py-3">
                            <div className="absolute -top-3 left-4 px-2 bg-neutral-900 text-xs font-bold text-neutral-400 rounded border border-white/10 z-30">
                                Key &apos;{displayKey}&apos; ({track.pulses} Beats)
                            </div>
               
                            <div className="relative w-[94%] left-[3%] mt-2">
                                {/* Globale Base lines (Expected), die über alle Lanes gehen */}
                                <div className="absolute inset-0 pointer-events-none">
                                    {expectedBaseTimes.map((baseT, idx) => (
                                        <div 
                                            key={`exp-${idx}`} 
                                            className="absolute top-0 bottom-0 w-[1px] bg-neutral-300 z-10 -ml-[0.5px] opacity-50"
                                            style={{ left: `${(baseT / measureDuration) * 100}%` }}
                                        />
                                    ))}
                                </div>

                                {/* Kompaktere horizontale Lanes für jeden Measure */}
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
                           
                                                    // Unterscheidung zwischen dem eigentlich gezählten "Closest Tap" und Extra/Spam-Taps
                                                    const isExtra = hit.isExtra;
                                                    const visualClasses = isExtra 
                                                        ? 'opacity-10 z-10' // Extra Taps: Durchsichtig & etwas kleiner
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
        </div>
    );
}