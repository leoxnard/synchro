// app/hold-the-time/HoldTheTime.jsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';

import SetupView from './SetupView';
import ResultView from './ResultView';
import PlayView from './PlayView';
import GameContainer from '../components/GameContainer';

import { SCORING_CONFIG, BEATS } from './constants/gameConfig';
import { clamp } from './utils/mathHelpers';
import { analyzeSession } from './utils/analyzeSession';
import { useIsMobile } from '../hooks/useIsMobile';

export default function HoldTheTime() {
    const [selectedBeatId, setSelectedBeatId] = useState(BEATS[0].id);
    const [silentBars, setSilentBars] = useState(4);
    const [gameState, setGameState] = useState('setup');
    const [showAnalysis, setShowAnalysis] = useState(false);
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
    
    const triggerTaps = 8;
    
    function stopPreview() {
        if (previewAudioRef.current) {
            previewAudioRef.current.pause();
            previewAudioRef.current = null;
        }
        setPreviewingBeatId(null);
    };

    function startPreview(beatId) {
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
        // eslint-disable-next-line react-hooks/set-state-in-effect
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
                if (e.key === 'Enter') {
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
            clearSession();
        };
    }, []);

    function clearSession() {
        timerRefs.current.forEach((timerId) => clearTimeout(timerId));
        timerRefs.current = [];
        if (clockRef.current) cancelAnimationFrame(clockRef.current);
        clockRef.current = 0;
        
        if (sourceNodeRef.current) {
            try {
                sourceNodeRef.current.stop();
                sourceNodeRef.current.disconnect();
            } catch {}
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

    function spawnRipple(event) {
        if (event && event.isKeyboard) return;

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

    function triggerSilencePhase() {
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

    function recordTap(event) {
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

    function finishSession() {
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

    async function startSession() {
        stopPreview();
        clearSession();
        setShowAnalysis(false);
        setGameState('running');
        setPhase('listening');
        sessionStartRef.current = performance.now();

        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContext();
        const unmute = (await import('iosunmute')).default;
        unmute(ctx);
        audioCtxRef.current = ctx;
        if (ctx.state !== 'running') {
            ctx.resume().catch(() => {});
        }

        const response = await fetch(selectedBeat.src);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

        const source = ctx.createBufferSource();
        const gainNode = ctx.createGain();
        
        source.buffer = audioBuffer;
        source.loop = true;
        
        const exactLoopLengthSec = (60 / selectedBeat.bpm) * 4 * 2;
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

    function restartToSetup() {
        clearSession();
        setAnalysis(null);
        setShowAnalysis(false);
        setGameState('setup');
        setPhase('listening');
    };

    let progressPct = 0;
    let playLabel = '';
    let playSubLabel = '';

    if (gameState === 'running') {
        if (phase === 'listening') {
            playSubLabel = 'Listening';
            playLabel = isMobile ? 'Tap with the beat' : 'Press Spacebar with the beat';
            progressPct = clamp((tapCount / triggerTaps) * 100, 0, 100);
        } else if (phase === 'silence') {
            playSubLabel = 'Silence Phase';
            playLabel = 'Keep the pulse';
             
            const elapsed = sessionProgress - silenceStartRef.current;
            const silentMs = silentBars * beatMs * 4;
            
            progressPct = clamp(100 - ((elapsed / silentMs) * 100), 0, 100);
            
        } else if (phase === 'return') {
            playSubLabel = 'Return Phase';
            playLabel = 'Beat returns';
             
            const elapsed = sessionProgress - (silenceStartRef.current + (silentBars * beatMs * 4));
            const returnMs = SCORING_CONFIG.returnBars * beatMs * 4;
            progressPct = clamp((elapsed / returnMs) * 100, 0, 100);
        }
    }

    if (!isClient) return <div className="loading-placeholder" />;

    const desktopWidth = gameState === 'results' ? '55rem' : '30rem';
    
    let desktopHeight = '32rem';
    let mobileHeight = '100%'; // optional 'auto'
    
    if (gameState === 'setup') {
        desktopHeight = '40rem';
        mobileHeight = '100%';
    }
    if (gameState === 'running') {
        desktopHeight = '34rem';
        mobileHeight = '100%';
    }
    if (gameState === 'results') {
        desktopHeight = 'auto';
        mobileHeight = '100%';
    }

    return (
        <div className="flex flex-col w-full flex-1 px-2 md:px-4 md:py-4 min-h-0 justify-center items-center">
            <GameContainer desktopWidth={desktopWidth} desktopHeight={desktopHeight} mobileHeight={mobileHeight}>
                <div className="flex flex-1 flex-col p-4 md:p-8 w-full h-full min-h-0">
                    {gameState === 'setup' && (
                        <SetupView
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
                            setTapRipples={setTapRipples}
                            phase={phase}
                        />
                    )}

                    {gameState === 'results' && analysis && (
                        <ResultView
                            analysis={analysis}
                            selectedBeat={selectedBeat}
                            onPlayAgain={startSession}
                            onBackToSetup={restartToSetup}
                            isMobile={isMobile}
                            showAnalysis={showAnalysis}
                            onToggleAnalysis={() => setShowAnalysis(!showAnalysis)}
                        />
                    )}
                </div>

                {/* Tap Ripples */}
                {gameState === 'running' && tapRipples.map((ripple) => (
                    <div
                        key={ripple.id}
                        className="pointer-events-none absolute z-20 h-24 w-24 rounded-full"
                        style={{
                            left: `${ripple.x}%`, top: `${ripple.y}%`,
                            transform: 'translate(-50%, -50%)',
                            background: 'radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(125,211,252,0.7) 24%, rgba(34,211,238,0.22) 48%, transparent 72%)',
                            filter: 'drop-shadow(0 0 12px rgba(125,211,252,0.55))',
                            animation: 'tapRipple 0.35s ease-out forwards',
                        }}
                    />
                ))}
                <style jsx>{`
                    .tap-ripple-effect {
                        position: absolute; z-index: 20; height: 6rem; width: 6rem;
                        border-radius: 9999px; pointer-events: none;
                        transform: translate(-50%, -50%);
                        background: radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(125,211,252,0.7) 24%, rgba(34,211,238,0.22) 48%, transparent 72%);
                        filter: drop-shadow(0 0 12px rgba(125,211,252,0.55));
                        animation: tapRipple 0.35s ease-out forwards;
                    }
                    @keyframes tapRipple {
                        0% { opacity: 0.45; transform: translate(-50%, -50%) scale(0.7); }
                        100% { opacity: 0; transform: translate(-50%, -50%) scale(1.8); }
                    }
                `}</style>
            </GameContainer>
        </div>
    );
}