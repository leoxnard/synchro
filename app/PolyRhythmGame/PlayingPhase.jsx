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
        <div className="w-full max-w-xl mx-auto mt-4 bg-neutral-800 h-8 rounded-full border border-neutral-700 relative flex items-center px-4">
            <div className="absolute left-4 z-10 font-bold text-xs text-neutral-400 tracking-widest pointer-events-none">{label} ({basePulses})</div>
            <div className="flex-1 h-full relative font-sans select-none">
                <div 
                    ref={pointerRef}
                    className="absolute top-0 bottom-0 w-8 bg-emerald-400 rounded-full shadow-[0_0_15px_rgba(52,211,153,0.6)] transform -translate-x-1/2 will-change-transform"
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
                    <p className="text-2xl font-light text-emerald-400 mb-8">Get ready...</p>
                    <div className="text-9xl font-black text-white mb-8">{count > 0 ? count : 'GO!'}</div>
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
        
                <p className="text-neutral-500 text-sm mt-12 font-medium absolute bottom-12">(Press ESC to Abort)</p>
            </div>
        );
    }

    return (
        <div className="w-full max-w-2xl text-center space-y-12">
            <div className="flex flex-col items-center">
                <p className="text-2xl font-light animate-pulse text-emerald-400">Game running... {measures} Measures</p>
                <p className="text-neutral-500 text-sm mt-2 font-medium">(Press ESC to Abort)</p>
            </div>
      
            <div className="flex justify-center gap-12">
                {tracks.map(track => {
                    const assignedKey = track.key || '';
                    const displayKey = assignedKey === ' ' ? 'SPACE' : assignedKey.toUpperCase();
                    const isPressed = activeKeys[assignedKey];

                    return (
                        <div key={track.id} className="flex flex-col items-center gap-4">
                            <div 
                                className={`w-32 h-32 rounded-full border-4 flex items-center justify-center text-4xl font-bold transition-all duration-75 
                ${isPressed 
                            ? 'bg-emerald-500 border-emerald-400 text-neutral-900 scale-110 shadow-[0_0_30px_rgba(52,211,153,0.6)]' 
                            : 'bg-neutral-800 border-neutral-700 text-neutral-500'}`}
                            >
                                {track.pulses}
                            </div>
                            <div className="text-xl font-bold px-4 py-2 bg-neutral-800 rounded-lg text-neutral-400">
                                {displayKey}
                            </div>
                        </div>
                    )})}
            </div>
        </div>
    );
}