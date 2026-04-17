import React, { useEffect, useRef, useState } from 'react';

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
    const [showCalibrationMenu, setShowCalibrationMenu] = useState(false);
    const calibrationMenuRef = useRef(null);

    useEffect(() => {
        const handlePointerDown = (event) => {
            if (!calibrationMenuRef.current) return;
            if (!calibrationMenuRef.current.contains(event.target)) {
                setShowCalibrationMenu(false);
            }
        };

        window.addEventListener('pointerdown', handlePointerDown);
        return () => window.removeEventListener('pointerdown', handlePointerDown);
    }, []);

    return (
        <div className="w-full max-w-md bg-neutral-800 p-8 rounded-2xl shadow-2xl border border-neutral-700 relative">
            <div className="absolute -top-3 right-4" ref={calibrationMenuRef}>
                <button
                    type="button"
                    onClick={() => setShowCalibrationMenu((prev) => !prev)}
                    aria-label="Calibration options"
                    title="Calibration options"
                    className="h-9 w-9 rounded-full border border-neutral-600 bg-neutral-900/90 text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors flex items-center justify-center"
                >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                        <path
                            fill="currentColor"
                            d="M3 18h6v-2H3v2zm0-5h12v-2H3v2zm0-7v2h18V6H3zm15 7v2h3v-2h-3zm-4 0v2h3v-2h-3zm0 5v2h3v-2h-3zm4 0v2h3v-2h-3z"
                        />
                    </svg>
                </button>

                {showCalibrationMenu && (
                    <div className="absolute right-0 mt-2 w-44 rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl overflow-hidden">
                        <button
                            type="button"
                            onClick={() => {
                                setShowCalibrationMenu(false);
                                onForceCalibrate();
                            }}
                            className="w-full text-left px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
                        >
                            Run Calibration
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setShowCalibrationMenu(false);
                                onResetCalibration();
                            }}
                            className="w-full text-left px-3 py-2 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors border-t border-neutral-800"
                        >
                            Reset to Default
                        </button>
                    </div>
                )}
            </div>

            <div className="mb-6 pb-4 border-b border-neutral-700">
                <h2 className="text-xl mb-3 font-semibold text-center">Configuration</h2>
                <div className="flex gap-4 justify-center text-xs text-neutral-400">
                    <div className="flex flex-col items-center">
                        <span className="text-neutral-500 mb-1">Audio Offset</span>
                        <span className={`font-bold ${latencyCompMs !== 0 ? (hasManualCalibration ? 'text-blue-400' : 'text-amber-400') : 'text-neutral-400'}`}>
                            {latencyCompMs > 0 ? '+' : ''}{latencyCompMs}ms
                        </span>
                    </div>
                    <div className="flex flex-col items-center">
                        <span className="text-neutral-500 mb-1">Calibration</span>
                        <span className={`font-bold ${hasManualCalibration ? 'text-blue-400' : 'text-neutral-400'}`}>
                            {hasManualCalibration ? 'Manual' : 'Auto'}
                        </span>
                    </div>
                </div>
            </div>
      
            <div className="flex gap-4 mb-6 pb-6 border-b border-neutral-700/50">
                <NumberStepper label="Tempo (BPM)" value={bpm} onChange={setBpm} min={30} max={240} step={5} className="flex-1" />
                <NumberStepper label="Bars" value={measures} onChange={setMeasures} min={1} max={16} className="flex-1" />
                <NumberStepper label="Beats per Bar" value={beatsPerMeasure} onChange={setBeatsPerMeasure} min={1} max={16} className="flex-1" />
            </div>
      
            <div className="space-y-4 mb-6">
                {tracks.map(track => {
                    const assignedKey = track.key || '';
                    const displayKey = assignedKey === ' ' ? 'ENTER' : assignedKey.toUpperCase();
          
                    return (
                        <div key={track.id} className="flex items-center gap-4">
                            <div className="flex-1  p-1.5 flex items-center justify-between transition-colors">
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
                            <span className="text-xl font-bold text-neutral-600">on</span>
            
                            <div 
                                className="flex-1 bg-neutral-900/80 hover:bg-neutral-800 rounded-lg p-2 flex items-center justify-center border border-neutral-700 focus-within:border-stone-400 transition-colors cursor-pointer outline-none relative group"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    e.preventDefault();
                                    updateTrack(track.id, 'key', e.key.toLowerCase());
                                }}
                            >
                                <span className="text-xl font-bold text-stone-400/80 uppercase tracking-widest">{displayKey}</span>
                                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-neutral-900 border border-neutral-700 text-neutral-400 text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                                    Click & Press Key
                                </div>
                            </div>

                            {tracks.length > 1 && (
                                <button onClick={() => removeTrack(track.id)} className="text-red-400 hover:text-red-300 p-2 font-bold w-6 shrink-0">✕</button>
                            )}
                        </div>
                    )})}
            </div>

            <div className="flex justify-between mt-8">
                {tracks.length < 5 ? (
                    <button 
                        onClick={addTrack}
                        className="px-6 py-3 rounded-lg border border-neutral-600 hover:bg-neutral-700 transition-colors font-medium"
                    >
                        + Rhythm
                    </button>
                ) : (
                    <div className="px-6 py-3 text-neutral-500 text-sm">Max. 5 rhythms</div>
                )}
                
                <div className="flex gap-2">
                    <button 
                        onClick={startGame}
                        className="px-8 py-3 flex items-center gap-2 rounded-lg bg-stone-500 hover:bg-stone-400 text-neutral-900 font-bold transition-all transform hover:scale-105"
                    >
                        START 
                        <span className="text-xs bg-neutral-900/20 px-2 py-1 rounded text-neutral-800 tracking-widest ml-1">
                            ENTER
                        </span>
                    </button>
                </div>
            </div>
        </div>
    );
}