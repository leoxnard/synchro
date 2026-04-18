import React, { useState } from 'react';
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
    setCountInBars,
    isLayoutEditorOpen,
    onToggleLayoutEditor,
    onCloseLayoutEditor,
    onResetLayout,
    buttonLayout,
    onMoveLayoutButton,
    orientation
}) {
    const clampPulseValue = (rawValue) => Math.min(16, Math.max(1, rawValue));
    
    // Synchronisiere mit PlayingPhase.jsx für identische Pad-Größen
    const trackCount = tracks.length;
    const extraTracks = Math.max(0, trackCount - 3);
    const baseCircleSizePx = Math.max(92, 112 - (extraTracks * 10));
    const mobileScale = orientation === 'portrait' ? 0.84 : 0.78;
    const circleSizePx = Math.round(baseCircleSizePx * mobileScale);

    const adjustPulses = (trackId, direction) => {
        const track = tracks.find(t => t.id === trackId);
        if (!track) return;
        updateTrack(trackId, 'pulses', clampPulseValue(track.pulses + direction));
    };

    // NEU: Lokaler State für flüssiges Ziehen (verhindert das ständige Neu-Rendern der ganzen App)
    const [dragState, setDragState] = useState(null); // Speichert { id, x, y }

    const handlePointerMove = (e) => {
        if (!dragState) return;
        
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        const rect = e.currentTarget.getBoundingClientRect();
        let x = ((clientX - rect.left) / rect.width) * 100;
        let y = ((clientY - rect.top) / rect.height) * 100;

        const halfPadXPct = (circleSizePx / 2 / Math.max(1, rect.width)) * 100;
        const halfPadYPct = (circleSizePx / 2 / Math.max(1, rect.height)) * 100;
        const minX = halfPadXPct;
        const maxX = 100 - halfPadXPct;
        const minY = halfPadYPct;
        const maxY = 100 - halfPadYPct;

        x = Math.max(minX, Math.min(maxX, x));
        y = Math.max(minY, Math.min(maxY, y));

        setDragState(prev => ({ ...prev, x, y }));
    };

    const handlePointerUp = () => {
        if (dragState) {
            // Erst beim Loslassen die finale Position an die Haupt-App senden
            onMoveLayoutButton(dragState.id, dragState.x, dragState.y);
            setDragState(null);
        }
    };

    if (isLayoutEditorOpen) {
        return (
            <div className="relative w-full h-full min-h-0 text-center flex flex-col items-stretch gap-3">
                <div
                    className="relative w-full flex-1 min-h-0 self-stretch rounded-2xl bg-neutral-900/40 overflow-hidden"
                    style={{ touchAction: 'none' }}
                    onMouseMove={handlePointerMove}
                    onTouchMove={handlePointerMove}
                    onMouseUp={handlePointerUp}
                    onTouchEnd={handlePointerUp}
                    onMouseLeave={handlePointerUp}
                    onTouchCancel={handlePointerUp}
                >
                    {tracks.map((track) => {
                        const basePos = buttonLayout[track.id] || { x: 50, y: 50 };
                        const isDragging = dragState?.id === track.id;

                        // Wenn dieser Button gezogen wird, nutze den flüssigen lokalen State, sonst den globalen
                        const pos = isDragging ? { x: dragState.x, y: dragState.y } : basePos;

                        return (
                            <button
                                key={track.id}
                                type="button"
                                onMouseDown={() => setDragState({ id: track.id, x: pos.x, y: pos.y })}
                                onTouchStart={() => setDragState({ id: track.id, x: pos.x, y: pos.y })}
                                className={`absolute rounded-full border-4 flex items-center justify-center font-bold transition-shadow cursor-move ${
                                    isDragging
                                        ? 'bg-cyan-500/30 border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.5)] z-10'
                                        : 'bg-white/[0.03] border-white/10 hover:border-white/20 z-0'
                                }`}
                                style={{
                                    width: `${circleSizePx}px`,
                                    height: `${circleSizePx}px`,
                                    fontSize: `${Math.max(20, Math.round(circleSizePx * 0.27))}px`,
                                    left: `${pos.x}%`,
                                    top: `${pos.y}%`,
                                    transform: 'translate(-50%, -50%)',
                                    userSelect: 'none',
                                    touchAction: 'none',
                                    WebkitTapHighlightColor: 'transparent',
                                    transitionProperty: isDragging ? 'box-shadow, background-color' : 'all',
                                    transitionDuration: '150ms'
                                }}
                            >
                                {track.pulses}
                            </button>
                        );
                    })}
                </div>

                <div className="pointer-events-none absolute inset-0 z-20">
                    <div className="absolute top-2 left-2 right-2 flex items-start justify-between gap-2">
                        <button
                            type="button"
                            onClick={onResetLayout}
                            className="pointer-events-auto px-3 py-1.5 rounded-full border border-white/10 bg-neutral-900/70 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-300 hover:bg-neutral-900/85 transition-colors"
                        >
                            Reset
                        </button>
                        <button
                            type="button"
                            onClick={onCloseLayoutEditor}
                            className="pointer-events-auto px-3 py-1.5 rounded-full bg-stone-200 text-neutral-900 text-[11px] font-bold uppercase tracking-[0.12em] hover:bg-stone-300 transition-colors"
                        >
                            Fertig
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Der Rest der Komponente bleibt unangetastet...
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
                <div className="w-full flex justify-between items-center gap-2">
                    {onToggleLayoutEditor && (
                        <button
                            type="button"
                            onClick={onToggleLayoutEditor}
                            className={`px-4 py-2 rounded-full text-xs font-semibold transition-all ${isLayoutEditorOpen
                                ? 'bg-cyan-500/20 border border-cyan-400/50 text-cyan-300'
                                : 'bg-white/[0.05] border border-white/10 text-neutral-400 hover:bg-white/[0.08]'}`}
                        >
                            {isLayoutEditorOpen ? '✓ Layout' : 'Layout'}
                        </button>
                    )}

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