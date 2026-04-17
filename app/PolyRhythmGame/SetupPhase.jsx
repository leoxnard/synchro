import React from 'react';

function ChevronIcon({ direction }) {
    const points = direction === 'up' ? '6 9 12 3 18 9' : '6 7 12 13 18 7';

    return (
        <svg viewBox="0 0 24 16" aria-hidden="true" className="h-1/2 w-1/2">
            <polyline
                points={points}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function NumberStepper({
    label,
    value,
    onChange,
    min,
    max,
    step = 1,
    compact = false,
    className = ''
}) {
    const handleStep = (direction) => {
        const nextValue = Number(value) + (direction * step);
        const clampedValue = Math.min(max, Math.max(min, nextValue));
        onChange(clampedValue);
    };

    return (
        <div className={`flex flex-col gap-2 relative group ${className}`}>
            {label && <label className="text-xs text-neutral-400 uppercase tracking-widest font-bold">{label}</label>}
            <div className="relative">
                <input
                    type="number"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(e) => onChange(Number(e.target.value))}
                    className={`w-full bg-neutral-900 rounded-lg pl-6 border border-neutral-700 focus:border-stone-400 focus:outline-none transition-colors font-bold text-center appearance-none ${compact ? 'h-9 px-2 pr-8 text-base' : 'h-11 px-3 pr-10 text-lg'}`}
                />
                <div className="absolute right-1 top-1 bottom-1 aspect-[1/2] flex flex-col rounded-md overflow-hidden border border-neutral-700 bg-neutral-800/80">
                    <button
                        type="button"
                        onClick={() => handleStep(1)}
                        aria-label={label ? `${label} increase` : 'Increase value'}
                        className="flex-1 flex items-center justify-center text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700/70 transition-colors"
                    >
                        <ChevronIcon direction="up" />
                    </button>
                    <div className="h-px bg-neutral-700" />
                    <button
                        type="button"
                        onClick={() => handleStep(-1)}
                        aria-label={label ? `${label} decrease` : 'Decrease value'}
                        className="flex-1 flex items-center justify-center text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700/70 transition-colors"
                    >
                        <ChevronIcon direction="down" />
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function SetupPhase({
    tracks,
    addTrack,
    updateTrack,
    removeTrack,
    startGame,
    onForceCalibrate,
    onResetCalibration,
    latencyCompMs,
    hasManualCalibration,
    bpm,
    setBpm,
    measures,
    setMeasures,
    beatsPerMeasure,
    setBeatsPerMeasure
}) {
    return (
        <div className="w-full h-full relative flex flex-col p-1">
            <div className="w-full relative flex flex-col flex-1 pb-16">
                <span className="text-2xl font-light text-neutral-400 mb-3 text-center tracking-wide border-b border-white/10 pb-2">Polyrhythm</span>
                <div className="mb-5 pb-3 border-b border-white/10">
                    <div className="flex items-center justify-between gap-3 text-xs text-neutral-400">
                        <div className="flex gap-4 justify-center">
                            <div className="flex flex-col items-center">
                                <span className="text-neutral-500 mb-1">Audio Offset</span>
                                <span className={`font-bold ${latencyCompMs !== 0 ? (hasManualCalibration ? 'text-cyan-300' : 'text-amber-300') : 'text-neutral-400'}`}>
                                    {latencyCompMs > 0 ? '+' : ''}{latencyCompMs}ms
                                </span>
                            </div>
                            <div className="flex flex-col items-center">
                                <span className="text-neutral-500 mb-1">Calibration</span>
                                <span className={`font-bold ${hasManualCalibration ? 'text-cyan-300' : 'text-neutral-400'}`}>
                                    {hasManualCalibration ? 'Manual' : 'Auto'}
                                </span>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={hasManualCalibration ? onResetCalibration : onForceCalibrate}
                            className="shrink-0 px-3 py-1.5 rounded-full border border-white/12 bg-white/[0.02] text-[11px] font-semibold tracking-wide text-neutral-400 hover:text-neutral-200 hover:border-white/20 hover:bg-white/[0.05] transition-colors"
                        >
                            {hasManualCalibration ? 'Clear Calibration' : 'Run Calibration'}
                        </button>
                    </div>
                </div>
      
                <div className="flex gap-3 mb-5 pb-5 border-b border-white/10">
                    <NumberStepper label="Tempo (BPM)" value={bpm} onChange={setBpm} min={30} max={240} step={5} className="flex-1" />
                    <NumberStepper label="Bars" value={measures} onChange={setMeasures} min={1} max={16} className="flex-1" />
                    <NumberStepper label="Beats per Bar" value={beatsPerMeasure} onChange={setBeatsPerMeasure} min={1} max={16} className="flex-1" />
                </div>
      
                <div className="space-y-3 mb-5 flex-1">
                    {tracks.map(track => {
                        const assignedKey = track.key || '';
                        const displayKey = assignedKey === ' ' ? 'ENTER' : assignedKey.toUpperCase();
          
                        return (
                            <div key={track.id} className="flex items-center gap-4">
                                <div className="flex-1 p-1 flex items-center justify-between transition-colors">
                                    <div className="w-20">
                                        <NumberStepper
                                            value={track.pulses}
                                            onChange={(nextValue) => updateTrack(track.id, 'pulses', nextValue)}
                                            min={1}
                                            max={16}
                                        />
                                    </div>
                                    <span className="text-neutral-500">Beats</span>
                                </div>
                                <span className="text-lg font-bold text-neutral-600">on</span>
            
                                <div 
                                    className="flex-1 bg-white/[0.03] hover:bg-white/[0.06] rounded-lg p-2 flex items-center justify-center border border-white/10 focus-within:border-stone-300 transition-colors cursor-pointer outline-none relative group"
                                    tabIndex={0}
                                    onKeyDown={(e) => {
                                        e.preventDefault();
                                        updateTrack(track.id, 'key', e.key.toLowerCase());
                                    }}
                                >
                                    <span className="text-lg font-bold text-stone-300 uppercase tracking-widest">{displayKey}</span>
                                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-neutral-900 border border-neutral-700 text-neutral-400 text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                                    Click & Press Key
                                    </div>
                                </div>

                                {tracks.length > 1 && (
                                    <button onClick={() => removeTrack(track.id)} className="text-stone-400 hover:text-stone-300 p-2 font-bold w-6 shrink-0">✕</button>
                                )}
                            </div>
                        )})}
                </div>
            </div>

            <div className="absolute bottom-1 left-1 right-1 flex justify-between items-center">
                {tracks.length < 5 ? (
                    <button 
                        onClick={addTrack}
                        className="px-5 py-2.5 rounded-full border border-white/15 hover:bg-white/[0.05] transition-colors font-medium text-sm"
                    >
                        + Rhythm
                    </button>
                ) : (
                    <div className="px-5 py-2.5 text-neutral-500 text-sm">Max. 5 rhythms</div>
                )}
                
                <div className="flex gap-2">
                    <button 
                        onClick={startGame}
                        className="px-7 py-2.5 flex items-center gap-2 rounded-full bg-stone-200 hover:bg-stone-300 text-neutral-900 text-xs font-bold uppercase tracking-[0.14em] transition-all transform hover:scale-105"
                    >
                        START
                    </button>
                </div>
            </div>
        </div>
    );
}