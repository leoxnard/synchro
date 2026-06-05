import React, { useEffect, useState } from 'react';
import { MetronomePendulum, MobilePracticeNode } from './components/Pendulums';

export default function PlayingView({
    gameState,
    count,
    tracks,
    activeKeys,
    startTime,
    measureDuration,
    countInDuration,
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
    const [tapFlashes, setTapFlashes] = useState([]);

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
            const countInStartTime = startTime - countInDuration;
            const elapsed = Math.max(0, now - countInStartTime);
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
        return (
            <div className="relative w-full h-full min-h-0 text-center flex flex-col items-stretch gap-3">
                <div 
                    className="relative w-full flex-1 min-h-0 self-stretch rounded-2xl flex flex-col items-center justify-center overflow-hidden"
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
                    {gameState === 'countIn' && (
                        <div className="p-2 w-full flex flex-col items-center justify-center">
                            {/* Counter */}
                            <div className="w-full flex items-center justify-center shrink-0 select-none">
                                <div className="flex flex-col items-center opacity-30 animate-pulse">
                                    <div className="text-7xl font-black text-white">{count}</div>
                                </div>
                            </div>

                            {/* Mobile layout with bouncing balls and free-tap surface */}
                            <div
                                className="relative w-full flex-1 min-h-0 self-stretch rounded-2xl flex flex-row flex-nowrap justify-evenly p-2 py-6 overflow-hidden"
                                style={{
                                    touchAction: 'none',
                                    overscrollBehavior: 'none',
                                    WebkitUserSelect: 'none',
                                    userSelect: 'none'
                                }}
                            >
                                {tracks.map(track => {
                                    return (
                                        <MobilePracticeNode
                                            key={track.id} track={track} measureDuration={measureDuration} 
                                            startTime={startTime - countInDuration} 
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    )}

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

    // Desktop layout with MetronomePendulum bars
    return (
        <div className="w-full text-center grid">
            <div 
                className={`col-start-1 row-start-1 w-full flex flex-col items-center justify-center transition-opacity duration-100 ${
                    gameState === 'countIn' 
                        ? 'opacity-100 pointer-events-auto z-10' 
                        : 'opacity-0 pointer-events-none z-0'
                }`}
            >
                <div className="animate-pulse flex flex-col items-center mb-6">
                    <div className="text-8xl font-black text-white">{count > 0 ? count : 'GO!'}</div>
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

            <div 
                className={`col-start-1 row-start-1 w-full flex items-center justify-center transition-opacity duration-100 ${
                    gameState === 'countIn' 
                        ? 'opacity-0 pointer-events-none z-0' 
                        : 'opacity-100 pointer-events-auto z-10'
                }`} 
                style={{ gap: `${gapPx}px` }}
            >
                {tracks.map((track) => renderTrackPad(track))}
            </div>

        </div>
    );
}