import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { 
    MAX_EVENTS,
    WINDOW_BEFORE_MS,
    WINDOW_AFTER_MS,
    SCHEDULE_INTERVAL_MS,
    SCHEDULE_AHEAD_SECONDS,
    BPM,
    MIN_ALLOWED_NEGATIVE_LATENCY_MS
} from './constants/gameConfig';

const formatKeyLabel = (key) => {
    if (key === ' ') return 'SPACE';
    if (key.length === 1) return key.toUpperCase();
    return key.toUpperCase();
};

const getNearestGridDeltaMs = (eventTimeMs, beatTimes) => {
    if (!Number.isFinite(eventTimeMs) || !Array.isArray(beatTimes) || beatTimes.length === 0) {
        return 0;
    }

    let nearestBeatTime = beatTimes[0];
    let nearestDistance = Math.abs(eventTimeMs - nearestBeatTime);

    for (let i = 1; i < beatTimes.length; i += 1) {
        const candidate = beatTimes[i];
        const distance = Math.abs(eventTimeMs - candidate);
        if (distance < nearestDistance) {
            nearestBeatTime = candidate;
            nearestDistance = distance;
        }
    }

    let deltaMs = eventTimeMs - nearestBeatTime;

    return Math.max(MIN_ALLOWED_NEGATIVE_LATENCY_MS, deltaMs);
};

const getAverageColor = (value, minValue, maxValue) => {
    if (!Number.isFinite(value)) return 'hsl(0 0% 70%)';
    if (!Number.isFinite(minValue) || !Number.isFinite(maxValue) || minValue === maxValue) {
        return 'hsl(120 70% 55%)';
    }

    const ratio = (value - minValue) / (maxValue - minValue);
    const clampedRatio = Math.max(0, Math.min(1, ratio));
    const hue = 120 - (clampedRatio * 120);
    return `hsl(${hue} 80% 60%)`;
};

