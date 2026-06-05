import { useEffect, useRef } from 'react';

type MetronomePendulumProps = {
    measureDuration: number;
    countInDuration: number;
    basePulses: number;
    startTime: number;
    label: string;
};

type RhythmTrack = {
    pulses: number;
};

type MobilePracticeNodeProps = {
    track: RhythmTrack;
    measureDuration: number;
    startTime: number;
    isPressed?: boolean;
};

export function MetronomePendulum({ measureDuration, countInDuration, basePulses, startTime, label }: MetronomePendulumProps) {
    const pointerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        let animationFrameId: number;

        const renderLoop = () => {
            if (!pointerRef.current) return;

            const now = performance.now();
            const countInStartTime = startTime - countInDuration;

            let totalElapsed = now - countInStartTime;

            if (totalElapsed < 0) totalElapsed = 0;

            const beatDuration = measureDuration / Math.max(1, basePulses);
            const measureIndex = Math.floor(totalElapsed / measureDuration);
            const elapsedInMeasure = totalElapsed % measureDuration;
            const beatIndex = Math.floor(elapsedInMeasure / beatDuration);
            const beatProgress = (elapsedInMeasure % beatDuration) / beatDuration;
            const reverseThisMeasure = (basePulses % 2 === 1) && (measureIndex % 2 === 1);
            const movingForward = (beatIndex % 2 === 0) !== reverseThisMeasure;
            const positionPercent = movingForward
                ? beatProgress * 100
                : (1 - beatProgress) * 100;

            pointerRef.current.style.left = `${positionPercent}%`;

            animationFrameId = requestAnimationFrame(renderLoop);
        };

        animationFrameId = requestAnimationFrame(renderLoop);

        return () => cancelAnimationFrame(animationFrameId);
    }, [measureDuration, countInDuration, basePulses, startTime]);

    return (
        <div className="w-full max-w-xl mx-auto mt-3 bg-white/[0.03] h-7 rounded-full border border-white/10 relative flex items-center px-4">
            <div className="absolute left-4 z-10 font-bold text-[10px] text-neutral-400 tracking-widest pointer-events-none">{label} ({basePulses})</div>
            <div className="flex-1 h-full relative font-sans select-none">
                <div
                    ref={pointerRef}
                    className="absolute top-0.5 bottom-0.5 w-7 bg-stone-300 rounded-full shadow-[0_0_15px_rgba(214,211,209,0.45)] transform -translate-x-1/2 will-change-transform"
                />
            </div>
        </div>
    );
}

export function MobilePracticeNode({ track, measureDuration, startTime, isPressed }: MobilePracticeNodeProps) {
    const ballRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        let animationFrameId: number;
        const pulseDuration = measureDuration / Math.max(1, track.pulses);

        const renderLoop = () => {
            if (!ballRef.current) return;
            const now = performance.now();
            let totalElapsed = now - startTime;
            if (totalElapsed < 0) totalElapsed = 0;

            const progress = (totalElapsed % pulseDuration) / pulseDuration;
            const heightObj = 4 * progress * (1 - progress);

            ballRef.current.style.transform = `translateY(-${heightObj * 120}px)`;

            animationFrameId = requestAnimationFrame(renderLoop);
        };

        animationFrameId = requestAnimationFrame(renderLoop);
        return () => cancelAnimationFrame(animationFrameId);
    }, [measureDuration, startTime, track.pulses]);

    return (
        <div className="flex flex-col items-center gap-3 pointer-events-none">
            <div className={`relative w-14 h-44 rounded-full border-[3px] transition-all duration-75 flex flex-col justify-end p-1 ${isPressed ? 'border-cyan-300 bg-cyan-400/10 shadow-[0_0_20px_rgba(34,211,238,0.2)]' : 'border-white/20 bg-black/40'}`}>
                <div
                    ref={ballRef}
                    className={`relative z-10 w-full aspect-square rounded-full flex items-center justify-center text-xl font-black transition-colors duration-75 will-change-transform ${isPressed ? 'bg-cyan-300 text-neutral-900 shadow-[0_0_15px_rgba(34,211,238,0.8)]' : 'bg-stone-300 text-neutral-800 shadow-[0_4px_10px_rgba(0,0,0,0.5)]'}`}
                >
                    {track.pulses}
                </div>
            </div>
        </div>
    );
}