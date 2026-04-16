import React, { useState, useEffect, useRef } from 'react';

export default function CalibrationPhase({ onComplete, onCancel }) {
    const [step, setStep] = useState('intro');
    const [progress, setProgress] = useState(0);
    const audioCtxRef = useRef(null);
    const expectedTimesRef = useRef([]);
    const deltasRef = useRef([]);
    const schedulerRef = useRef(null);
    const nextClickTimeRef = useRef(0);
    const clickIndexRef = useRef(0);
    const stepRef = useRef('intro');
    const targetClicks = 10;
    const bpm = 120;
    const intervalMs = (60 / bpm) * 1000;

    const stopCalibrationAudio = () => {
        if (schedulerRef.current) {
            window.clearInterval(schedulerRef.current);
            schedulerRef.current = null;
        }

        if (audioCtxRef.current) {
            audioCtxRef.current.close().catch(console.error);
            audioCtxRef.current = null;
        }
    };

    const scheduleNextClick = () => {
        if (!audioCtxRef.current) return;

        const clickTime = nextClickTimeRef.current;
        playClick(clickTime);

        if (clickIndexRef.current >= 2) {
            const audioToPerfOffset = performance.now() - (audioCtxRef.current.currentTime * 1000);
            expectedTimesRef.current.push((clickTime * 1000) + audioToPerfOffset);
        }

        clickIndexRef.current += 1;
        nextClickTimeRef.current += intervalMs / 1000;
    };

    const startCalibration = () => {
        stopCalibrationAudio();
        deltasRef.current = [];
        expectedTimesRef.current = [];
        setProgress(0);
        stepRef.current = 'running';
        setStep('running');

        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtxRef.current = new AudioContext();

        const now = audioCtxRef.current.currentTime;
        const leadIn = 1.0;
        nextClickTimeRef.current = now + leadIn;
        clickIndexRef.current = 0;

        for (let i = 0; i < 4; i++) {
            scheduleNextClick();
        }

        schedulerRef.current = window.setInterval(() => {
            if (!audioCtxRef.current || stepRef.current !== 'running') return;
            const nowPerf = performance.now();
            const hitWindowMs = intervalMs / 1.5;

            while (
                expectedTimesRef.current.length > 0 &&
                nowPerf - expectedTimesRef.current[0] > hitWindowMs
            ) {
                expectedTimesRef.current.shift();
            }

            while (nextClickTimeRef.current < audioCtxRef.current.currentTime + 0.2) {
                scheduleNextClick();
            }
        }, 50);
    };

    const playClick = (time) => {
        if (!audioCtxRef.current) return;
        const osc = audioCtxRef.current.createOscillator();
        const gain = audioCtxRef.current.createGain();
        osc.connect(gain);
        gain.connect(audioCtxRef.current.destination);
        osc.frequency.value = 1000;
        gain.gain.setValueAtTime(0.5, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
        osc.start(time);
        osc.stop(time + 0.1);
    };

    useEffect(() => {
        stepRef.current = step;
    }, [step]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (step === 'intro') {
                if (e.key === ' ') {
                    e.preventDefault();
                    startCalibration();
                    return;
                }
                if (e.key === 'Escape') {
                    e.preventDefault();
                    handleCancel();
                    return;
                }
            }

            if (e.repeat) return;
            if (e.key !== ' ' || step !== 'running') return;
            e.preventDefault();

            const tapTime = performance.now();
            const hitWindowMs = intervalMs / 1.5;

            while (
                expectedTimesRef.current.length > 0 &&
                tapTime - expectedTimesRef.current[0] > hitWindowMs
            ) {
                expectedTimesRef.current.shift();
            }

            if (expectedTimesRef.current.length === 0) return;

            const expected = expectedTimesRef.current[0];
            const delta = tapTime - expected;

            if (Math.abs(delta) < hitWindowMs) {
                expectedTimesRef.current.shift();
                deltasRef.current.push(delta);
                setProgress(deltasRef.current.length);

                if (deltasRef.current.length >= targetClicks) {
                    finishCalibration();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [step]);

    const finishCalibration = () => {
        stepRef.current = 'done';
        setStep('done');
        stopCalibrationAudio();
        
        const sorted = [...deltasRef.current].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const medianOffset = sorted.length % 2 === 0 
            ? (sorted[mid - 1] + sorted[mid]) / 2 
            : sorted[mid];

        setTimeout(() => {
            onComplete(medianOffset);
        }, 1000);
    };

    useEffect(() => {
        return () => {
            stopCalibrationAudio();
        };
    }, []);

    const handleCancel = () => {
        stepRef.current = 'intro';
        stopCalibrationAudio();
        onCancel();
    };

    return (
        <div className="w-full max-w-md bg-neutral-800 p-8 rounded-2xl shadow-2xl border border-neutral-700 text-center">
            <h2 className="text-xl mb-4 font-semibold text-emerald-400">Audio Calibration</h2>
            
            {step === 'intro' && (
                <>
                    <p className="text-neutral-300 mb-6">
                        To ensure your inputs are scored accurately, we'll quickly measure your system's audio latency.
                    </p>
                    <p className="text-sm text-neutral-400 mb-8">
                        You'll hear a steady beat. Tap the <strong>SPACEBAR</strong> precisely on each downbeat.
                    </p>
                    <div className="flex gap-4 justify-center">
                        <button onClick={handleCancel} className="px-4 py-2 rounded text-neutral-400 hover:text-white transition-colors">Cancel</button>
                        <button onClick={startCalibration} className="px-6 py-2 bg-emerald-500 text-neutral-900 font-bold rounded hover:bg-emerald-400 transition-colors">Start</button>
                    </div>
                </>
            )}

            {step === 'running' && (
                <div className="py-8">
                    <p className="text-2xl font-bold mb-4 animate-pulse">Tap the spacebar!</p>
                    <div className="w-full bg-neutral-900 h-4 rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-emerald-400 transition-all duration-200" 
                            style={{ width: `${(progress / targetClicks) * 100}%` }}
                        />
                    </div>
                    <p className="text-neutral-400 mt-4">{progress} / {targetClicks} Beats</p>
                </div>
            )}

            {step === 'done' && (
                <div className="py-8">
                    <p className="text-2xl font-bold text-emerald-400 mb-2">Perfect!</p>
                    <p className="text-neutral-400">Calibration saved.</p>
                </div>
            )}
        </div>
    );
}