import React, { useEffect, useRef } from 'react';

function MetronomePendulum({ measureDuration, basePulses, startTime, label }) {
    const pointerRef = useRef(null);

    useEffect(() => {
        let animationFrameId;

        const renderLoop = () => {
            if (!pointerRef.current) return;
      
            const now = performance.now();
            const countInStartTime = startTime - measureDuration;
      
            let totalElapsed = now - countInStartTime;
      
            if (totalElapsed < 0) totalElapsed = 0;
      
            const elapsed = totalElapsed % measureDuration;
            const beatDuration = measureDuration / basePulses;
            const cycleDuration = beatDuration * 2;
            const safeElapsed = ((elapsed % cycleDuration) + cycleDuration) % cycleDuration;
      
            const beatPhase = safeElapsed / beatDuration;
            let positionPercent = 0;
      
            if (beatPhase < 1) {
                positionPercent = beatPhase * 100;
            } else {
                positionPercent = (2 - (beatPhase)) * 100;
            }

            pointerRef.current.style.left = `${positionPercent}%`;
      
            animationFrameId = requestAnimationFrame(renderLoop);
        };

        animationFrameId = requestAnimationFrame(renderLoop);

        return () => cancelAnimationFrame(animationFrameId);
    }, [measureDuration, basePulses, startTime]);

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
    measures
}) {
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
                            basePulses={track.pulses} 
                            startTime={startTime} 
                        />
                    ))}
                </div>
        
                <p className="text-neutral-500 text-xs mt-10 font-medium absolute bottom-8 tracking-wide">(Press ESC to Abort)</p>
            </div>
        );
    }

    return (
        <div className="w-full max-w-2xl text-center space-y-10 flex flex-col items-center">
            <div className="flex flex-col items-center">
                <p className="text-xl font-light animate-pulse text-stone-300">Game running... {measures} Measures</p>
                <p className="text-neutral-500 text-xs mt-2 font-medium tracking-wide">(Press ESC to Abort)</p>
            </div>
      
            <div className="flex justify-center gap-10">
                {tracks.map(track => {
                    const assignedKey = track.key || '';
                    const displayKey = assignedKey === ' ' ? 'SPACE' : assignedKey.toUpperCase();
                    const isPressed = activeKeys[assignedKey];

                    return (
                        <div key={track.id} className="flex flex-col items-center gap-4">
                            <div 
                                className={`w-28 h-28 rounded-full border-4 flex items-center justify-center text-3xl font-bold transition-all duration-75 
                ${isPressed 
                            ? 'bg-stone-300 border-stone-200 text-neutral-900 scale-110 shadow-[0_0_26px_rgba(214,211,209,0.45)]' 
                            : 'bg-white/[0.03] border-white/10 text-neutral-500'}`}
                            >
                                {track.pulses}
                            </div>
                            <div className="text-lg font-bold px-4 py-1.5 bg-white/[0.03] rounded-lg text-neutral-400 border border-white/10">
                                {displayKey}
                            </div>
                        </div>
                    )})}
            </div>
        </div>
    );
}