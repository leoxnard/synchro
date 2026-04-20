import React from 'react';
import NumberStepper from '../components/NumberStepper';
import { SlArrowLeft, SlArrowRight } from 'react-icons/sl';

function DesktopSetupView({
    tracks,
    addTrack,
    updateTrack,
    removeTrack,
    startGame,
    startPractice,
    onOpenLatencyTest,
    latencyCompMs,
    bpm,
    setBpm,
    measures,
    setMeasures,
    beatsPerMeasure,
    setBeatsPerMeasure,
    countInBars,
    setCountInBars,
}) {
    return (
        <div className="w-full h-full relative flex flex-col p-1">
            <div className="w-full relative flex flex-col flex-1 pb-10">
                <span className="text-3xl font-light tracking-widest text-neutral-400 mb-3 text-center border-b border-white/10 pb-4">Polyrhythm Trainer</span>
                { process.env.NEXT_PUBLIC_DEBUG_MODE === 'true' && (
                    <div className="mb-2 pb-3 border-b border-white/10">
                        <div className="flex items-center justify-between gap-3 text-xs text-neutral-400">
                            <div className="flex gap-4 justify-center">
                                <div className="flex flex-col items-center">
                                    <span className="text-neutral-500 mb-1">Last Audio Offset</span>
                                    <span className={`font-bold ${latencyCompMs !== 0 ? 'text-amber-300' : 'text-neutral-400'}`}>
                                        {latencyCompMs > 0 ? '+' : ''}{latencyCompMs.toFixed(0)}ms
                                    </span>
                                </div>
                                <div className="flex flex-col items-center">
                                    <span className="text-neutral-500 mb-1">Calibration</span>
                                    <span className="font-bold text-neutral-400">Auto</span>
                                </div>
                            </div>
                            <div className="shrink-0 flex gap-2">
                                <button
                                    type="button"
                                    onClick={onOpenLatencyTest}
                                    className="px-3 py-1.5 rounded-full border border-white/12 bg-white/[0.02] text-[11px] font-semibold tracking-wide text-neutral-400 hover:text-neutral-200 hover:border-white/20 hover:bg-white/[0.05] transition-colors"
                                >
                                    Open Test Window
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                <div className="grid grid-cols-2 gap-3 mb-2 pb-4 border-b border-white/10">
                    <NumberStepper label="Tempo (BPM)" value={bpm} onChange={setBpm} min={30} max={240} step={5} />
                    <NumberStepper label="Bars" value={measures} onChange={setMeasures} min={1} max={16} />
                    <NumberStepper label="Beats per Bar" value={beatsPerMeasure} onChange={setBeatsPerMeasure} min={1} max={16} />
                    <NumberStepper label="Count-In (Bars)" value={countInBars} onChange={setCountInBars} min={1} max={8} />
                </div>

                <div className="space-y-3 mb-5 flex-1 py-2">
                    {tracks.map(track => {
                        const assignedKey = track.key || '';
                        const displayKey = assignedKey === ' ' ? 'SPACE' : assignedKey.toUpperCase();

                        return (
                            <div key={track.id} className="flex items-center gap-4">
                                <NumberStepper
                                    value={track.pulses}
                                    onChange={(value) => updateTrack(track.id, 'pulses', value)}
                                    min={1}
                                    max={16}
                                    compact={true}
                                    className="shrink-0"
                                />
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
                        );
                    })}
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
                        onClick={startPractice}
                        className="px-5 py-2.5 rounded-full border border-white/15 bg-white/[0.02] hover:bg-white/[0.06] text-neutral-300 text-xs font-bold uppercase tracking-[0.14em] transition-all"
                    >
                        PRACTICE
                    </button>
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

function MobileSetupView({
    tracks,
    addTrack,
    updateTrack,
    removeTrack,
    startGame,
    startPractice,
    bpm,
    setBpm,
    measures,
    setMeasures,
    beatsPerMeasure,
    setBeatsPerMeasure,
    countInBars,
    setCountInBars
}) {
    const clampPulseValue = (rawValue) => Math.min(16, Math.max(1, rawValue));

    const adjustPulses = (trackId, direction) => {
        const track = tracks.find(t => t.id === trackId);
        if (!track) return;
        updateTrack(trackId, 'pulses', clampPulseValue(track.pulses + direction));
    };

    return (
        <div className="w-full h-full relative flex flex-col p-2 min-w-0 min-h-0">
            <div className="w-full relative flex flex-col flex-1 min-w-0 min-h-0 pb-4">
                <span className="text-xl font-light text-neutral-400 mb-2 text-center tracking-wide border-b border-white/10 pb-2">Polyrhythm</span>

                {/* Settings Grid */}
                <div className="grid grid-cols-2 gap-2 mb-4 pb-4 border-b border-white/10">
                    <NumberStepper label="Tempo" value={bpm} onChange={setBpm} min={30} max={240} step={5} compact={true} />
                    <NumberStepper label="Bars" value={measures} onChange={setMeasures} min={1} max={16} compact={true} />
                    <NumberStepper label="Beats/Bar" value={beatsPerMeasure} onChange={setBeatsPerMeasure} min={1} max={16} compact={true} />
                    <NumberStepper label="Count-In" value={countInBars} onChange={setCountInBars} min={1} max={8} compact={true} />
                </div>

                {/* Rhythms Grid - with +/- directly on each card */}
                <div className="grid grid-cols-2 gap-2 mb-4 flex-1 content-start">
                    {tracks.map((track, index) => (
                        <div key={track.id} className="rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.05] p-2 flex flex-col items-center text-center">
                            <div className="text-[9px] uppercase tracking-[0.1em] text-neutral-500 mb-1">
                                Rhythm {index + 1}
                            </div>

                            <div className="flex items-center gap-1.5 my-1">
                                <button
                                    type="button"
                                    onClick={() => adjustPulses(track.id, -1)}
                                    className="h-7 w-7 rounded-md border border-neutral-700 bg-neutral-800/70 text-neutral-300 hover:bg-neutral-700 active:scale-95 transition-all flex items-center justify-center"
                                    aria-label={`Decrease ${track.id} beats`}
                                >
                                    <SlArrowLeft size={13} />
                                </button>
                                <div className="w-8 text-center">
                                    <span className="text-lg font-black text-stone-200">
                                        {track.pulses}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => adjustPulses(track.id, 1)}
                                    className="h-7 w-7 rounded-md border border-neutral-700 bg-neutral-800/70 text-neutral-300 hover:bg-neutral-700 active:scale-95 transition-all flex items-center justify-center"
                                    aria-label={`Increase ${track.id} beats`}
                                >
                                    <SlArrowRight size={13} />
                                </button>
                            </div>

                            {tracks.length > 1 && (
                                <button
                                    type="button"
                                    onClick={() => removeTrack(track.id)}
                                    className="mt-1.5 py-1 text-sm text-neutral-400 hover:text-neutral-300 transition-colors font-medium"
                                >
                                    Remove
                                </button>
                            )}
                        </div>
                    ))}

                    {/* Add Rhythm Card */}
                    {tracks.length < 5 && (
                        <button
                            type="button"
                            onClick={addTrack}
                            className="rounded-lg border border-dashed border-neutral-600 bg-white/[0.02] hover:bg-white/[0.05] p-2 flex items-center justify-center text-neutral-400 hover:text-neutral-300 transition-colors text-sm font-light"
                        >
                            + Add
                        </button>
                    )}
                </div>

                {/* Bottom controls */}
                <div className="w-full flex justify-end items-center gap-2">
                    <button
                        onClick={startPractice}
                        className="px-5 py-2 rounded-full border border-white/15 bg-white/[0.02] hover:bg-white/[0.06] text-neutral-300 text-xs font-bold uppercase tracking-[0.12em] transition-all"
                    >
                        PRACTICE
                    </button>
                    <button
                        onClick={startGame}
                        className="px-6 py-2 rounded-full bg-stone-200 hover:bg-stone-300 text-neutral-900 text-xs font-bold uppercase tracking-[0.12em] transition-all transform hover:scale-105"
                    >
                        START
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function SetupView(props) {
    const isTouchPreferred = Boolean(props.isTouchPreferred);

    if (isTouchPreferred) {
        return <MobileSetupView {...props} />;
    }

    return <DesktopSetupView {...props} />;
}
