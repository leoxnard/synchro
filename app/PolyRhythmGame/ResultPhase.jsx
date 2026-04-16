import React from 'react';

export default function ResultPhase({
  score,
  tracks,
  expectedTapsRef,
  detailedResultsRef,
  measureDuration,
  measures,
  setGameState
}) {
  return (
    <div className="w-full max-w-4xl flex flex-col items-center animate-fade-in-up pb-12">
      <h2 className="text-3xl font-light text-neutral-400 mb-4 text-center">Your Score</h2>
      <div className="text-8xl font-black text-emerald-400 mb-8 drop-shadow-lg text-center">
        {score}%
      </div>
      <button 
        onClick={() => setGameState('setup')}
        className="px-8 py-3 flex items-center gap-2 rounded-lg bg-neutral-800 border border-neutral-600 hover:bg-neutral-700 transition-colors font-medium text-lg mb-12"
      >
        Try Again <span className="text-xs bg-neutral-700 px-2 py-1 rounded text-neutral-300 ml-1 tracking-widest">Space</span>
      </button>
      
      {/* VISUALIZATION */}
      <div className="w-full space-y-5 bg-neutral-800/50 p-5 rounded-2xl border border-neutral-700/50">
        {tracks.map((track, i) => {
          const assignedKey = track.key || '';
          const displayKey = assignedKey === ' ' ? 'SPACE' : assignedKey.toUpperCase();
          const expectedForTrack = expectedTapsRef.current.filter(e => e.trackId === track.id && e.measureIndex === 0);
          
          // Die Ziele (Expected Base Times) auf dem Raster
          const expectedBaseTimes = [...expectedForTrack.map(e => e.baseTime)];

          // Nur Hits filtern, die tatsächlich getätigt wurden (actualTime !== null)
          const hitsForTrack = detailedResultsRef.current.filter(d => d.trackId === track.id && d.actualTime !== null);

          // Normale Takte + 1 Abschluss-Downbeat-Takt = (measures + 1) permanente Reihen
          // Zwingt die Grafik dazu exakt passend der Takte zu bleiben, auch wenn vorher 
          // (im Count-in, negative Zeit) oder stark danach Spams getätigt wurden.
          const totalRowsForTrack = measures + 1;

          return (
            <div key={track.id} className="relative bg-neutral-900/50 rounded-lg border border-neutral-700 mt-6 overflow-visible px-6 py-4">
               <div className="absolute -top-3 left-4 px-2 bg-neutral-800 text-xs font-bold text-neutral-400 rounded border border-neutral-700 z-30">
                 Key '{displayKey}' ({track.pulses} Beats)
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
                     const colors = ['bg-cyan-400', 'bg-pink-400', 'bg-yellow-400', 'bg-emerald-400', 'bg-purple-400'];
                     const colorCls = colors[mIdx % colors.length];

                     return (
                       <div key={`m-${mIdx}`} className="relative h-4 w-full bg-neutral-800/40 rounded-sm overflow-visible">
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
        
        <div className="flex flex-wrap justify-center gap-6 mt-8 p-4 bg-neutral-900/50 rounded-lg border border-neutral-800 text-xs text-neutral-400 tracking-widest">
           {Array.from({ length: measures }).map((_, idx) => {
             const colors = ['bg-cyan-400', 'bg-pink-400', 'bg-yellow-400', 'bg-emerald-400', 'bg-purple-400'];
             const colorCls = colors[idx % colors.length];
             return (
               <span key={`legend-${idx}`} className="flex items-center gap-2"><div className={`w-4 h-2 ${colorCls} rounded-full`}></div> Bar {idx + 1}</span>
             );
           })}
           <span className="flex items-center gap-2">
             <div className={`w-4 h-2 ${['bg-cyan-400', 'bg-pink-400', 'bg-yellow-400', 'bg-emerald-400', 'bg-purple-400'][measures % 5]} rounded-full`}></div> Final Downbeat
           </span>
        </div>
      </div>
    </div>
  );
}