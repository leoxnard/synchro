import React, { useState, useEffect } from 'react';

import { useIsMobile } from "../hooks/useIsMobile";
import { BEATS } from "./constants/gameConfig";
import NumberStepper from "../components/NumberStepper";
import { MdVolumeUp } from 'react-icons/md';

function BeatCard({ beat, selected, onSelect, isPreviewing, onPreviewStart }) {
    return (
        <div className={`relative flex items-center rounded-2xl border transition-colors ${selected ? 'border-cyan-300/30 bg-cyan-400/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.05]'}`}>
            <button
                type="button"
                onClick={() => onSelect(beat.id)}
                className="flex-1 px-4 py-3 text-left outline-none rounded-l-2xl"
            >
                <div className="text-sm font-semibold text-stone-100">{beat.name}</div>
                <div className="mt-1 text-[11px] uppercase tracking-[0.22em] text-neutral-500">{beat.bpm} BPM</div>
            </button>
            <button
                type="button"
                onPointerDown={(e) => { e.preventDefault(); onPreviewStart(beat.id); onSelect(beat.id); }}
                onContextMenu={(e) => e.preventDefault()}
                className={`mr-2 p-3 rounded-full transition-colors outline-none ${isPreviewing ? 'bg-cyan-500/20 text-cyan-300' : 'text-neutral-500 hover:text-stone-200 hover:bg-white/10'}`}
                title="Hold to preview"
            >
                <MdVolumeUp size={22} />
            </button>
        </div>
    );
}

function SetupDesktop({ triggerTaps, setTriggerTaps, silentBars, setSilentBars, selectedBeatId, setSelectedBeatId, onStart, previewingBeatId, onPreviewStart }) {
    return (
        <div className="flex h-full flex-col gap-4 overflow-y-auto pr-1">
            <div className="grid gap-3 md:grid-cols-2">
                <NumberStepper label="Taps to Trigger" value={triggerTaps} onChange={setTriggerTaps} min={4} max={32} compact />
                <NumberStepper label="Silent bars" value={silentBars} onChange={setSilentBars} min={1} max={16} compact />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
                {BEATS.map((beat) => (
                    <BeatCard 
                        key={beat.id} 
                        beat={beat} 
                        selected={beat.id === selectedBeatId} 
                        onSelect={setSelectedBeatId}
                        isPreviewing={previewingBeatId === beat.id}
                        onPreviewStart={onPreviewStart}
                    />
                ))}
            </div>
            <div className="mt-auto flex flex-col items-center">
                <button type="button" onClick={onStart} className="rounded-full bg-stone-200 px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-neutral-950 transition-transform active:scale-95">Start</button>
            </div>
        </div>
    );
}

function SetupMobile({ triggerTaps, setTriggerTaps, silentBars, setSilentBars, selectedBeatId, setSelectedBeatId, onStart, previewingBeatId, onPreviewStart }) {
    return (
        <div className="flex h-full flex-col gap-4 overflow-y-auto pr-1">
            <div className="grid gap-2">
                <NumberStepper label="Taps to Trigger" value={triggerTaps} onChange={setTriggerTaps} min={4} max={32} compact />
                <NumberStepper label="Silent bars" value={silentBars} onChange={setSilentBars} min={1} max={16} compact />
            </div>
            <div className="grid grid-cols-2 gap-2">
                {BEATS.map((beat) => (
                    <BeatCard 
                        key={beat.id} 
                        beat={beat} 
                        selected={beat.id === selectedBeatId} 
                        onSelect={setSelectedBeatId}
                        isPreviewing={previewingBeatId === beat.id}
                        onPreviewStart={onPreviewStart}
                    />
                ))}
            </div>
            <div className="mt-auto flex flex-col items-center">
                <button type="button" onClick={onStart} className="w-full rounded-full bg-stone-200 px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-neutral-950 active:scale-95">Start</button>
                <div className="mt-2 text-[10px] uppercase tracking-[0.2em] text-neutral-500">Hold speaker icon to preview</div>
            </div>
        </div>
    );
}

export default function SetupPhase(props) {
    const isMobile = useIsMobile();
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    if (!isClient) return <div className="loading-placeholder" />;

    return isMobile ? <SetupMobile {...props} /> : <SetupDesktop {...props} />;
}
