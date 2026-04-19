'use client'

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ListeningPhase from './ListeningPhase';
import AdjustmentPhase from './AdjustmentPhase';
import RoundResultsPhase from './RoundResultsPhase';
import FinalResultsPhase from './FinalResultsPhase';
import { getHighscore, saveHighscore } from '../lib/highscoreStorage';

const MIN_TEMPO = 40;
const MAX_TEMPO = 240;
const TOTAL_ROUNDS = 5;

export default function TempoRecognitionGame() {
    const [gameState, setGameState] = useState('intro'); // intro, listening, adjusting, round-results, final-results
    const [round, setRound] = useState(1);
    const [targetTempo, setTargetTempo] = useState(0);
    const [currentTempo, setCurrentTempo] = useState(0);
    const [lastGuessTempo, setLastGuessTempo] = useState(0);
    const [scores, setScores] = useState([]);
    const [audioCtx, setAudioCtx] = useState(null);
    const [highscore] = useState(() => getHighscore('tempo-recognition'));

    // Derived state: check if this session is a new highscore
    const currentSessionTotal = scores.length === TOTAL_ROUNDS ? scores.reduce((sum, score) => sum + score, 0) : 0;
    const isNewHighscoreFlag = gameState === 'final-results' && currentSessionTotal > highscore;


    const generateTargetTempo = (previousTempo) => {
        let newTarget = Math.floor(Math.random() * (MAX_TEMPO - MIN_TEMPO + 1)) + MIN_TEMPO;
        
        if (previousTempo && previousTempo > 0) {
            while (Math.abs(newTarget - previousTempo) < 20) {
                newTarget = Math.floor(Math.random() * (MAX_TEMPO - MIN_TEMPO + 1)) + MIN_TEMPO;
            }
        }
        
        return newTarget;
    };

    const generateStartingTempo = (target) => {
        let starting = Math.floor(Math.random() * (MAX_TEMPO - MIN_TEMPO + 1)) + MIN_TEMPO;
        while (Math.abs(starting - target) < 30) {
            starting = Math.floor(Math.random() * (MAX_TEMPO - MIN_TEMPO + 1)) + MIN_TEMPO;
        }
        return Math.max(MIN_TEMPO, Math.min(MAX_TEMPO, starting));
    };

    const startRound = () => {
        const newTarget = generateTargetTempo(targetTempo);
        setTargetTempo(newTarget);
        setCurrentTempo(generateStartingTempo(newTarget));
        setGameState('listening');

        if (typeof window !== 'undefined') {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!audioCtx) {
                const ctx = new AudioContext();
                setAudioCtx(ctx);
                if (ctx.state !== 'running') {
                    ctx.resume().catch(() => {});
                }
            } else if (audioCtx.state !== 'running') {
                audioCtx.resume().catch(() => {});
            }
        }
    };

    const handleAdjustmentSubmit = (finalTempo) => {
        const accuracy = Math.max(0, 100 - Math.abs(finalTempo - targetTempo));
        setLastGuessTempo(finalTempo);
        setScores([...scores, accuracy]);
        setGameState('round-results');
    };

    const proceedToNextRound = () => {
        if (round < TOTAL_ROUNDS) {
            setRound(round + 1);
            startRound();
        } else {
            setGameState('final-results');
        }
    };

    const restartGame = () => {
        setGameState('intro');
        setRound(1);
        setScores([]);
        setTargetTempo(0);
        setCurrentTempo(0);
        setLastGuessTempo(0);
    };

    useEffect(() => {
        if (gameState === 'final-results' && scores.length === TOTAL_ROUNDS) {
            const totalScore = scores.reduce((sum, score) => sum + score, 0);
            saveHighscore('tempo-recognition', totalScore);
        }
    }, [gameState, scores]);

    useEffect(() => {
        return () => {
            if (audioCtx) {
                audioCtx.close().catch(console.error);
            }
        };
    }, [audioCtx]);

    return (
        <div className="w-full px-4 py-4">
            <div className="tempo-window isolate relative mx-auto h-[34rem] w-full max-w-md overflow-hidden rounded-[1.7rem] border border-white/10 bg-neutral-900/80 shadow-[0_28px_80px_rgba(0,0,0,0.5)] backdrop-blur">
                <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
                    <div className="tempo-orb tempo-orb-a" />
                    <div className="tempo-orb tempo-orb-b" />
                    <div className="tempo-orb tempo-orb-c" />
                    <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.04),transparent_24%,transparent_76%,rgba(255,255,255,0.03))]" />
                </div>


                <div className="relative z-10 h-full p-5 md:p-7 rounded-[1.7rem] items-center justify-center flex flex-col">
                    {(gameState === 'listening' || gameState === 'adjusting') && (
                        <div 
                            className="mb-3 h-5 flex items-center justify-center relative w-full"
                            style={{ perspective: '400px' }}
                        >
                            <AnimatePresence>
                                <motion.p
                                    key={gameState}
                                    initial={{ rotateX: -90, y: 15, opacity: 0 }}
                                    animate={{ rotateX: 0, y: 0, opacity: 1 }}
                                    exit={{ rotateX: 90, y: -15, opacity: 0 }}
                                    transition={{ duration: 0.5, ease: "easeInOut" }}
                                    style={{ transformOrigin: 'center center -10px' }}
                                    className="absolute text-[11px] uppercase tracking-[0.28em] text-neutral-500 m-0"
                                >
                                    {gameState === 'adjusting' ? 'Adjustment Phase' : 'Listening Phase'}
                                </motion.p>
                            </AnimatePresence>
                        </div>
                    )}
                    {gameState === 'intro' && (
                        <div className="h-full w-full flex flex-col items-center justify-center text-center gap-4">
                            <h2 className="mb-5 text-4xl font-black text-white md:text-5xl">Tempo Recognition</h2>
                            <button
                                onClick={startRound}
                                className="rounded-full bg-stone-200 px-8 py-2.5 text-xs font-bold uppercase tracking-[0.18em] text-neutral-900 transition-transform hover:scale-[1.03] active:scale-95"
                            >
                                Start Session
                            </button>
                        </div>
                    )}

                    {gameState === 'listening' && (
                        <ListeningPhase
                            targetTempo={targetTempo}
                            audioCtx={audioCtx}
                            onListeningComplete={() => setGameState('adjusting')}
                        />
                    )}

                    {gameState === 'adjusting' && (
                        <AdjustmentPhase
                            startTempo={currentTempo}
                            onSubmit={handleAdjustmentSubmit}
                            minTempo={MIN_TEMPO}
                            maxTempo={MAX_TEMPO}
                            audioCtx={audioCtx}
                        />
                    )}

                    {gameState === 'round-results' && (
                        <RoundResultsPhase
                            round={round}
                            totalRounds={TOTAL_ROUNDS}
                            targetTempo={targetTempo}
                            guessTempo={lastGuessTempo}
                            score={scores[scores.length - 1]}
                            onContinue={proceedToNextRound}
                        />
                    )}

                    {gameState === 'final-results' && (
                        <FinalResultsPhase
                            scores={scores}
                            highscore={highscore}
                            isNewHighscore={isNewHighscoreFlag}
                            onRestart={restartGame}
                        />
                    )}
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

                @keyframes phaseChange {
                    0% { 
                        opacity: 0; 
                        transform: translateY(8px); 
                        filter: blur(4px);
                    }
                    100% { 
                        opacity: 1; 
                        transform: translateY(0); 
                        filter: blur(0);
                    }
                }

                .animate-phase-change {
                    animation: phaseChange 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }
            `}</style>
        </div>
    );
}
