import React, { useEffect, useMemo, useRef, useState } from 'react';

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
    onTrackPointerDown,
    onTrackPointerUp,
    onTrackTouchStart,
    onTrackTouchEnd,
    onTrackClick,
    useCustomLayout,
    orientation,
    buttonLayout
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
    const countInHeaderClass = 'h-24 md:h-28';

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

    const fallbackLayoutMap = useMemo(() => {
        const total = tracks.length;
        const isPortrait = orientation === 'portrait';
        const xBase = isPortrait ? 56 : 54;
        const yStart = isPortrait ? 24 : 18;
        const yEnd = isPortrait ? 78 : 82;
        const xOffsetsByCount = {
            1: [0],
            2: [0, 0],
            3: [0, -8, 0],
            4: [0, -7, -7, 0],
            5: [0, -5, -10, -5, 0]
        };
        const xOffsets = xOffsetsByCount[total];
        const fallback = {};

        if (xOffsets) {
            tracks.forEach((track, index) => {
                const t = total <= 1 ? 0.5 : index / (total - 1);
                fallback[track.id] = {
                    x: Math.max(10, Math.min(90, xBase + (xOffsets[index] || 0))),
                    y: Math.max(20, Math.min(84, yStart + (t * (yEnd - yStart))))
                };
            });
            return fallback;
        }

        tracks.forEach((track, index) => {
            const t = tracks.length <= 1 ? 0.5 : index / (tracks.length - 1);
            if (orientation === 'portrait') {
                fallback[track.id] = {
                    x: 28 + (t * 52),
                    y: 68 - (Math.sin(t * Math.PI) * 14) + (t * 6)
                };
            } else {
                fallback[track.id] = {
                    x: 18 + (t * 64),
                    y: 58 - (Math.sin(t * Math.PI) * 6)
                };
            }
        });

        return fallback;
    }, [tracks, orientation]);

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

    // Mobile custom layout: Pads light up during count-in, then play normally
    if (useCustomLayout) {
        return (
            <div className="relative w-full h-full min-h-0 text-center flex flex-col items-stretch gap-3">
                {gameState === 'countIn' && (
                    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center select-none">
                        <div className="flex flex-col items-center opacity-30 animate-pulse">
                            <div className="text-7xl font-black text-white">{count > 0 ? count : 'GO!'}</div>
                        </div>
                    </div>
                )}

                <div className="relative w-full flex-1 min-h-0 self-stretch rounded-2xl">
                    {tracks.map((track, index) => {
                        const pos = buttonLayout?.[track.id] || fallbackLayoutMap[track.id] || fallbackLayoutMap[tracks[index]?.id];
                        return renderTrackPad(track, {
                            position: 'absolute',
                            left: `${pos?.x ?? 50}%`,
                            top: `${pos?.y ?? 56}%`,
                            transform: 'translate(-50%, -50%)'
                        });
                    })}
                </div>
            </div>
        );
    }

    // Desktop layout with MetronomePendulum bars
    return (
        <div className="w-full text-center space-y-8 flex flex-col items-center">
            {gameState === 'countIn' ? (
                <div className="w-full flex-1 flex flex-col items-center justify-center">
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
            ) : (
                <div className="w-full flex justify-center" style={{ gap: `${gapPx}px` }}>
                    {tracks.map((track) => renderTrackPad(track))}
                </div>
            )}
        </div>
    );
}