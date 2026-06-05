import React, { useState, useEffect } from 'react';

function RestartButton({ onRestartRound }) {
    return (
        <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
                e.stopPropagation();
                if (onRestartRound) onRestartRound();
            }}
            className="absolute right-4 top-4 z-20 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-300 hover:text-stone-100"
        >
            Restart
        </button>
    );
}

export function PlayDesktop({ subLabel, labels, progressPct, beatName, bpm, phase, canRestart, onRestartRound }) {
    const [isPressed, setIsPressed] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.code === 'Space' && !e.repeat) {
                setIsPressed(true);
            }
        };
        
        const handleKeyUp = (e) => {
            if (e.code === 'Space') {
                setIsPressed(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    return (
        <div className="relative flex h-full min-h-0 flex-col gap-4">
            {canRestart && <RestartButton onRestartRound={onRestartRound} />}
            <div className="rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-[11px] uppercase tracking-[0.24em] text-neutral-500">{subLabel}</div>
                        <div className="mt-1 text-3xl font-black text-stone-100 grid">
                            {Object.entries(labels).map(([key, text]) => (
                                <div 
                                    key={key} 
                                    className={`col-start-1 row-start-1 ${phase === key ? 'visible opacity-100' : 'invisible opacity-0'}`}
                                >
                                    {text}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="text-right text-xs uppercase tracking-[0.22em] text-neutral-500">
                        <div>{beatName}</div>
                        <div className="mt-1">{bpm} BPM</div>
                    </div>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                    <div 
                        className={`h-full rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300 ${
                            phase === 'listening' ? 'transition-all duration-300 ease-out' : ''
                        }`} 
                        style={{ width: `${progressPct}%` }} 
                    />
                </div>
            </div>

            <div className="flex flex-1 items-center justify-center rounded-[1.8rem] border border-white/10 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.05),transparent_40%),linear-gradient(to_bottom,rgba(255,255,255,0.04),rgba(255,255,255,0.02))]">
                <div 
                    className={`relative flex h-64 w-64 m-2 items-center justify-center rounded-full border md:h-72 md:w-72 transition-all duration-150 ease-out ${
                        isPressed 
                            ? 'scale-[0.97] border-white/20 bg-white/[0.05]' 
                            : 'scale-100 border-white/10 bg-black/25'
                    }`}
                >
                    <div className={`absolute inset-6 rounded-full border transition-colors duration-150 ${isPressed ? 'border-white/20' : 'border-white/10'}`} />
                    <div className="absolute inset-12 rounded-full border border-white/5" />
                    
                    <div className={`text-center transition-transform duration-150 ${isPressed ? 'scale-[0.98]' : 'scale-100'}`}>
                    </div>
                </div>
            </div>
        </div>
    );
}

function PlayMobile({ subLabel, labels, progressPct, onTap, phase, syncError, canRestart, onRestartRound }) {
    const handleTap = (e) => {
        if (syncError) return;
        if (onTap) onTap(e);
    };

    return (
        <div
            role="button" tabIndex={0} onPointerDown={handleTap}
            className="relative flex flex-1 h-full flex-col rounded-[1.8rem] p-4 outline-none touch-none select-none"
            style={{ touchAction: 'none' }}
        >
            {canRestart && <RestartButton onRestartRound={onRestartRound} />}
            <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.22em] text-neutral-500">
                <span>{subLabel}</span>
                <div className="grid justify-items-end">
                    {Object.entries(labels).map(([key, text]) => (
                        <span 
                            key={key} 
                            className={`col-start-1 row-start-1 ${phase === key ? 'visible opacity-100' : 'invisible opacity-0'}`}
                        >
                            {text}
                        </span>
                    ))}
                </div>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                <div 
                    className={`h-full rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300 ${
                        phase === 'listening' ? 'transition-all duration-300 ease-out' : ''
                    }`} 
                    style={{ width: `${progressPct}%` }} 
                />
            </div>

            {syncError && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/50 p-4">
                    <div className="rounded-md bg-rose-700/90 p-3 text-center text-sm font-semibold text-white">
                        Sync failed — not all players joined in time. Check the host screen.
                    </div>
                </div>
            )}
        </div>
    );
}

export default function PlayView(props) {
    return props.isMobile ? <PlayMobile {...props} /> : <PlayDesktop {...props} />;
}