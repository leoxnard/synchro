import React, { useState, useEffect } from 'react';
import { useIsMobile } from "../hooks/useIsMobile";

function PlayDesktop({ subLabel, label, progressPct, beatName, bpm }) {
    return (
        <div className="flex h-full min-h-0 flex-col gap-4">
            <div className="rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-[11px] uppercase tracking-[0.24em] text-neutral-500">{subLabel}</div>
                        <div className="mt-1 text-3xl font-black text-stone-100">{label}</div>
                    </div>
                    <div className="text-right text-xs uppercase tracking-[0.22em] text-neutral-500">
                        <div>{beatName}</div>
                        <div className="mt-1">{bpm} BPM</div>
                    </div>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300 transition-all duration-75" style={{ width: `${progressPct}%` }} />
                </div>
            </div>

            <div className="flex flex-1 items-center justify-center rounded-[1.8rem] border border-white/10 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.14),transparent_35%),linear-gradient(to_bottom,rgba(255,255,255,0.04),rgba(255,255,255,0.02))]">
                <div className="relative flex h-64 w-64 items-center justify-center rounded-full border border-white/10 bg-black/25 md:h-72 md:w-72">
                    <div className="absolute inset-6 rounded-full border border-white/10" />
                    <div className="absolute inset-12 rounded-full border border-cyan-200/10" />
                    <div className="text-center">
                        <div className="text-[11px] uppercase tracking-[0.34em] text-neutral-500">Press</div>
                        <div className="mt-2 text-4xl font-black text-stone-100">SPACEBAR</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function PlayMobile({ subLabel, label, progressPct, onTap, beatName, bpm }) {
    return (
        <div
            role="button" tabIndex={0} onPointerDown={onTap}
            className="relative flex h-full min-h-0 flex-col rounded-[1.8rem] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.12),transparent_30%),radial-gradient(circle_at_bottom,rgba(16,185,129,0.10),transparent_34%),linear-gradient(to_bottom,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-4 outline-none touch-none select-none"
            style={{ touchAction: 'none' }}
        >
            <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.22em] text-neutral-500">
                <span>{subLabel}</span>
                <span>{label}</span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300 transition-all duration-75" style={{ width: `${progressPct}%` }} />
            </div>

            <div className="flex flex-1 items-center justify-center">
                <div className="relative flex h-52 w-52 items-center justify-center rounded-full border border-white/10 bg-black/25">
                    <div className="absolute inset-5 rounded-full border border-white/10" />
                    <div className="absolute inset-10 rounded-full border border-cyan-200/10" />
                    <div className="text-center">
                        <div className="text-[11px] uppercase tracking-[0.34em] text-neutral-500">{beatName}</div>
                        <div className="mt-2 text-5xl font-black text-stone-100">{bpm}</div>
                        <div className="mt-2 text-[11px] uppercase tracking-[0.24em] text-neutral-500">BPM</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function PlayPhase(props) {
    const isMobile = useIsMobile();
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    if (!isClient) return <div className="loading-placeholder" />;

    return isMobile ? <PlayMobile {...props} /> : <PlayDesktop {...props} />;
}
