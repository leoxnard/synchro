import React, { useEffect, useState, useRef } from 'react';

const LISTENING_DURATION_MS = 6000;

export default function ListeningPhase({ targetTempo, audioCtx, onListeningComplete }) {
    const [progress, setProgress] = useState(100);
    const [pulseSeed, setPulseSeed] = useState(0);
    const schedulerRef = useRef(null);
    const nextBeatTimeRef = useRef(0);
    const startTimeRef = useRef(0);
    const animationFrameRef = useRef(null);
    const pulseTimeoutRefs = useRef([]);

    const playClick = (time, ctx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 800;
        gain.gain.setValueAtTime(0.3, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.12);
        osc.start(time);
        osc.stop(time + 0.12);
    };

    const schedulePulse = (beatTime, ctx) => {
        const delayMs = Math.max(0, (beatTime - ctx.currentTime) * 1000);
        const timeoutId = setTimeout(() => {
            setPulseSeed(seed => seed + 1);
        }, delayMs);

        pulseTimeoutRefs.current.push(timeoutId);
    };

    useEffect(() => {
        if (!audioCtx) return;

        const audioStartTime = audioCtx.currentTime;
        const endTime = audioStartTime + LISTENING_DURATION_MS / 1000;
        nextBeatTimeRef.current = audioStartTime;
        startTimeRef.current = Date.now();

        const scheduleBeats = () => {
            const beatDurationSec = 60 / targetTempo;
            const now = audioCtx.currentTime;

            // Schedule all beats that should play before the next scheduling
            while (nextBeatTimeRef.current < endTime && nextBeatTimeRef.current < now + 0.1) {
                playClick(nextBeatTimeRef.current, audioCtx);
                schedulePulse(nextBeatTimeRef.current, audioCtx);
                nextBeatTimeRef.current += beatDurationSec;
            }

            if (now < endTime) {
                schedulerRef.current = setTimeout(scheduleBeats, 50);
            }
        };

        scheduleBeats();

        // Smooth progress update using requestAnimationFrame
        const updateProgress = () => {
            const elapsed = Date.now() - startTimeRef.current;
            const remaining = Math.max(0, LISTENING_DURATION_MS - elapsed);
            setProgress((remaining / LISTENING_DURATION_MS) * 100);

            if (elapsed < LISTENING_DURATION_MS) {
                animationFrameRef.current = requestAnimationFrame(updateProgress);
            } else {
                setTimeout(onListeningComplete, 300);
            }
        };

        animationFrameRef.current = requestAnimationFrame(updateProgress);

        return () => {
            if (schedulerRef.current) clearTimeout(schedulerRef.current);
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            pulseTimeoutRefs.current.forEach(timeoutId => clearTimeout(timeoutId));
            pulseTimeoutRefs.current = [];
        };
    }, [targetTempo, audioCtx, onListeningComplete]);

    return (
        <div className="w-full flex items-center justify-center">
            <div className="text-center">
                <div className="relative mx-auto mb-12 h-20 w-20">
                    <div
                        key={pulseSeed}
                        className="absolute inset-0 rounded-full bg-emerald-400 opacity-70 animate-ping"
                    />
                    <div className="absolute inset-3 rounded-full border-2 border-primary bg-primary/20 shadow-[0_0_24px_rgba(16,185,129,0.25)]" />
                </div>
                <p className="text-xl text-neutral-400 mb-8">Listen to the tempo...</p>
                
                <div className="w-64 h-1 bg-neutral-700 rounded-full overflow-hidden">
                    <div 
                        className="h-full bg-primary transition-none"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </div>
        </div>
    );
}
