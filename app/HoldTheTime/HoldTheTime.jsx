"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';

import SetupView from './SetupView';
import ResultView from './ResultView';
import PlayView from './PlayView';

import { SCORING_CONFIG, BEATS } from './constants/gameConfig';
import { clamp } from './utils/mathHelpers';
import { analyzeSession } from './utils/analyzeSession';
import { useIsMobile } from '../hooks/useIsMobile';

export default function HoldTheTime() {
    const [selectedBeatId, setSelectedBeatId] = useState(BEATS[0].id);
    const [triggerTaps, setTriggerTaps] = useState(8);
    const [silentBars, setSilentBars] = useState(4);
    const [gameState, setGameState] = useState('setup');
    const [phase, setPhase] = useState('listening');
    const [tapCount, setTapCount] = useState(0);
    const [sessionProgress, setSessionProgress] = useState(0);
    const [analysis, setAnalysis] = useState(null);
    const [tapRipples, setTapRipples] = useState([]);
    
    const [previewingBeatId, setPreviewingBeatId] = useState(null);
    const previewAudioRef = useRef(null);

    const selectedBeat = useMemo(() => BEATS.find((beat) => beat.id === selectedBeatId) || BEATS[0], [selectedBeatId]);
    const beatMs = 60000 / selectedBeat.bpm;

    const timerRefs = useRef([]);
    const clockRef = useRef(0);
    
    const sessionStartRef = useRef(0);
    const silenceStartRef = useRef(0);
    
    const hasTriggeredSilenceRef = useRef(false);
    
    const tapEntriesRef = useRef([]);
    const audioCtxRef = useRef(null);
    const sourceNodeRef = useRef(null);
    const gainNodeRef = useRef(null);

    const isMobile = useIsMobile();
    const [isClient, setIsClient] = useState(false);

    const stopPreview = () => {
        if (previewAudioRef.current) {
            previewAudioRef.current.pause();
            previewAudioRef.current = null;
        }
        setPreviewingBeatId(null);
    };

    const startPreview = (beatId) => {
        if (previewingBeatId === beatId) return;
        stopPreview();
        
        const beat = BEATS.find(b => b.id === beatId);
        if (!beat) return;
        
        const audio = new Audio(beat.src);
        audio.loop = false;
        audio.onended = () => {
            stopPreview();
        };
        audio.play().catch(() => {});
        previewAudioRef.current = audio;
        setPreviewingBeatId(beatId);
    };

    useEffect(() => {
        setIsClient(true);
    }, []);

    useEffect(() => {
        const handleGlobalKeyDown = (e) => {
            if (e.repeat) return;
            
            if (gameState === 'setup') {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    startSession();
                } else if (e.key === ' ') {
                    e.preventDefault();
                    startPreview(selectedBeatId);
                } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                    e.preventDefault();
                    const idx = BEATS.findIndex(b => b.id === selectedBeatId);
                    if (idx > 0) setSelectedBeatId(BEATS[idx - 1].id);
                } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                    e.preventDefault();
                    const idx = BEATS.findIndex(b => b.id === selectedBeatId);
                    if (idx < BEATS.length - 1) setSelectedBeatId(BEATS[idx + 1].id);
                }
            } else if (gameState === 'running' && !isMobile) {
                if (e.key === ' ') {
                    e.preventDefault();
                    recordTap({ isKeyboard: true }); 
                }
            } else if (gameState === 'results') {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    startSession();
                }
            }

            if (e.key === 'Escape') {
                e.preventDefault();
                clearSession(); 
                setGameState('setup');
                setPhase('listening');
            }
        }; 

        window.addEventListener('keydown', handleGlobalKeyDown);
        
        return () => {
            window.removeEventListener('keydown', handleGlobalKeyDown);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gameState, isMobile, triggerTaps, selectedBeatId]);

    useEffect(() => {
        return () => {
            timerRefs.current.forEach((timerId) => clearTimeout(timerId));
            if (clockRef.current) cancelAnimationFrame(clockRef.current);
            stopPreview();
        };
    }, []);

    const clearSession = () => {
        timerRefs.current.forEach((timerId) => clearTimeout(timerId));
        timerRefs.current = [];
        if (clockRef.current) cancelAnimationFrame(clockRef.current);
        clockRef.current = 0;
        
        if (sourceNodeRef.current) {
            try {
                sourceNodeRef.current.stop();
                sourceNodeRef.current.disconnect();
            } catch (e) {}
            sourceNodeRef.current = null;
        }
        
        if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
            audioCtxRef.current.close().catch(() => {});
        }
        audioCtxRef.current = null;

        setTapRipples([]);
        tapEntriesRef.current = [];
        setTapCount(0);
        setSessionProgress(0);
        hasTriggeredSilenceRef.current = false;
        silenceStartRef.current = 0;
    };

    const spawnRipple = (event) => {
        let x = 50;
        let y = 50;
        if (event && event.currentTarget && !event.isKeyboard) {
            const rect = event.currentTarget.getBoundingClientRect();
            if (rect.width && rect.height) {
                const point = event.clientX != null && event.clientY != null
                    ? { clientX: event.clientX, clientY: event.clientY }
                    : event.changedTouches?.[0];
                if (point) {
                    x = ((point.clientX - rect.left) / rect.width) * 100;
                    y = ((point.clientY - rect.top) / rect.height) * 100;
                }
            }
        }

        const ripple = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, x, y };
        setTapRipples((current) => [...current, ripple]);
        window.setTimeout(() => {
            setTapRipples((current) => current.filter((item) => item.id !== ripple.id));
        }, 350);
    };

    const triggerSilencePhase = () => {
        setPhase('silence');
        const nowMs = performance.now();
        silenceStartRef.current = nowMs;

        const silentMs = silentBars * beatMs * 4;
        const returnMs = SCORING_CONFIG.returnBars * beatMs * 4;

        if (gainNodeRef.current && audioCtxRef.current) {
            const ctx = audioCtxRef.current;
            const nowAudio = ctx.currentTime;
            const silentSecs = silentMs / 1000;
            
            gainNodeRef.current.gain.cancelScheduledValues(nowAudio);
            gainNodeRef.current.gain.setValueAtTime(gainNodeRef.current.gain.value, nowAudio);
            gainNodeRef.current.gain.linearRampToValueAtTime(0, nowAudio + 0.05);

            const returnAudioTime = nowAudio + silentSecs;
            gainNodeRef.current.gain.setValueAtTime(0, returnAudioTime - 0.05);
            gainNodeRef.current.gain.linearRampToValueAtTime(1, returnAudioTime);
        }

        timerRefs.current.push(window.setTimeout(() => {
            setPhase('return');
        }, silentMs));

        timerRefs.current.push(window.setTimeout(() => {
            finishSession();
        }, silentMs + returnMs));
    };

    const recordTap = (event) => {
        if (gameState !== 'running') return;
    
        const time = performance.now() - sessionStartRef.current;
        
        if (tapEntriesRef.current.length > 0) {
            const lastTime = tapEntriesRef.current[tapEntriesRef.current.length - 1].time;
            if (time - lastTime < 150) return; // Debounce
        }

        event?.preventDefault?.(); 
        tapEntriesRef.current.push({ time });
        
        const newCount = tapEntriesRef.current.length;
        setTapCount(newCount);
        spawnRipple(event);

        if (phase === 'listening' && newCount === triggerTaps && !hasTriggeredSilenceRef.current) {
            hasTriggeredSilenceRef.current = true;
            window.setTimeout(() => {
                triggerSilencePhase();
            }, beatMs);
        }
    };

    const finishSession = () => {
        const actualActiveMs = silenceStartRef.current > 0 
            ? silenceStartRef.current - sessionStartRef.current 
            : triggerTaps * beatMs;

        const result = analyzeSession({
            taps: tapEntriesRef.current,
            beatMs,
            actualActiveMs,
            silentBars,
            returnBars: SCORING_CONFIG.returnBars,
        });

        clearSession();
        setAnalysis(result);
        setGameState('results');
        setPhase('return');
    };

    const startSession = async () => {
        stopPreview();
        clearSession();
        setGameState('running');
        setPhase('listening');
        sessionStartRef.current = performance.now();

        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;

        const response = await fetch(selectedBeat.src);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

        const source = ctx.createBufferSource();
        const gainNode = ctx.createGain();
        
        source.buffer = audioBuffer;
        source.loop = true;
        
        const exactLoopLengthSec = (60 / selectedBeat.bpm) * 4 * selectedBeat.bars;
        source.loopStart = 0;
        source.loopEnd = exactLoopLengthSec; 
        
        source.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        sourceNodeRef.current = source;
        gainNodeRef.current = gainNode;

        source.start(ctx.currentTime);

        const updateClock = () => {
            setSessionProgress(performance.now());
            clockRef.current = requestAnimationFrame(updateClock);
        };
        clockRef.current = requestAnimationFrame(updateClock);
    };

    const restartToSetup = () => {
        clearSession();
        setAnalysis(null);
        setGameState('setup');
        setPhase('listening');
    };

    let progressPct = 0;
    let playLabel = '';
    let playSubLabel = '';

    if (gameState === 'running') {
        if (phase === 'listening') {
            playSubLabel = 'Listening';
            if (tapCount === 0) {
                playLabel = isMobile ? 'Tap along to start' : 'Spacebar to start';
            } else {
                playLabel = tapCount >= triggerTaps ? '0 taps until silence' : `${triggerTaps - tapCount} taps until silence`;
            }
            progressPct = clamp((tapCount / triggerTaps) * 100, 0, 100);
        } else if (phase === 'silence') {
            playSubLabel = 'Silence Phase';
            playLabel = 'Keep the pulse';
            const elapsed = sessionProgress - silenceStartRef.current;
            const silentMs = silentBars * beatMs * 4;
            progressPct = clamp((elapsed / silentMs) * 100, 0, 100);
        } else if (phase === 'return') {
            playSubLabel = 'Return Phase';
            playLabel = 'Beat returns';
            const elapsed = sessionProgress - (silenceStartRef.current + (silentBars * beatMs * 4));
            const returnMs = SCORING_CONFIG.returnBars * beatMs * 4;
            progressPct = clamp((elapsed / returnMs) * 100, 0, 100);
        }
    }

    if (!isClient) return <div className="loading-placeholder" />;

    return (
        <div className="w-full h-full px-2 py-2 md:px-4 md:py-4 flex items-center justify-center">
            <div 
                className="relative mx-auto w-full overflow-hidden rounded-[1.6rem] border border-white/10 bg-neutral-950/80 shadow-[0_20px_60px_rgba(0,0,0,0.4)] backdrop-blur transition-all duration-500 ease-in-out"
                style={{ 
                    maxWidth: gameState === 'results' ? '45rem' : '28rem' 
                }}
            >
                <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
                    <div className="tempo-orb tempo-orb-a" />
                    <div className="tempo-orb tempo-orb-b" />
                    <div className="tempo-orb tempo-orb-c" />
                    <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.04),transparent_24%,transparent_76%,rgba(255,255,255,0.03))]" />
                </div>

                <div className="relative z-10 flex min-h-[30rem] md:min-h-[32rem] flex-col p-4 md:p-6 transition-all duration-500">
                    
                    <div className="flex flex-1 min-h-0 flex-col gap-4">
                        {gameState === 'setup' && (
                            <SetupView
                                triggerTaps={triggerTaps}
                                setTriggerTaps={setTriggerTaps}
                                silentBars={silentBars}
                                setSilentBars={setSilentBars}
                                selectedBeatId={selectedBeatId}
                                setSelectedBeatId={setSelectedBeatId}
                                onStart={startSession}
                                previewingBeatId={previewingBeatId}
                                onPreviewStart={startPreview}
                                isMobile={isMobile}
                            />
                        )}

                        {gameState === 'running' && (
                            <PlayView
                                subLabel={playSubLabel}
                                label={playLabel}
                                progressPct={progressPct}
                                onTap={recordTap}
                                beatName={selectedBeat.name}
                                bpm={selectedBeat.bpm}
                                isMobile={isMobile}
                            />
                        )}

                        {gameState === 'results' && analysis && (
                            <ResultView
                                analysis={analysis}
                                selectedBeat={selectedBeat}
                                onPlayAgain={startSession}
                                onBackToSetup={restartToSetup}
                                isMobile={isMobile}
                            />
                        )}
                    </div>
                </div>
            </div>

            <style jsx>{`
                .tempo-orb {
                    position: absolute;
                    border-radius: 9999px;
                    filter: blur(62px) saturate(1.2);
                    mix-blend-mode: screen;
                    pointer-events: none;
                    opacity: 0;
                }

                .tempo-orb-a {
                    width: 16rem;
                    height: 16rem;
                    left: -3rem;
                    top: -4rem;
                    background: radial-gradient(circle, rgba(34, 211, 238, 0.42) 0%, rgba(34, 211, 238, 0.04) 72%);
                    animation: orbFloatA 9s ease-in-out infinite;
                }

                .tempo-orb-b {
                    width: 18rem;
                    height: 18rem;
                    right: -4rem;
                    bottom: -5rem;
                    background: radial-gradient(circle, rgba(16, 185, 129, 0.4) 0%, rgba(16, 185, 129, 0.04) 74%);
                    animation: orbFloatB 11s ease-in-out infinite;
                }

                .tempo-orb-c {
                    width: 13rem;
                    height: 13rem;
                    right: 28%;
                    top: 32%;
                    background: radial-gradient(circle, rgba(167, 139, 250, 0.32) 0%, rgba(167, 139, 250, 0.04) 70%);
                    animation: orbFloatC 8s ease-in-out infinite;
                }

                @keyframes orbFloatA {
                    0%, 100% { transform: translate3d(0, 0, 0) scale(0.95); opacity: 0.34; }
                    35% { transform: translate3d(4rem, 2.5rem, 0) scale(1.08); opacity: 0.6; }
                    70% { transform: translate3d(2rem, 5rem, 0) scale(1); opacity: 0.24; }
                }

                @keyframes orbFloatB {
                    0%, 100% { transform: translate3d(0, 0, 0) scale(1); opacity: 0.3; }
                    40% { transform: translate3d(-3.5rem, -2.5rem, 0) scale(1.12); opacity: 0.55; }
                    75% { transform: translate3d(-1.2rem, -5.5rem, 0) scale(0.96); opacity: 0.22; }
                }

                @keyframes orbFloatC {
                    0%, 100% { transform: translate3d(0, 0, 0) scale(0.9); opacity: 0.22; }
                    50% { transform: translate3d(1.6rem, -1.4rem, 0) scale(1.1); opacity: 0.44; }
                }
                @keyframes tapRipple {
                    0% { opacity: 0.45; transform: translate(-50%, -50%) scale(0.7); }
                    100% { opacity: 0; transform: translate(-50%, -50%) scale(1.8); }
                }
            `}</style>
        </div>
    );
}