import React, { useState, useRef, useEffect } from 'react';
import { SlArrowRight, SlArrowLeft } from "react-icons/sl";

export default function AdjustmentView({ startTempo, onSubmit, minTempo, maxTempo, audioCtx }) {
    const [tempo, setTempo] = useState(startTempo);
    const audioCtxRef = useRef(null);
    const ownsAudioCtxRef = useRef(false);
    const schedulerRef = useRef(null);
    const nextBeatTimeRef = useRef(0);
    const tempoRef = useRef(startTempo);

    useEffect(() => {
        if (audioCtx) {
            audioCtxRef.current = audioCtx;
            ownsAudioCtxRef.current = false;
        } else if (typeof window !== 'undefined') {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!audioCtxRef.current) {
                audioCtxRef.current = new AudioContext();
                ownsAudioCtxRef.current = true;
            }
        }

        if (audioCtxRef.current && audioCtxRef.current.state !== 'running') {
            audioCtxRef.current.resume().catch(() => {});
        }

        return () => {
            if (schedulerRef.current) clearTimeout(schedulerRef.current);
            if (audioCtxRef.current && ownsAudioCtxRef.current) {
                audioCtxRef.current.close().catch(() => {});
            }
        };
    }, [audioCtx]);

    const playClick = (time, ctx) => {
        try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 800;
            gain.gain.setValueAtTime(0.35, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.12);
            osc.start(time);
            osc.stop(time + 0.12);
        } catch (e) {
            console.error('Audio playback failed:', e);
        }
    };

    useEffect(() => {
        if (!audioCtxRef.current) return;

        const ctx = audioCtxRef.current;
        nextBeatTimeRef.current = ctx.currentTime;

        const scheduleBeats = () => {
            if (ctx.state !== 'running') {
                schedulerRef.current = setTimeout(scheduleBeats, 100);
                return;
            }

            const beatDurationSec = 60 / tempoRef.current;
            const now = ctx.currentTime;

            while (nextBeatTimeRef.current < now + 0.1) {
                playClick(nextBeatTimeRef.current, ctx);
                nextBeatTimeRef.current += beatDurationSec;
            }

            schedulerRef.current = setTimeout(scheduleBeats, 50);
        };

        scheduleBeats();

        return () => {
            if (schedulerRef.current) clearTimeout(schedulerRef.current);
        };
    }, []);

    const handleSliderChange = (e) => {
        if (audioCtxRef.current && audioCtxRef.current.state !== 'running') {
            audioCtxRef.current.resume().catch(() => {});
        }

        const newTempo = Number(e.target.value);
        setTempo(newTempo);
        tempoRef.current = newTempo;
    };

    const handleStep = (delta) => {
        if (audioCtxRef.current && audioCtxRef.current.state !== 'running') {
            audioCtxRef.current.resume().catch(() => {});
        }
        
        const newTempo = Math.max(minTempo, Math.min(maxTempo, tempo + delta));
        setTempo(newTempo);
        tempoRef.current = newTempo;
    };

    return (
        <div className="h-full w-full flex flex-col items-center justify-center">
            <div className="relative w-full h-full max-w-lg text-center flex flex-col justify-center px-4 gap-5">

                <div className="flex flex-col items-center justify-center mb-2">
                    <div className="flex items-center justify-center gap-4 md:gap-6">
                        <button 
                            onClick={() => handleStep(-1)}
                            className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-full border border-white/5 bg-white/[0.03] text-2xl font-light text-neutral-400 transition-all hover:bg-white/[0.08] hover:text-stone-200 active:scale-95"
                            aria-label="Tempo verringern"
                        >
                            <SlArrowLeft />
                        </button>
                        
                        <div className="text-6xl font-black text-stone-200 md:text-8xl w-[3.5ch] text-center tabular-nums">
                            {tempo}
                        </div>

                        <button 
                            onClick={() => handleStep(1)}
                            className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-full border border-white/5 bg-white/[0.03] text-2xl font-light text-neutral-400 transition-all hover:bg-white/[0.08] hover:text-stone-200 active:scale-95"
                            aria-label="Tempo erhöhen"
                        >
                            <SlArrowRight />
                        </button>
                    </div>
                    <p className="mt-4 text-xs uppercase tracking-[0.28em] text-neutral-500">BPM</p>
                </div>

                <div className="mx-auto mb-7 w-full max-w-md rounded-2xl px-4 py-4">
                    <input
                        type="range"
                        min={minTempo}
                        max={maxTempo}
                        value={tempo}
                        onChange={handleSliderChange}
                        className="slider h-2 w-full cursor-pointer appearance-none rounded-lg bg-neutral-700"
                        style={{
                            background: `linear-gradient(to right, rgb(168 162 158) 0%, rgb(231 229 228) ${((tempo - minTempo) / (maxTempo - minTempo)) * 100}%, rgb(64 64 64) ${((tempo - minTempo) / (maxTempo - minTempo)) * 100}%, rgb(64 64 64) 100%)`
                        }}
                    />

                    <div className="mt-4 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-neutral-500">
                        <span>{minTempo}</span>
                        <span>{maxTempo}</span>
                    </div>
                </div>

                <div className="pointer-events-none absolute bottom-0 right-0">
                    <button
                        onClick={() => onSubmit(tempo)}
                        className="pointer-events-auto grid h-12 w-12 place-items-center rounded-full bg-stone-200 text-neutral-950 shadow-lg shadow-stone-500/30 transition-transform hover:scale-105 active:scale-95"
                    >
                        <span className="text-xl leading-none">
                            <SlArrowRight />
                        </span>
                    </button>
                </div>
            </div>

            <style jsx>{`
                .slider::-webkit-slider-thumb {
                    appearance: none;
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    border: 2px solid rgba(255, 255, 255, 0.5);
                    background: linear-gradient(135deg, rgb(168 162 158), rgb(231 229 228));
                    cursor: pointer;
                    box-shadow: 0 0 0 6px rgba(168, 162, 158, 0.18);
                }
                .slider::-moz-range-thumb {
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    border: 2px solid rgba(255, 255, 255, 0.5);
                    background: linear-gradient(135deg, rgb(168 162 158), rgba(231, 229, 228, 0));
                    cursor: pointer;
                    box-shadow: 0 0 0 6px rgba(168, 162, 158, 0.18);
                }
            `}</style>
        </div>
    );
}