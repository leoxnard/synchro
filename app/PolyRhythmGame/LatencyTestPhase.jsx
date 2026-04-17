import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const MAX_EVENTS = 320;
const WINDOW_BEFORE_MS = 900;
const WINDOW_AFTER_MS = 2900;
const LOOKAHEAD_SECONDS = 0.15;
const SCHEDULE_INTERVAL_MS = 25;

const formatKeyLabel = (key) => {
    if (key === ' ') return 'SPACE';
    if (key.length === 1) return key.toUpperCase();
    return key.toUpperCase();
};

const round2 = (value) => Math.round(value * 100) / 100;

const findPreviousBeatTime = (beatTimes, eventTime) => {
    if (beatTimes.length === 0) return null;

    let previous = null;
    for (let i = 0; i < beatTimes.length; i++) {
        const beat = beatTimes[i];
        if (beat <= eventTime) {
            previous = beat;
            continue;
        }
        break;
    }

    return previous;
};

export default function LatencyTestPhase({ bpm, onClose }) {
    const [nowMs, setNowMs] = useState(0);
    const [inputEvents, setInputEvents] = useState([]);
    const [pressedKeyHistory, setPressedKeyHistory] = useState([]);
    const [activeKeys, setActiveKeys] = useState({});

    const audioCtxRef = useRef(null);
    const schedulerRef = useRef(null);
    const rafRef = useRef(null);
    const nextBeatTimeRef = useRef(0);
    const beatTimesRef = useRef([]);

    const getAudioContextOffset = useCallback(() => {
        if (!audioCtxRef.current) return performance.now();
        return performance.now() - (audioCtxRef.current.currentTime * 1000);
    }, []);

    const beatIntervalMs = useMemo(() => (60 / Math.max(1, bpm)) * 1000, [bpm]);

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

    useEffect(() => {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;

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
            while (nextBeatTimeRef.current < currentAudioTime + LOOKAHEAD_SECONDS) {
                const beatPerfMs = getAudioContextOffset() + (nextBeatTimeRef.current * 1000);
                beatTimesRef.current.push(beatPerfMs);
                if (beatTimesRef.current.length > MAX_EVENTS) {
                    beatTimesRef.current = beatTimesRef.current.slice(-MAX_EVENTS);
                }

                scheduleClick(nextBeatTimeRef.current);
                nextBeatTimeRef.current += beatIntervalMs / 1000;
            }

            const cutoff = performance.now() - (WINDOW_BEFORE_MS + 200);
            beatTimesRef.current = beatTimesRef.current.filter((time) => time >= cutoff);
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

            const key = event.key.toLowerCase();
            if (key === ' ') event.preventDefault();

            setActiveKeys((prev) => ({ ...prev, [key]: true }));

            const eventTime = performance.now();
            const previousBeat = findPreviousBeatTime(beatTimesRef.current, eventTime);
            const deltaToBeat = previousBeat === null ? 0 : eventTime - previousBeat;

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
    }, [onClose]);

    const beatMarkers = useMemo(() => {
        const range = WINDOW_BEFORE_MS + WINDOW_AFTER_MS;
        return beatTimesRef.current
            .map((time, index) => {
                const relative = time - (nowMs - WINDOW_BEFORE_MS);
                const x = (relative / range) * 100;
                return {
                    id: `b-${index}-${time}`,
                    x
                };
            })
            .filter((item) => item.x >= -2 && item.x <= 102);
    }, [nowMs]);

    const inputMarkers = useMemo(() => {
        const range = WINDOW_BEFORE_MS + WINDOW_AFTER_MS;
        return inputEvents
            .map((entry) => {
                const relative = entry.time - (nowMs - WINDOW_BEFORE_MS);
                const x = (relative / range) * 100;
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
                const avg = deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
                const absAvg = deltas.reduce((sum, value) => sum + Math.abs(value), 0) / deltas.length;
                return {
                    key,
                    count: deltas.length,
                    avg,
                    absAvg
                };
            })
            .sort((a, b) => b.count - a.count);
    }, [inputEvents]);

    const recentEvents = useMemo(
        () => inputEvents.slice(-10).reverse(),
        [inputEvents]
    );

    return (
        <div className="w-full max-w-5xl p-2 text-center flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
                <div className="text-left">
                    <h2 className="text-lg font-semibold text-stone-200 tracking-wide">Input Lag Test</h2>
                    <p className="text-xs text-neutral-400 mt-1">
                        Metronome @ {Math.round(bpm)} BPM. Lines move from right to left. Beat lines are gray, input lines are cyan.
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-full border border-white/15 text-neutral-300 text-xs font-semibold tracking-wide hover:text-white hover:bg-white/[0.06] transition-colors"
                    >
                        Continue
                    </button>
                </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-neutral-900/60 p-3">
                <div className="relative h-48 w-full overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b from-neutral-900/80 to-neutral-950">
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.07)_1px,transparent_1px)] bg-[size:8%_100%] opacity-30" />
                    <div className="absolute top-0 bottom-0 left-[23.6842105263%] w-[2px] bg-amber-200/90" />

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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-left">
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
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                        {perKeyStats.length === 0 && (
                            <div className="text-sm text-neutral-500">No measurements yet.</div>
                        )}
                        {perKeyStats.map((item) => (
                            <div key={item.key} className="grid grid-cols-[1.2fr_1fr_1fr] gap-2 text-xs text-neutral-300">
                                <span className="font-semibold text-stone-200">{formatKeyLabel(item.key)} ({item.count}x)</span>
                                <span>avg: {round2(item.avg)}ms</span>
                                <span>abs: {round2(item.absAvg)}ms</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-neutral-900/55 p-3 text-left">
                <div className="text-xs uppercase tracking-widest text-neutral-500 mb-2">Recent Inputs</div>
                <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                    {recentEvents.length === 0 && (
                        <div className="text-sm text-neutral-500">No inputs captured.</div>
                    )}
                    {recentEvents.map((entry) => (
                        <div key={entry.id} className="text-xs text-neutral-300 flex justify-between gap-2">
                            <span className="font-semibold text-stone-200">{formatKeyLabel(entry.key)}</span>
                            <span className={entry.deltaToBeat > 0 ? 'text-amber-300' : 'text-cyan-300'}>
                                {entry.deltaToBeat > 0 ? '+' : ''}{Math.round(entry.deltaToBeat)}ms
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            <p className="text-xs text-neutral-500 text-left">
                ESC closes the test immediately. Positive values mean after the beat (late). Negative values mean before the beat (early).
            </p>
        </div>
    );
}
