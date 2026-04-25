import React, { useEffect, useRef, useState } from 'react';

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

function MobilePracticeNode({ track, measureDuration, startTime, isPressed }) {
    const ballRef = useRef(null);

    useEffect(() => {
        let animationFrameId;
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
                    className={`relative z-10 w-full aspect-square rounded-full flex items-center justify-center text-xl font-black transition-colors duration-75 ${isPressed ? 'bg-cyan-300 text-neutral-900 shadow-[0_0_15px_rgba(34,211,238,0.8)]' : 'bg-stone-300 text-neutral-800 shadow-[0_4px_10px_rgba(0,0,0,0.5)]'}`}
                    style={{ willChange: 'transform' }}
                >
                    {track.pulses}
                </div>
            </div>
        </div>
    );
}

export default function PracticeView({
    gameState,
    tracks,
    activeKeys,
    startTime,
    measureDuration,
    onAbortGame,
    onTrackPointerDown,
    onTrackPointerUp,
    onTrackTouchStart,
    onTrackTouchEnd,
    onMobileFreeTapTouchStart,
    onMobileFreeTapTouchEnd,
    onMobileFreeTapPointerDown,
    onMobileFreeTapPointerUp,
    onTrackClick,
    useCustomLayout,
    orientation,
}) {
    const trackCount = tracks.length;
    const extraTracks = Math.max(0, trackCount - 3);
    const baseCircleSizePx = Math.max(92, 112 - (extraTracks * 10));
    const mobileScale = orientation === 'portrait' ? 0.84 : 0.78;
    const circleSizePx = useCustomLayout
        ? Math.round(baseCircleSizePx * mobileScale)
        : baseCircleSizePx;
    const gapPx = Math.max(24, 40 - (extraTracks * 8));
    const pulseFontSizePx = Math.max(24, Math.round(circleSizePx * 0.27));
    const labelFontSizePx = Math.max(14, 18 - (extraTracks * 1.5));
    const labelPadXPx = Math.max(10, 16 - (extraTracks * 2));
    const [countInHighlightMap, setCountInHighlightMap] = useState({});
    const [tapFlashes, setTapFlashes] = useState([]); // Array of { id, x, y } for visual feedback

    const spawnTapFlashes = (points) => {
        if (!Array.isArray(points) || points.length === 0) return;

        const newFlashes = points.map((point, index) => ({
            id: `flash-${point.id || index}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            x: point.x,
            y: point.y
        }));

        setTapFlashes((prev) => [...prev, ...newFlashes]);
        setTimeout(() => {
            setTapFlashes((prev) => prev.filter((flash) => !newFlashes.some((nextFlash) => nextFlash.id === flash.id)));
        }, 350);
    };

    // Wrapper for mobile free-tap that adds visual feedback
    const handleMobileFreeTapWithFeedback = (event) => {
        if (!onMobileFreeTapTouchStart) return;
        
        const changedTouches = event.changedTouches || [];
        const playingSurface = event.currentTarget;
        const rect = playingSurface.getBoundingClientRect();
        
        const points = [];
        for (let i = 0; i < changedTouches.length; i++) {
            const touch = changedTouches[i];
            const relativeX = touch.clientX - rect.left;
            const relativeY = touch.clientY - rect.top;
            const tapXPct = (relativeX / rect.width) * 100;
            const tapYPct = (relativeY / rect.height) * 100;

            points.push({
                id: touch.identifier,
                x: tapXPct,
                y: tapYPct
            });
        }

        spawnTapFlashes(points);
        
        // Call the actual handler
        onMobileFreeTapTouchStart(event);
    };

    const handleMobileFreeTapPointerDownWithFeedback = (event) => {
        if (!onMobileFreeTapPointerDown) return;

        const playingSurface = event.currentTarget;
        const rect = playingSurface.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            const tapXPct = ((event.clientX - rect.left) / rect.width) * 100;
            const tapYPct = ((event.clientY - rect.top) / rect.height) * 100;
            spawnTapFlashes([{ id: event.pointerId, x: tapXPct, y: tapYPct }]);
        }

        onMobileFreeTapPointerDown(event);
    };

    useEffect(() => {
        if (gameState !== 'countIn') {
            return;
        }

        let animationFrameId;

        const renderLoop = () => {
            const now = performance.now();
            const elapsed = Math.max(0, now);
            const nextHighlightMap = {};

            tracks.forEach((track) => {
                const pulses = Math.max(1, track.pulses || 1);
                const pulseDuration = measureDuration / pulses;
                const elapsedInMeasure = elapsed % measureDuration;
                const pulseProgress = (elapsedInMeasure % pulseDuration) / pulseDuration;

                let intensity = 0;
                if (pulseProgress < 0.35) {
                    intensity = 1 - ((pulseProgress / 0.35) * 0.75);
                }

                nextHighlightMap[track.id] = Math.max(0, Math.min(1, intensity));
            });

            setCountInHighlightMap(nextHighlightMap);
            animationFrameId = requestAnimationFrame(renderLoop);
        };

        animationFrameId = requestAnimationFrame(renderLoop);
        return () => cancelAnimationFrame(animationFrameId);
    }, [gameState, tracks, startTime, countInDuration, measureDuration]);

    const renderTrackPad = (track, absoluteStyle) => {
        const assignedKey = track.key || '';
        const normalizedAssignedKey = typeof assignedKey === 'string'
            ? assignedKey.toLowerCase()
            : '';
        const displayKey = assignedKey === ' ' ? 'SPACE' : assignedKey.toUpperCase();
        // Only show pulse highlight during count-in on MOBILE layout
        const pulseLight = (useCustomLayout && gameState === 'countIn') ? (countInHighlightMap[track.id] || 0) : 0;
        const isPressed = Boolean(activeKeys[normalizedAssignedKey]) || pulseLight > 0.18;

        return (
            <div key={track.id} className="flex flex-col items-center gap-4" style={absoluteStyle}>
                <div
                    className={`rounded-full border-4 flex items-center justify-center font-bold transition-all duration-75 ${isPressed
                        ? 'bg-stone-300 border-stone-200 text-neutral-900 scale-105 shadow-[0_0_26px_rgba(214,211,209,0.45)]'
                        : 'bg-white/[0.03] border-white/10 text-neutral-500'} touch-none select-none`}
                    style={{
                        width: `${circleSizePx}px`,
                        height: `${circleSizePx}px`,
                        fontSize: `${pulseFontSizePx}px`,
                        WebkitTapHighlightColor: 'transparent',
                        boxShadow: pulseLight > 0
                            ? `0 0 ${16 + (pulseLight * 20)}px rgba(186,230,253,${0.16 + (pulseLight * 0.35)})`
                            : undefined
                    }}
                    onPointerDown={(event) => onTrackPointerDown?.(event, assignedKey)}
                    onPointerUp={onTrackPointerUp}
                    onPointerCancel={onTrackPointerUp}
                    onTouchStart={(event) => onTrackTouchStart?.(event, assignedKey)}
                    onTouchEnd={onTrackTouchEnd}
                    onTouchCancel={onTrackTouchEnd}
                    onClick={(event) => onTrackClick?.(event, assignedKey)}
                >
                    {track.pulses}
                </div>
                {!useCustomLayout && (
                    <div
                        className="font-bold bg-white/[0.03] rounded-lg text-neutral-400 border border-white/10"
                        style={{
                            fontSize: `${labelFontSizePx}px`,
                            padding: `0.375rem ${labelPadXPx}px`
                        }}
                    >
                        {displayKey}
                    </div>
                )}
            </div>
        );
    };

    if (useCustomLayout) {
        // MOBILE PRACTICE LAYOUT
        return (
            <div className="relative w-full h-full min-h-0 text-center flex flex-col items-stretch gap-3">
                <div className="absolute top-2 right-2 z-50">
                    <button onClick={onAbortGame} className="w-10 h-10 flex items-center justify-center rounded-full bg-black/40 text-white font-bold text-lg border border-white/20 hover:bg-black/60 transition-colors">
                        ✕
                    </button>
                </div>
                <div
                    className="relative w-full flex-1 min-h-0 self-stretch rounded-2xl bg-gradient-to-b from-neutral-900/50 to-neutral-950/30 flex flex-row flex-nowrap justify-evenly px-2 py-15 overflow-hidden"
                    onPointerDown={handleMobileFreeTapPointerDownWithFeedback}
                    onPointerUp={onMobileFreeTapPointerUp}
                    onPointerCancel={onMobileFreeTapPointerUp}
                    onTouchStart={handleMobileFreeTapWithFeedback}
                    onTouchMove={(event) => event.preventDefault()}
                    onTouchEnd={onMobileFreeTapTouchEnd}
                    onTouchCancel={onMobileFreeTapTouchEnd}
                    style={{
                        touchAction: 'none',
                        overscrollBehavior: 'none',
                        WebkitUserSelect: 'none',
                        userSelect: 'none'
                    }}
                >
                    {tracks.map(track => {
                        const normalizedKey = typeof track.key === 'string' ? track.key.toLowerCase() : '';
                        return (
                            <MobilePracticeNode
                                key={track.id} track={track} measureDuration={measureDuration} startTime={startTime}
                                isPressed={Boolean(activeKeys[normalizedKey])}
                            />
                        );
                    })}

                    {tapFlashes.map((flash) => (
                        <div
                            key={flash.id}
                            className="absolute z-30 w-24 h-24 rounded-full pointer-events-none"
                            style={{
                                left: `${flash.x}%`,
                                top: `${flash.y}%`,
                                transform: 'translate(-50%, -50%)',
                                background: 'radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(125,211,252,0.65) 30%, rgba(56,189,248,0.25) 55%, transparent 78%)',
                                filter: 'drop-shadow(0 0 10px rgba(125,211,252,0.45))',
                                animation: 'tapFlash 0.45s ease-out forwards'
                            }}
                        />
                    ))}
                </div>
                <style jsx>{`
                    @keyframes tapFlash {
                        0% { opacity: 0.20; transform: translate(-50%, -50%) scale(0.78); }
                        100% { opacity: 0; transform: translate(-50%, -50%) scale(1.95); }
                    }
                `}</style>
            </div>
        );
    }

    // DESKTOP PRACTICE LAYOUT (Pendulum + Pads)
    return (
        <div className="w-full text-center space-y-8 flex flex-col items-center justify-center h-full">
            <div className="w-full px-8 opacity-70 flex flex-col gap-4 mb-4">
                {tracks.map(track => (
                    <MetronomePendulum
                        key={track.id} label={track.key === ' ' ? 'SPACE' : track.key}
                        measureDuration={measureDuration} countInDuration={0}
                        basePulses={track.pulses} startTime={startTime}
                    />
                ))}
            </div>
            <div className="w-full flex justify-center mt-8" style={{ gap: `${gapPx}px` }}>
                {tracks.map((track) => renderTrackPad(track))}
            </div>
            <p className="text-sm text-neutral-500 mt-6">Press Esc to exit</p>
        </div>
    );
}