export default function LatencyTestView({ onClose }) {
    const [nowMs, setNowMs] = useState(0);
    const [inputEvents, setInputEvents] = useState([]);
    const [pressedKeyHistory, setPressedKeyHistory] = useState([]);
    const [activeKeys, setActiveKeys] = useState({});
    const [beatTimes, setBeatTimes] = useState([]);

    const audioCtxRef = useRef(null);
    const schedulerRef = useRef(null);
    const rafRef = useRef(null);
    const nextBeatTimeRef = useRef(0);
    const beatTimesRef = useRef([]);

    const getAudioContextOffset = useCallback(() => {
        if (!audioCtxRef.current) return performance.now();
        return performance.now() - (audioCtxRef.current.currentTime * 1000);
    }, []);

    const beatIntervalMs = (60 / Math.max(1, BPM)) * 1000;

    const stopAudio = useCallback(() => {
        if (schedulerRef.current) {
            window.clearInterval(schedulerRef.current);
            schedulerRef.current = null;
        }

        if (audioCtxRef.current) {
            audioCtxRef.current.close().catch(() => {});
            audioCtxRef.current = null;
        }
    }, []);

    const resetTest = useCallback(() => {
        setInputEvents([]);
        setPressedKeyHistory([]);
        setActiveKeys({});
    }, []);

    useEffect(async () => {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContext();
        const unmute = (await import('iosunmute')).default;
        unmute(ctx);
        audioCtxRef.current = ctx;
        if (ctx.state !== 'running') {
            ctx.resume().catch(() => {});
        }

        const leadIn = 0.2;
        nextBeatTimeRef.current = ctx.currentTime + leadIn;

        const scheduleClick = (whenSeconds) => {
            if (!audioCtxRef.current) return;
            const osc = audioCtxRef.current.createOscillator();
            const gain = audioCtxRef.current.createGain();
            osc.connect(gain);
            gain.connect(audioCtxRef.current.destination);
            osc.frequency.value = 1000;
            gain.gain.setValueAtTime(0.42, whenSeconds);
            gain.gain.exponentialRampToValueAtTime(0.001, whenSeconds + 0.07);
            osc.start(whenSeconds);
            osc.stop(whenSeconds + 0.07);
        };

        schedulerRef.current = window.setInterval(() => {
            const currentAudioTime = ctx.currentTime;
            while (nextBeatTimeRef.current < currentAudioTime + SCHEDULE_AHEAD_SECONDS) {
                const beatPerfMs = getAudioContextOffset() + (nextBeatTimeRef.current * 1000);
                beatTimesRef.current.push(beatPerfMs);
                if (beatTimesRef.current.length > MAX_EVENTS) {
                    beatTimesRef.current = beatTimesRef.current.slice(-MAX_EVENTS);
                }

                setBeatTimes([...beatTimesRef.current]);

                scheduleClick(nextBeatTimeRef.current);
                nextBeatTimeRef.current += beatIntervalMs / 1000;
            }

            const cutoff = performance.now() - (WINDOW_BEFORE_MS + 200);
            beatTimesRef.current = beatTimesRef.current.filter((time) => time >= cutoff);
            setBeatTimes([...beatTimesRef.current]);
        }, SCHEDULE_INTERVAL_MS);

        const tick = () => {
            setNowMs(performance.now());
            rafRef.current = window.requestAnimationFrame(tick);
        };
        rafRef.current = window.requestAnimationFrame(tick);

        return () => {
            if (rafRef.current) {
                window.cancelAnimationFrame(rafRef.current);
            }
            stopAudio();
        };
    }, [beatIntervalMs, getAudioContextOffset, stopAudio]);

    useEffect(() => {
        const onKeyDown = (event) => {
            if (event.repeat) return;

            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
                return;
            }

            if (event.key === 'Backspace') {
                event.preventDefault();
                resetTest();
                return;
            }

            const key = event.key.toLowerCase();
            if (key === ' ') event.preventDefault();

            setActiveKeys((prev) => ({ ...prev, [key]: true }));

            const eventTime = performance.now();
            const deltaToBeat = getNearestGridDeltaMs(
                eventTime,
                beatTimesRef.current
            );

            setInputEvents((prev) => {
                const next = [
                    ...prev,
                    {
                        id: `${eventTime}-${key}-${prev.length}`,
                        key,
                        time: eventTime,
                        deltaToBeat
                    }
                ];
                return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next;
            });

            setPressedKeyHistory((prev) => {
                if (prev.includes(key)) return prev;
                const next = [...prev, key];
                return next.length > 20 ? next.slice(-20) : next;
            });
        };

        const onKeyUp = (event) => {
            const key = event.key.toLowerCase();
            setActiveKeys((prev) => ({ ...prev, [key]: false }));
        };

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);

        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
        };
    }, [beatIntervalMs, onClose, resetTest]);

    const beatMarkers = useMemo(() => {
        const timelineSpanMs = Math.max(WINDOW_BEFORE_MS, WINDOW_AFTER_MS);
        return beatTimes
            .map((time, index) => {
                const deltaMs = time - nowMs;
                const x = 50 + ((deltaMs / Math.max(1, timelineSpanMs)) * 50);
                return {
                    id: `b-${index}-${time}`,
                    x
                };
            })
            .filter((item) => item.x >= -2 && item.x <= 102);
    }, [beatTimes, nowMs]);

    const inputMarkers = useMemo(() => {
        const timelineSpanMs = Math.max(WINDOW_BEFORE_MS, WINDOW_AFTER_MS);
        return inputEvents
            .map((entry) => {
                const deltaMs = entry.time - nowMs;
                const x = 50 + ((deltaMs / Math.max(1, timelineSpanMs)) * 50);
                return {
                    ...entry,
                    x
                };
            })
            .filter((item) => item.x >= -2 && item.x <= 102);
    }, [inputEvents, nowMs]);

    const perKeyStats = useMemo(() => {
        const byKey = new Map();
        inputEvents.forEach((entry) => {
            if (!byKey.has(entry.key)) {
                byKey.set(entry.key, []);
            }
            byKey.get(entry.key).push(entry.deltaToBeat);
        });

        return Array.from(byKey.entries())
            .map(([key, deltas]) => {
                const avg = deltas.slice(-20).reduce((sum, value) => sum + value, 0) / deltas.length;
                return {
                    key,
                    count: deltas.length,
                    avg,
                };
            })
            .sort((a, b) => b.count - a.count);
    }, [inputEvents]);

    const avgRange = useMemo(() => {
        if (perKeyStats.length === 0) {
            return { minAvg: 0, maxAvg: 0 };
        }

        return {
            minAvg: Math.min(...perKeyStats.map((item) => item.avg)),
            maxAvg: Math.max(...perKeyStats.map((item) => item.avg))
        };
    }, [perKeyStats]);

    const recentEvents = useMemo(
        () => inputEvents.slice().reverse(),
        [inputEvents]
    );

    return (
        <div className="w-full max-w-5xl self-stretch flex-1 h-full min-h-0 overflow-hidden p-2 text-center flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3 shrink-0">
                <div className="text-left">
                    <h2 className="text-lg font-semibold text-stone-200 tracking-wide">Input Lag Test</h2>
                </div>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={resetTest}
                        className="px-4 py-2 rounded-full border border-white/15 text-neutral-300 text-xs font-semibold tracking-wide hover:text-white hover:bg-white/[0.06] transition-colors"
                    >
                        Reset
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-full border border-white/15 text-neutral-300 text-xs font-semibold tracking-wide hover:text-white hover:bg-white/[0.06] transition-colors"
                    >
                        Continue
                    </button>
                </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-neutral-900/60 p-3 shrink-0">
                <div className="relative h-48 w-full overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b from-neutral-900/80 to-neutral-950">
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.07)_1px,transparent_1px)] bg-[size:8%_100%] opacity-30" />
                    <div className="absolute top-0 bottom-0 left-1/2 w-[2px] -translate-x-1/2 bg-amber-200/90" />

                    {beatMarkers.map((marker) => (
                        <div
                            key={marker.id}
                            className="absolute top-0 bottom-0 w-[1px] bg-white/45"
                            style={{ left: `${marker.x}%` }}
                        />
                    ))}

                    {inputMarkers.map((marker) => (
                        <div
                            key={marker.id}
                            className="absolute top-0 bottom-0 w-[2px] bg-cyan-300 shadow-[0_0_6px_rgba(34,211,238,0.7)]"
                            style={{ left: `${marker.x}%` }}
                            title={`${formatKeyLabel(marker.key)}: ${Math.round(marker.deltaToBeat)}ms`}
                        />
                    ))}
                </div>
                <div className="flex justify-between text-[11px] text-neutral-500 mt-2 px-1 tracking-wide">
                    <span>past</span>
                    <span>target (now)</span>
                    <span>future</span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-left shrink-0">
                <div className="rounded-xl border border-white/10 bg-neutral-900/55 p-3">
                    <div className="text-xs uppercase tracking-widest text-neutral-500 mb-2">Pressed Keys (Session)</div>
                    <div className="flex flex-wrap gap-2 min-h-10">
                        {pressedKeyHistory.length === 0 && (
                            <span className="text-sm text-neutral-500">No inputs yet.</span>
                        )}
                        {pressedKeyHistory.map((key) => {
                            const isActive = Boolean(activeKeys[key]);
                            return (
                                <span
                                    key={key}
                                    className={`px-2.5 py-1 rounded-md border text-xs font-bold tracking-wide ${
                                        isActive
                                            ? 'border-cyan-300/80 bg-cyan-400/15 text-cyan-100'
                                            : 'border-white/15 bg-white/[0.03] text-neutral-300'
                                    }`}
                                >
                                    {formatKeyLabel(key)}
                                </span>
                            );
                        })}
                    </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-neutral-900/55 p-3">
                    <div className="text-xs uppercase tracking-widest text-neutral-500 mb-2">Lag Per Key</div>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                        {perKeyStats.length === 0 && (
                            <div className="text-sm text-neutral-500">No measurements yet.</div>
                        )}
                        {perKeyStats.map((item) => (
                            <div key={item.key} className="flex items-center justify-between gap-3 text-xs text-neutral-300">
                                <span className="font-semibold text-stone-200">{formatKeyLabel(item.key)} ({item.count}x)</span>
                                <span className="shrink-0 whitespace-nowrap" style={{ color: getAverageColor(item.avg, avgRange.minAvg, avgRange.maxAvg) }}>
                                    avg: {item.avg.toFixed(0)}ms
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-neutral-900/55 p-3 text-left flex flex-col flex-1 basis-0 min-h-0 overflow-hidden">
                <div className="text-xs uppercase tracking-widest text-neutral-500 mb-2">Recent Inputs</div>
                <div className="space-y-1 flex-1 min-h-0 overflow-hidden">
                    {recentEvents.length === 0 && (
                        <div className="text-sm text-neutral-500">No inputs captured.</div>
                    )}
                    {recentEvents.map((entry) => (
                        <div key={entry.id} className="text-xs text-neutral-300 flex justify-between gap-2">
                            <span className="font-semibold text-stone-200">{formatKeyLabel(entry.key)}</span>
                            <span className={entry.deltaToBeat > 0 ? 'text-neutral-300' : 'text-cyan-300'}>
                                {entry.deltaToBeat > 0 ? '+' : ''}{Math.round(entry.deltaToBeat)}ms
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
