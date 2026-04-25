'use client'

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ListeningView from './ListeningView';
import AdjustmentView from './AdjustmentView';
import RoundResultsView from './RoundResultsView';
import FinalResultsView from './FinalResultsView';
import GameContainer from '../components/GameContainer';
import { useIsMobile } from '../hooks/useIsMobile';
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

    const isMobile = useIsMobile();
    const [isClient, setIsClient] = useState(false);
    const isMobileLayoutEnabled = isClient && isMobile;

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

    const startRound = async () => {
        const newTarget = generateTargetTempo(targetTempo);
        setTargetTempo(newTarget);
        setCurrentTempo(generateStartingTempo(newTarget));
        setGameState('listening');

        if (typeof window !== 'undefined') {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!audioCtx) {
                const ctx = new AudioContext();
                setAudioCtx(ctx);
                const unmute = (await import('iosunmute')).default;
                unmute(ctx);
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

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsClient(true);
    }, []);

    if (!isClient) return <div className="loading-placeholder" />;

    return (
        <div className="flex flex-col w-full flex-1 px-2 md:px-4 md:py-4 min-h-0 justify-center items-center">
            <GameContainer desktopWidth="30rem" desktopHeight="40rem">
                <div className="relative z-10 w-full flex-1 p-5 md:p-7 flex flex-col">
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
                        <div className="w-full flex flex-1 flex-col items-center justify-center text-center gap-4">
                            {!isMobileLayoutEnabled && (
                                <h2 className="mb-5 text-4xl font-light tracking-widest text-white md:text-5xl">Tempo Recognition</h2>
                            )}
                            <button
                                onClick={startRound}
                                className="rounded-full bg-stone-200 px-8 py-2.5 text-xs font-bold uppercase tracking-[0.18em] text-neutral-900 transition-transform hover:scale-[1.03] active:scale-95"
                            >
                                Start Game
                            </button>
                        </div>
                    )}

                    {gameState === 'listening' && (
                        <ListeningView
                            targetTempo={targetTempo}
                            audioCtx={audioCtx}
                            onListeningComplete={() => setGameState('adjusting')}
                        />
                    )}

                    {gameState === 'adjusting' && (
                        <AdjustmentView
                            startTempo={currentTempo}
                            onSubmit={handleAdjustmentSubmit}
                            minTempo={MIN_TEMPO}
                            maxTempo={MAX_TEMPO}
                            audioCtx={audioCtx}
                        />
                    )}

                    {gameState === 'round-results' && (
                        <RoundResultsView
                            round={round}
                            totalRounds={TOTAL_ROUNDS}
                            targetTempo={targetTempo}
                            guessTempo={lastGuessTempo}
                            score={scores[scores.length - 1]}
                            onContinue={proceedToNextRound}
                        />
                    )}

                    {gameState === 'final-results' && (
                        <FinalResultsView
                            scores={scores}
                            highscore={highscore}
                            isNewHighscore={isNewHighscoreFlag}
                            onRestart={restartGame}
                        />
                    )}
                </div>
            </GameContainer>
            
        </div>
    );
}
