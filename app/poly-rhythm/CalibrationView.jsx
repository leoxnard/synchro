import React, { useState, useEffect, useRef, useCallback } from 'react';

export default function CalibrationView({ onComplete, onCancel }) {
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

    const stopCalibrationAudio = useCallback(() => {
        if (schedulerRef.current) {
            window.clearInterval(schedulerRef.current);
            schedulerRef.current = null;
        }

        if (audioCtxRef.current) {
            audioCtxRef.current.close().catch(console.error);
            audioCtxRef.current = null;
        }
    }, []);

    const playClick = useCallback((time) => {
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
    }, []);

    const scheduleNextClick = useCallback(() => {
        if (!audioCtxRef.current) return;

        const clickTime = nextClickTimeRef.current;
        playClick(clickTime);

        if (clickIndexRef.current >= 2) {
            expectedTimesRef.current.push(clickTime * 1000);
        }

        clickIndexRef.current += 1;
        nextClickTimeRef.current += intervalMs / 1000;
    }, [intervalMs, playClick]);

    const finishCalibration = useCallback(() => {
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
    }, [onComplete, stopCalibrationAudio]);

    const handleCancel = useCallback(() => {
        stepRef.current = 'intro';
        stopCalibrationAudio();
        onCancel();
    }, [onCancel, stopCalibrationAudio]);

    const startCalibration = useCallback(async () => {
        stopCalibrationAudio();
        deltasRef.current = [];
        expectedTimesRef.current = [];
        setProgress(0);
        stepRef.current = 'running';
        setStep('running');

        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtxRef.current = new AudioContext();
        const unmute = (await import('iosunmute')).default;
        unmute(audioCtxRef.current);
        if (audioCtxRef.current.state !== 'running') {
            audioCtxRef.current.resume().catch(() => {});
        }

        const now = audioCtxRef.current.currentTime;
        const leadIn = 1.0;
        nextClickTimeRef.current = now + leadIn;
        clickIndexRef.current = 0;

        for (let i = 0; i < 4; i++) {
            scheduleNextClick();
        }

        schedulerRef.current = window.setInterval(() => {
            if (!audioCtxRef.current || stepRef.current !== 'running') return;
            const nowAudioMs = audioCtxRef.current.currentTime * 1000;
            const hitWindowMs = intervalMs / 1.5;

            while (
                expectedTimesRef.current.length > 0 &&
                nowAudioMs - expectedTimesRef.current[0] > hitWindowMs
            ) {
                expectedTimesRef.current.shift();
            }

            while (nextClickTimeRef.current < audioCtxRef.current.currentTime + 0.2) {
                scheduleNextClick();
            }
        }, 50);
    }, [intervalMs, scheduleNextClick, stopCalibrationAudio]);

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

            if (!audioCtxRef.current) return;

            const tapTime = audioCtxRef.current.currentTime * 1000;
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
    }, [finishCalibration, handleCancel, intervalMs, startCalibration, step]);

    useEffect(() => {
        return () => {
            stopCalibrationAudio();
        };
    }, [stopCalibrationAudio]);

    return (
        <div className="w-full max-w-md p-2 text-center flex flex-col">
            <h2 className="text-lg mb-3 font-semibold text-stone-300 tracking-wide">Audio Calibration</h2>
            
            {step === 'intro' && (
                <>
                    <p className="text-neutral-300 mb-5 text-sm">
                        To ensure your inputs are scored accurately, we&apos;ll quickly measure your system&apos;s audio latency.
                    </p>
                    <p className="text-xs text-neutral-400 mb-7 tracking-wide">
                        You&apos;ll hear a steady beat. Tap the <strong>SPACEBAR</strong> precisely on each downbeat.
                    </p>
                    <div className="flex gap-4 justify-center">
                        <button onClick={handleCancel} className="px-4 py-2 rounded text-neutral-400 hover:text-white transition-colors text-sm">Cancel</button>
                        <button onClick={startCalibration} className="px-6 py-2 bg-stone-400 text-neutral-900 text-xs font-bold uppercase tracking-[0.14em] rounded-full hover:bg-stone-300 transition-colors">Start</button>
                    </div>
                </>
            )}

            {step === 'running' && (
                <div className="py-7">
                    <p className="text-xl font-bold mb-4 animate-pulse text-white">Tap the spacebar!</p>
                    <div className="w-full bg-white/10 h-3 rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-stone-300 transition-all duration-200" 
                            style={{ width: `${(progress / targetClicks) * 100}%` }}
                        />
                    </div>
                    <p className="text-neutral-400 mt-3 text-sm">{progress} / {targetClicks} Beats</p>
                </div>
            )}

            {step === 'done' && (
                <div className="py-7">
                    <p className="text-2xl font-bold text-stone-300 mb-2">Perfect!</p>
                    <p className="text-neutral-400 text-sm">Calibration saved.</p>
                </div>
            )}
        </div>
    );
}