import { BEATS } from "./constants/gameConfig";
import NumberStepper from "../components/NumberStepper";
import { MdVolumeUp } from 'react-icons/md';

function ActionButtons({ actionButtons = [], onStart, startLabel = 'Start', compact = false }) {
    const resolvedButtons = actionButtons.length > 0
        ? actionButtons
        : [{ id: 'default-start', label: startLabel, onClick: onStart, style: 'primary' }];

    return (
        <div className={`grid w-full gap-2 ${compact ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-3'}`}>
            {resolvedButtons.map((button) => {
                const isPrimary = button.style === 'primary';
                return (
                    <button
                        key={button.id}
                        type="button"
                        onClick={button.onClick}
                        className={`rounded-full px-4 py-3 text-xs font-bold uppercase tracking-[0.2em] transition-transform active:scale-95 ${
                            isPrimary
                                ? 'bg-stone-200 text-neutral-950'
                                : 'border border-white/10 bg-white/[0.03] text-stone-100 hover:bg-white/[0.06]'
                        }`}
                    >
                        {button.label}
                    </button>
                );
            })}
        </div>
    );
}

function BeatCard({ beat, selected, onSelect, isPreviewing, onPreviewStart }) {
    return (
        <div className={`relative flex items-center rounded-2xl border transition-colors ${selected ? 'border-cyan-300/30 bg-cyan-400/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.05]'}`}>
            <button
                type="button"
                onClick={() => onSelect(beat.id)}
                className="flex-1 px-3 py-2 md:px-4 md:py-3 text-left outline-none rounded-l-2xl"
            >
                <div className="text-xs md:text-sm font-semibold text-stone-100">{beat.name}</div>
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

function SetupDesktop({ silentBars, setSilentBars, selectedBeatId, setSelectedBeatId, onStart, startLabel = 'Start', actionButtons = [], previewingBeatId, onPreviewStart }) {
    return (
        <div className="flex h-full w-full flex-col overflow-y-auto pb-2">
            <div className="flex flex-1 flex-col justify-center w-full">
                <div className="text-center border-b border-white/10 pb-4 mb-4">
                    <span className="text-3xl font-light text-neutral-400 tracking-widest">Hold The Tempo</span>
                </div>
                
                <div className="grid gap-4 pb-6 md:grid-cols-1 border-b border-white/10">
                    <NumberStepper label="Silent bars" value={silentBars} onChange={setSilentBars} min={1} max={16} />
                </div>
                
                <div className="grid gap-4 md:grid-cols-2 py-4">
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
            </div>
            
            <div className="flex flex-col items-center mt-auto pt-4 w-full">
                <ActionButtons actionButtons={actionButtons} onStart={onStart} startLabel={startLabel} />
            </div>
            
        </div>
    );
}

function SetupMobile({ silentBars, setSilentBars, selectedBeatId, setSelectedBeatId, onStart, startLabel = 'Start', actionButtons = [], previewingBeatId, onPreviewStart }) {
    return (
        <div className="flex h-full w-full flex-col overflow-y-auto pb-2">
            
            <div className="flex flex-col gap-2 pb-2 w-full">
                <div className="grid gap-3 grid-cols-1 border-b border-white/10 pb-2">
                    {/* <NumberStepper label="Taps till silent" value={triggerTaps} onChange={setTriggerTaps} min={4} max={32} compact={true} /> */}
                    <NumberStepper label="Silent bars" value={silentBars} onChange={setSilentBars} min={1} max={16} compact={true} />
                </div>
                <div className="grid grid-cols-2 gap-3">
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
            </div>

            <div className="flex flex-col items-center mt-auto pt-4 w-full">
                <ActionButtons actionButtons={actionButtons} onStart={onStart} startLabel={startLabel} compact={true} />
            </div>
            
        </div>
    );
}

export default function SetupView(props) {
    return props.isMobile ? <SetupMobile {...props} /> : <SetupDesktop {...props} />;
}
