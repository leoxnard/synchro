import React from 'react';
import { SlArrowLeft, SlArrowRight } from 'react-icons/sl';
import { NumberStepper } from '../components/NumberStepper';

export default function MobileSetupPhase({
    tracks,
    addTrack,
    updateTrack,
    removeTrack,
    startGame,
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