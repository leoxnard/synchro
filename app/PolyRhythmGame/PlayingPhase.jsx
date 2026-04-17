import React, { useEffect, useRef } from 'react';

function MetronomePendulum({ measureDuration, countInDuration, basePulses, startTime, label }) {
    const pointerRef = useRef(null);

    useEffect(() => {
        let animationFrameId;

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

export default function PlayingPhase({
    gameState,
    count,
    tracks,
    activeKeys,
    startTime,
    measureDuration,
    countInDuration,
    measures
}) {
    const trackCount = tracks.length;
    const extraTracks = Math.max(0, trackCount - 3);
    const circleSizePx = Math.max(92, 112 - (extraTracks * 10));
    const gapPx = Math.max(24, 40 - (extraTracks * 8));
    const pulseFontSizePx = Math.max(24, Math.round(circleSizePx * 0.27));
    const labelFontSizePx = Math.max(14, 18 - (extraTracks * 1.5));
    const labelPadXPx = Math.max(10, 16 - (extraTracks * 2));

    if (gameState === 'countIn') {
        return (
            <div className="w-full flex-1 flex flex-col items-center justify-center relative">
                <div className="animate-pulse flex flex-col items-center">
                    <p className="text-xl font-light text-stone-300 mb-6">Get ready...</p>
                    <div className="text-8xl font-black text-white mb-7">{count > 0 ? count : 'GO!'}</div>
                </div>
        
                <div className="w-full px-8 opacity-70 flex flex-col gap-2">
                    {tracks.map(track => (
                        <MetronomePendulum
                            key={track.id}
                            label={track.key === ' ' ? 'SPACE' : track.key}
                            measureDuration={measureDuration} 
                            countInDuration={countInDuration}
                            basePulses={track.pulses} 
                            startTime={startTime} 
                        />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="w-full text-center space-y-10 flex flex-col items-center">
            <div className="w-full flex justify-center" style={{ gap: `${gapPx}px` }}>
                {tracks.map(track => {
                    const assignedKey = track.key || '';
                    const displayKey = assignedKey === ' ' ? 'SPACE' : assignedKey.toUpperCase();
                    const isPressed = activeKeys[assignedKey];

                    return (
                        <div key={track.id} className="flex flex-col items-center gap-4">
                            <div 
                                className={`rounded-full border-4 flex items-center justify-center font-bold transition-all duration-75 
                ${isPressed 
                            ? 'bg-stone-300 border-stone-200 text-neutral-900 scale-105 shadow-[0_0_26px_rgba(214,211,209,0.45)]' 
                            : 'bg-white/[0.03] border-white/10 text-neutral-500'}`}
                                style={{
                                    width: `${circleSizePx}px`,
                                    height: `${circleSizePx}px`,
                                    fontSize: `${pulseFontSizePx}px`
                                }}
                            >
                                {track.pulses}
                            </div>
                            <div
                                className="font-bold bg-white/[0.03] rounded-lg text-neutral-400 border border-white/10"
                                style={{
                                    fontSize: `${labelFontSizePx}px`,
                                    padding: `0.375rem ${labelPadXPx}px`
                                }}
                            >
                                {displayKey}
                            </div>
                        </div>
                    )})}
            </div>
        </div>
    );
}