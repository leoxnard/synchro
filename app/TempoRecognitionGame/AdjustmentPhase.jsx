import React, { useState, useRef, useEffect } from 'react';

export default function AdjustmentPhase({ startTempo, onSubmit, minTempo, maxTempo }) {
    const [tempo, setTempo] = useState(startTempo);
    const audioCtxRef = useRef(null);
    const schedulerRef = useRef(null);
    const nextBeatTimeRef = useRef(0);
    const tempoRef = useRef(startTempo);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!audioCtxRef.current) {
                audioCtxRef.current = new AudioContext();
            }
        }

        return () => {
            if (schedulerRef.current) clearTimeout(schedulerRef.current);
        };
    }, []);

    // Start continuous scheduler
    useEffect(() => {
        if (!audioCtxRef.current) return;

        const ctx = audioCtxRef.current;
        nextBeatTimeRef.current = ctx.currentTime;

        const scheduleBeats = () => {
            const beatDurationSec = 60 / tempoRef.current;
            const now = ctx.currentTime;

            // Schedule beats up to 100ms in the future
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

    const handleSliderChange = (e) => {
        const newTempo = Number(e.target.value);
        setTempo(newTempo);
        tempoRef.current = newTempo;
    };

    return (
        <div className="w-full h-screen flex items-center justify-center">
            <div className="text-center">
                <p className="text-neutral-400 text-sm mb-8">Adjust the tempo</p>
                
                <div className="text-7xl font-bold text-emerald-400 mb-12">
                    {tempo}
                </div>

                <input
                    type="range"
                    min={minTempo}
                    max={maxTempo}
                    value={tempo}
                    onChange={handleSliderChange}
                    className="w-64 h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer slider"
                    style={{
                        background: `linear-gradient(to right, rgb(16 185 129) 0%, rgb(16 185 129) ${((tempo - minTempo) / (maxTempo - minTempo)) * 100}%, rgb(55 65 81) ${((tempo - minTempo) / (maxTempo - minTempo)) * 100}%, rgb(55 65 81) 100%)`
                    }}
                />

                <p className="text-neutral-500 text-xs mt-6 mb-12">{minTempo} - {maxTempo} BPM</p>

                <button
                    onClick={() => onSubmit(tempo)}
                    className="px-12 py-3 bg-emerald-500 hover:bg-emerald-400 text-neutral-900 font-bold rounded-lg transition-colors"
                >
                    Submit
                </button>
            </div>

            <style jsx>{`
                .slider::-webkit-slider-thumb {
                    appearance: none;
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    background: rgb(16 185 129);
                    cursor: pointer;
                    box-shadow: 0 0 10px rgba(16, 185, 129, 0.5);
                }
                .slider::-moz-range-thumb {
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    background: rgb(16 185 129);
                    cursor: pointer;
                    border: none;
                    box-shadow: 0 0 10px rgba(16, 185, 129, 0.5);
                }
            `}</style>
        </div>
    );
}
