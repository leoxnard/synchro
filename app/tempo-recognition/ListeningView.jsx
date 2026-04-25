import React, { useEffect, useState, useRef } from 'react';
import { motion, useAnimationFrame } from 'framer-motion';

const LISTENING_DURATION_MS = 5000;

const DynamicAudioWave = ({ baseRadius, color, volatility, speed, strokeWidth }) => {
    const pathRef = useRef(null);

    useAnimationFrame((time) => {
        const t = time * speed;
        let points = [];
        
        for (let i = 0; i <= 360; i += 1) {
            const angle = (i * Math.PI) / 180;

            let noise = 0;
            noise += Math.sin(angle * 7 + t * 0.001) * (volatility * 0.25);
            noise += Math.cos(angle * 19 - t * 0.002) * (volatility * 0.25);
            noise += Math.sin(angle * 43 + t * 0.006) * (volatility * 0.2);
            noise += Math.cos(angle * 97 - t * 0.01) * (volatility * 0.15); 

            const crackle = (Math.random() - 0.5) * (volatility * 0.6);

            const r = baseRadius + noise + crackle;
            const x = 50 + r * Math.cos(angle);
            const y = 50 + r * Math.sin(angle);

            points.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`);
        }

        if (pathRef.current) {
            pathRef.current.setAttribute('d', points.join(' ') + ' Z');
        }
    });

    return (
        <path
            ref={pathRef}
            fill="transparent"
            stroke={color}
            strokeWidth={strokeWidth}
            style={{ filter: `drop-shadow(0px 0px 4px ${color})` }}
        />
    );
};

export default function ListeningView({ targetTempo, audioCtx, onListeningComplete }) {
    const [progress, setProgress] = useState(100);
    const [pulses, setPulses] = useState([]);
    const [centerPulseKey, setCenterPulseKey] = useState(0);
    const schedulerRef = useRef(null);
    const nextBeatTimeRef = useRef(0);
    const startTimeRef = useRef(0);
    const animationFrameRef = useRef(null);
    const pulseTimeoutRefs = useRef([]);
    const pulseIdRef = useRef(0);

    const playClick = (time, ctx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 800;
        gain.gain.setValueAtTime(0.3, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.12);
        osc.start(time);
        osc.stop(time + 0.12);
    };

    const schedulePulse = (beatTime, ctx) => {
        const delayMs = Math.max(0, (beatTime - ctx.currentTime) * 1000);
        const timeoutId = setTimeout(() => {
            const pulseId = ++pulseIdRef.current;
            setPulses(prev => [...prev, pulseId]);
            setCenterPulseKey(pulseId);

            const cleanupId = setTimeout(() => {
                setPulses(prev => prev.filter(id => id !== pulseId));
            }, 2100); 

            pulseTimeoutRefs.current.push(cleanupId);
        }, delayMs);

        pulseTimeoutRefs.current.push(timeoutId);
    };

    useEffect(() => {
        if (!audioCtx) return;

        if (audioCtx.state !== 'running') {
            audioCtx.resume().catch(() => {});
        }

        const audioStartTime = audioCtx.currentTime;
        const endTime = audioStartTime + LISTENING_DURATION_MS / 1000;
        nextBeatTimeRef.current = audioStartTime;
        startTimeRef.current = Date.now();

        const scheduleBeats = () => {
            const beatDurationSec = 60 / targetTempo;
            const now = audioCtx.currentTime;

            while (nextBeatTimeRef.current < endTime && nextBeatTimeRef.current < now + 0.1) {
                playClick(nextBeatTimeRef.current, audioCtx);
                schedulePulse(nextBeatTimeRef.current, audioCtx);
                nextBeatTimeRef.current += beatDurationSec;
            }

            if (now < endTime) {
                schedulerRef.current = setTimeout(scheduleBeats, 50);
            }
        };

        scheduleBeats();

        const updateProgress = () => {
            const elapsed = Date.now() - startTimeRef.current;
            const remaining = Math.max(0, LISTENING_DURATION_MS - elapsed);
            setProgress((remaining / LISTENING_DURATION_MS) * 100);

            if (elapsed < LISTENING_DURATION_MS) {
                animationFrameRef.current = requestAnimationFrame(updateProgress);
            } else {
                setTimeout(onListeningComplete, 300);
            }
        };

        animationFrameRef.current = requestAnimationFrame(updateProgress);

        return () => {
            if (schedulerRef.current) clearTimeout(schedulerRef.current);
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            pulseTimeoutRefs.current.forEach(timeoutId => clearTimeout(timeoutId));
            pulseTimeoutRefs.current = [];
        };
    }, [targetTempo, audioCtx, onListeningComplete]);

    return (
        <div className="flex-1 w-full flex flex-col">
            <div className="relative w-full flex-1 max-w-lg mx-auto text-center flex flex-col items-center px-4 pb-4 md:pb-6 min-h-0">
                <div className="flex-1 flex flex-col items-center justify-center w-full min-h-0">
                    <div 
                        className="relative mx-auto h-48 w-48 shrink-0"
                        style={{ perspective: '800px' }}
                    >
                        {pulses.map((pulseId) => (
                            <motion.div 
                                key={pulseId} 
                                className="absolute inset-0 flex items-center justify-center pointer-events-none"
                                initial={{ scale: 0.5, z: -5, opacity: 1 }}
                                animate={{ scale: 2, z: 80, opacity: [1, 0.8, 0] }}
                                transition={{ 
                                    duration: 2, 
                                    ease: "easeOut",
                                    times: [0, 0.7, 1] 
                                }}
                            >
                                <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
                                    <DynamicAudioWave baseRadius={40} color="rgba(16, 185, 129, 0.7)" volatility={4} speed={1.2} strokeWidth="0.2" />
                                    <DynamicAudioWave baseRadius={39} color="rgba(255, 255, 255, 0.5)" volatility={5.5} speed={1.8} strokeWidth="0.15" />
                                    <DynamicAudioWave baseRadius={38} color="rgba(255, 255, 255, 0.3)" volatility={7} speed={2.5} strokeWidth="0.1" />
                                </svg>
                            </motion.div>
                        ))}
                        
                        <motion.div
                            key={centerPulseKey}
                            initial={{ scale: 1, z: 0 }}
                            animate={{ scale: [1, 1.02, 1], z: [0, 30, 0] }}
                            transition={{ duration: 0.26, ease: "easeOut" }}
                            className="absolute inset-14 rounded-full border-2 border-stone-300 bg-neutral-900/50 shadow-[0_0_28px_rgba(168,162,158,0.35)] backdrop-blur-sm z-10"
                        />
                    </div>
                </div>
                <div className="w-full shrink-0 pt-4">
                    <p className="mb-4 text-xl font-semibold text-white">Lock in the beat</p>
                    <div className="relative mx-auto h-1.5 w-64 overflow-hidden rounded-full bg-white/10">
                        <div
                            className="h-full bg-gradient-to-r from-stone-300 to-stone-400 transition-none"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>

            </div>
        </div>
    );
}
