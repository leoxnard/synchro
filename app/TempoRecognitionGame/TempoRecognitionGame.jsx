'use client'

import React, { useState, useEffect, useRef } from 'react';
import ListeningPhase from './ListeningPhase';
import AdjustmentPhase from './AdjustmentPhase';
import RoundResultsPhase from './RoundResultsPhase';
import FinalResultsPhase from './FinalResultsPhase';

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
    const audioCtxRef = useRef(null);

    const generateTargetTempo = () => {
        return Math.floor(Math.random() * (MAX_TEMPO - MIN_TEMPO + 1)) + MIN_TEMPO;
    };

    const generateStartingTempo = (target) => {
        let starting = Math.floor(Math.random() * (MAX_TEMPO - MIN_TEMPO + 1)) + MIN_TEMPO;
        while (Math.abs(starting - target) < 30) {
            starting = Math.floor(Math.random() * (MAX_TEMPO - MIN_TEMPO + 1)) + MIN_TEMPO;
        }
        return Math.max(MIN_TEMPO, Math.min(MAX_TEMPO, starting));
    };

    const startRound = () => {
        const newTarget = generateTargetTempo();
        setTargetTempo(newTarget);
        setCurrentTempo(generateStartingTempo(newTarget));
        setGameState('listening');

        if (typeof window !== 'undefined') {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!audioCtxRef.current) {
                audioCtxRef.current = new AudioContext();
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
    };

    useEffect(() => {
        return () => {
            if (audioCtxRef.current) {
                audioCtxRef.current.close().catch(console.error);
            }
        };
    }, []);

    return (
        <div className="w-full max-w-2xl">
            {gameState === 'intro' && (
                <div className="w-full flex items-center justify-center">
                    <div className="text-center">
                        <h2 className="text-5xl font-bold text-emerald-400 mb-8">Tempo Recognition</h2>
                        <p className="text-neutral-400 mb-12 text-lg">
                            Listen to a steady tempo and match it by adjusting the slider.
                        </p>
                        <button
                            onClick={startRound}
                            className="px-12 py-3 bg-emerald-500 hover:bg-emerald-400 text-neutral-900 font-bold rounded-lg transition-colors"
                        >
                            Start
                        </button>
                    </div>
                </div>
            )}

            {gameState === 'listening' && (
                <ListeningPhase
                    targetTempo={targetTempo}
                    audioCtx={audioCtxRef.current}
                    onListeningComplete={() => setGameState('adjusting')}
                />
            )}

            {gameState === 'adjusting' && (
                <AdjustmentPhase
                    startTempo={currentTempo}
                    onSubmit={handleAdjustmentSubmit}
                    minTempo={MIN_TEMPO}
                    maxTempo={MAX_TEMPO}
                    audioCtx={audioCtxRef.current}
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
                    onRestart={restartGame}
                />
            )}
        </div>
    );
}
