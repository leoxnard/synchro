'use client'

import React, { useState, useEffect, useRef } from 'react';
import SetupPhase from './SetupPhase';
import PlayingPhase from './PlayingPhase';
import ResultPhase from './ResultPhase';

export default function PolyrhythmGame() {
    const [gameState, setGameState] = useState('setup'); 
    const [count, setCount] = useState(4); 
    const [bpm, setBpm] = useState(60);
    const [measures, setMeasures] = useState(4);
    const [baseTrackId, setBaseTrackId] = useState(2); 
    const [tracks, setTracks] = useState([
        { id: 1, pulses: 4, key: 'shift' },
        { id: 2, pulses: 3, key: ' ' }
    ]);
    const [score, setScore] = useState(0);
    const [activeKeys, setActiveKeys] = useState({});
    const [expectedTaps, setExpectedTaps] = useState([]);
    const [detailedResults, setDetailedResults] = useState([]);

    const measureDuration = (60 / bpm) * 4 * 1000;

  
    const getAssignedKey = (index, total) => {
        const configs = {
            1: [' '],
            2: ['shift', ' '],
            3: ['shift', 'w', ' '],
            4: ['shift', 'w', 'd', ' '],
            5: ['shift', 'a', 'w', 'd', ' ']
        };
        const config = configs[Math.min(total, 5)] || configs[5];
        return config[index] || '';
    };

  
    const startTimeRef = useRef(0);
    const actualTapsRef = useRef([]);
    const expectedTapsRef = useRef([]);
    const audioCtxRef = useRef(null);
    const detailedResultsRef = useRef([]); 
    const timeoutsRef = useRef([]); 

  
    const addTrack = () => {
        if (tracks.length >= 5) return; 
    
        const newTotal = tracks.length + 1;
        const defaultKeys = getAssignedKey(0, newTotal) !== '' ? Array.from({length: newTotal}).map((_,i) => getAssignedKey(i, newTotal)) : ['a', 'shift', 'w', ' ', 'd'];
    
    
        const newTracks = [...tracks, { id: Date.now(), pulses: 4 }].map((t, index) => ({
            ...t,
            key: defaultKeys[index] || t.key
        }));

        setTracks(newTracks);
    };

    const updateTrack = (id, field, value) => {
        setTracks(tracks.map(t => t.id === id ? { ...t, [field]: value } : t));
    };

    const removeTrack = (id) => {
        if (tracks.length > 2) {
            const remainingTracks = tracks.filter(t => t.id !== id);
            const newTotal = remainingTracks.length;
            const defaultKeys = Array.from({length: newTotal}).map((_,i) => getAssignedKey(i, newTotal));
      
            const newTracks = remainingTracks.map((t, index) => ({
                ...t,
                key: defaultKeys[index] || t.key
            }));

            setTracks(newTracks);
        }
    };

  
  
  
    const getAudioContextOffset = () => {
        if (!audioCtxRef.current) return 0;
    
    
    
        return performance.now() - (audioCtxRef.current.currentTime * 1000);
    };

    const playMetronomeClick = (time, freq = 800) => {
        if (!audioCtxRef.current) return;
        const osc = audioCtxRef.current.createOscillator();
        const gain = audioCtxRef.current.createGain();
        osc.connect(gain);
        gain.connect(audioCtxRef.current.destination);
        osc.frequency.value = freq; 
        gain.gain.setValueAtTime(0.5, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
        osc.start(time);
        osc.stop(time + 0.1);
    };

    const calculateExpectedTaps = () => {
        let taps = [];
        tracks.forEach((track) => {
            const assignedKey = track.key || '';
            for (let m = 0; m < measures; m++) {
                for (let p = 0; p < track.pulses; p++) {
                    taps.push({
                        trackId: track.id,
                        key: assignedKey,
                        time: m * measureDuration + (p / track.pulses) * measureDuration,
                        measureIndex: m,
                        baseTime: (p / track.pulses) * measureDuration
                    });
                }
            }
      
      
            taps.push({
                trackId: track.id,
                key: assignedKey,
                time: measures * measureDuration,
                measureIndex: measures,
                baseTime: 0
            });
        });
        return taps;
    };

  
    const startGame = () => {
        if (tracks.some(t => t.pulses <= 0)) {
            alert("Please fill out all fields correctly!");
            return;
        }

    
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    
    
        timeoutsRef.current.forEach(clearTimeout);
        timeoutsRef.current = [];

        const nextExpectedTaps = calculateExpectedTaps();
        expectedTapsRef.current = nextExpectedTaps;
        setExpectedTaps(nextExpectedTaps);
        actualTapsRef.current = [];
    
    
        const activeBaseTrackId = tracks.some(t => t.id === baseTrackId) ? baseTrackId : tracks[0].id;
        const baseTrack = tracks.find(t => t.id === activeBaseTrackId);
        const basePulses = baseTrack.pulses;
    
        setGameState('countIn');
        setCount(basePulses); 
    
    
        const startOffset = 0.1;
        const now = audioCtxRef.current.currentTime + startOffset;
        const measureDurationSecs = measureDuration / 1000;
    
    
    
    
        const audioToPerfOffset = getAudioContextOffset();
    
    
    
        startTimeRef.current = ((now + measureDurationSecs) * 1000) + audioToPerfOffset;
    
    
        tracks.forEach((track, index) => {
      
            const trackFreq = index === 0 ? 1000 : (index === 1 ? 600 : 400); 
            for (let p = 0; p < track.pulses; p++) {
                const time = now + (p / track.pulses) * measureDurationSecs;
        
                const isBeatOne = (p === 0);
                playMetronomeClick(time, isBeatOne ? Math.max(trackFreq, 1200) : trackFreq);
            }
        });

    
        for (let b = 0; b < basePulses; b++) {
            timeoutsRef.current.push(setTimeout(() => {
                setCount(basePulses - b);
            }, (startOffset * 1000) + b * (measureDuration / basePulses)));
        }

    
        timeoutsRef.current.push(setTimeout(() => {
            setGameState('playing');
        }, (startOffset * 1000) + measureDuration));
    
    
        const baseFreq = tracks.indexOf(baseTrack) === 0 ? 1000 : 600;
        for (let m = 0; m < measures; m++) {
            for (let p = 0; p < basePulses; p++) {
        
                const isMeasureStart = (p === 0);
                const time = now + measureDurationSecs + m * measureDurationSecs + (p / basePulses) * measureDurationSecs;
                playMetronomeClick(time, isMeasureStart ? baseFreq + 200 : baseFreq);
            }
        }
    
    
        playMetronomeClick(now + measureDurationSecs + measures * measureDurationSecs, 1200);

    
        timeoutsRef.current.push(setTimeout(() => {
            endGame();
        }, (startOffset * 1000) + measureDuration + (measureDuration * measures) + 500));
    };

    const abortGame = () => {
        timeoutsRef.current.forEach(clearTimeout);
        timeoutsRef.current = [];
        if (audioCtxRef.current) {
      
            audioCtxRef.current.close().catch(console.error);
            audioCtxRef.current = null;
        }
        setGameState('setup');
    };

    const endGame = () => {
        setGameState('result');
        calculateScore();
    };

    const calculateScore = () => {
        let totalDeviation = 0; 
        let maxAllowedDeviation = 0; 
        const expected = expectedTapsRef.current;
        const availableActualTaps = [...actualTapsRef.current];
        const nextDetailedResults = [];

        expected.forEach(exp => {
      
            const track = tracks.find(t => t.id === exp.trackId);
      
            const maxErrorForBeat = (measureDuration / track.pulses) / 2;
            maxAllowedDeviation += maxErrorForBeat;

      
            const matchingTaps = availableActualTaps.filter(act => act.key === exp.key);
      
            if (matchingTaps.length === 0) {
        
                totalDeviation += maxErrorForBeat;
                nextDetailedResults.push({ ...exp, actualTime: null, diff: null });
                return; 
            }

      
            let closestTap = matchingTaps.reduce((prev, curr) => 
                Math.abs(curr.time - exp.time) < Math.abs(prev.time - exp.time) ? curr : prev
            );

            const diff = closestTap.time - exp.time;
            const absDiff = Math.abs(diff);
      
            if (absDiff <= maxErrorForBeat) {
        
                totalDeviation += absDiff;
        
                nextDetailedResults.push({
                    ...exp,
                    actualTime: closestTap.time,
                    diff
                });

        
                const usedIndex = availableActualTaps.findIndex(act => act === closestTap);
                if (usedIndex > -1) {
                    availableActualTaps.splice(usedIndex, 1);
                }
            } else {
        
                totalDeviation += maxErrorForBeat;
                nextDetailedResults.push({ ...exp, actualTime: null, diff: null });
            }
        });

    
        const extraTaps = availableActualTaps.filter(act => tracks.some(t => t.key === act.key));
    
        const avgMaxError = expected.length > 0 ? (maxAllowedDeviation / expected.length) : 200;
        totalDeviation += extraTaps.length * (avgMaxError / 2);

        extraTaps.forEach(act => {
            const track = tracks.find(t => t.key === act.key);
            if (track) {
                const measureIndex = Math.floor(act.time / measureDuration);
                const baseTime = act.time % measureDuration;
                nextDetailedResults.push({
                    trackId: track.id,
                    key: act.key,
                    baseTime: baseTime,
                    diff: 0,
                    actualTime: act.time,
                    measureIndex: measureIndex,
                    isExtra: true
                });
            }
        });

        detailedResultsRef.current = nextDetailedResults;
        setDetailedResults(nextDetailedResults);

        const finalPercentage = maxAllowedDeviation > 0 
            ? 100 - ((totalDeviation / maxAllowedDeviation) * 100) 
            : 0;
    
        setScore(Math.max(0, Math.round(finalPercentage)));
    };

  
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.repeat) return;

            if (e.key === 'Enter' || (e.key === ' ' && (gameState === 'setup' || gameState === 'result'))) {
                e.preventDefault();
                if (gameState === 'setup') {
                    startGame();
                } else if (gameState === 'result') {
                    setGameState('setup');
                }
                return;
            }
      
            if (e.key === 'Escape' && (gameState === 'playing' || gameState === 'countIn')) {
                e.preventDefault();
                abortGame();
                return;
            }

            if (gameState !== 'playing' && gameState !== 'countIn') return;

            const key = e.key.toLowerCase();
      
            if (key === ' ') e.preventDefault();
      
            const validKeys = tracks.map(t => t.key || '');
      
            if (validKeys.includes(key)) {
                const pressTime = performance.now() - startTimeRef.current;
                actualTapsRef.current.push({ key, time: pressTime });
        
                setActiveKeys(prev => ({ ...prev, [key]: true }));
                setTimeout(() => setActiveKeys(prev => ({ ...prev, [key]: false })), 100);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    });

  
    return (
        <div className="min-h-screen bg-neutral-900 text-neutral-100 flex flex-col items-center justify-center p-8 font-sans">
      
            {/* HEADER */}
            <div className="mb-12 text-center">
                <h1 className="text-4xl font-light tracking-widest text-white mb-2">POLY<span className="font-bold text-emerald-400">RHYTHM</span></h1>
            </div>

            {/* SETUP PHASE */}
            {gameState === 'setup' && (
                <SetupPhase
                    tracks={tracks}
                    baseTrackId={baseTrackId}
                    setBaseTrackId={setBaseTrackId}
                    addTrack={addTrack}
                    updateTrack={updateTrack}
                    removeTrack={removeTrack}
                    startGame={startGame}
                    bpm={bpm}
                    setBpm={setBpm}
                    measures={measures}
                    setMeasures={setMeasures}
                />
            )}

            {/* COUNT-IN & PLAYING PHASE */}
            {(gameState === 'countIn' || gameState === 'playing') && (
                <PlayingPhase 
                    gameState={gameState}
                    count={count}
                    tracks={tracks}
                    activeKeys={activeKeys}
                    startTime={startTimeRef.current}
                    measureDuration={measureDuration}
                    measures={measures}
                />
            )}

            {/* RESULT PHASE */}
            {gameState === 'result' && (
                <ResultPhase 
                    score={score}
                    tracks={tracks}
                    expectedTaps={expectedTaps}
                    detailedResults={detailedResults}
                    measureDuration={measureDuration}
                    measures={measures}
                    setGameState={setGameState}
                />
            )}

        </div>
    );
}