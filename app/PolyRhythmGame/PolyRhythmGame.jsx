'use client'

import React, { useState, useEffect, useRef } from 'react';
import SetupPhase from './SetupPhase';
import PlayingPhase from './PlayingPhase';
import ResultPhase from './ResultPhase';

const TOLERANCE_MS = 200; // Maximum deviation in milliseconds for points

export default function PolyrhythmGame() {
  const [gameState, setGameState] = useState('setup'); // 'setup', 'countIn', 'playing', 'result'
  const [count, setCount] = useState(4); // Für den visuellen Einzähler
  const [bpm, setBpm] = useState(60);
  const [measures, setMeasures] = useState(4);
  const [baseTrackId, setBaseTrackId] = useState(2); // Welcher Track gibt den Grund-Takt (Metronom) an? Standard: 2 (der mit 3 Schlägen)
  const [tracks, setTracks] = useState([
    { id: 1, pulses: 4, key: 'shift' },
    { id: 2, pulses: 3, key: ' ' }
  ]);
  const [score, setScore] = useState(0);
  const [activeKeys, setActiveKeys] = useState({});

  const measureDuration = (60 / bpm) * 4 * 1000;

  // Hilfsfunktion: Automatische Zuteilung der "einhändigen" Tasten je nach Anzahl der Rhythmen
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

  // Refs für zeitkritische Daten (verhindert unnötige Re-Renders)
  const startTimeRef = useRef(0);
  const actualTapsRef = useRef([]);
  const expectedTapsRef = useRef([]);
  const audioCtxRef = useRef(null);
  const detailedResultsRef = useRef([]); // Tracking-Log für die Visualisierung
  const timeoutsRef = useRef([]); // Speichert alle Timeouts für den Spielabbruch

  // --- SETUP-LOGIK ---
  const addTrack = () => {
    if (tracks.length >= 5) return; // Begrenzung auf 5 Spuren
    
    const newTotal = tracks.length + 1;
    const defaultKeys = getAssignedKey(0, newTotal) !== '' ? Array.from({length: newTotal}).map((_,i) => getAssignedKey(i, newTotal)) : ['a', 'shift', 'w', ' ', 'd'];
    
    // Rework keys to defaults for new length
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

  // --- AUDIO & TIMING ---
  
  // Funktion um High-Resolution Time (performance.now) mit der Web Audio API Clock (audioCtx.currentTime) zu synchronisieren
  const getAudioContextOffset = () => {
    if (!audioCtxRef.current) return 0;
    // Wir berechnen die Differenz zwischen Hardware-Uhr (performance.now in ms)
    // und Audio-Clock (currentTime in seconds)
    // Beachte: currentTime ist oft leicht verzögert gegenüber performance.now()
    return performance.now() - (audioCtxRef.current.currentTime * 1000);
  };

  const playMetronomeClick = (time, freq = 800) => {
    if (!audioCtxRef.current) return;
    const osc = audioCtxRef.current.createOscillator();
    const gain = audioCtxRef.current.createGain();
    osc.connect(gain);
    gain.connect(audioCtxRef.current.destination);
    osc.frequency.value = freq; // Variable Frequenz
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
      // Der finale Downbeat (auf die nächste volle "Eins" nach allen Takten)
      // wird ebenfalls als regulärer Hit vom Metronom angesagt und erwartet.
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

  // --- SPIEL-LOGIK ---
  const startGame = () => {
    if (tracks.some(t => t.pulses <= 0)) {
      alert("Please fill out all fields correctly!");
      return;
    }

    // Audio Context initialisieren (braucht User-Interaktion)
    audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    
    // Alte Timeouts sicherheitshalber löschen
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];

    expectedTapsRef.current = calculateExpectedTaps();
    actualTapsRef.current = [];
    
    // Finde den aktuell ausgewählten Haupttakt
    const activeBaseTrackId = tracks.some(t => t.id === baseTrackId) ? baseTrackId : tracks[0].id;
    const baseTrack = tracks.find(t => t.id === activeBaseTrackId);
    const basePulses = baseTrack.pulses;
    
    setGameState('countIn');
    setCount(basePulses); // Visualisiert ab der Anzahl der Haupttakt-Schläge
    
    // 100ms Puffer, da der AudioContext beim ersten Start evtl. kurz blockiert
    const startOffset = 0.1;
    const now = audioCtxRef.current.currentTime + startOffset;
    const measureDurationSecs = measureDuration / 1000;
    
    // Die Web Audio API hat eine eigene "Uhr" (currentTime, basierend auf der Soundkarte),
    // Tastatur-Eingaben werden aber in performance.now() (Hardware-Cputakt) gemessen!
    // Wir berechnen hier den genauen Delta-Offset, damit unser Startpunkt auf BEIDEN Uhren exakt übereinstimmt:
    const audioToPerfOffset = getAudioContextOffset();
    
    // Der Ziel-Zeitpunkt für den **ersten Takt nach dem Count-in**, aber auf der Hardware-Uhr-Skala (!):
    // => Aktuelle Audiozeit + Puffer + 1 Takt Count-In => In MS umgerechnet => Plus dem Audio-Hardware-Delta.
    startTimeRef.current = ((now + measureDurationSecs) * 1000) + audioToPerfOffset;
    
    // --- EINZÄHLER: Gesamten Rhythmus für 1 Takt vorspielen ---
    tracks.forEach((track, index) => {
      // Höherer Klick für Track 1, tiefer für Track 2 etc., damit man es auseinanderhalten kann
      const trackFreq = index === 0 ? 1000 : (index === 1 ? 600 : 400); 
      for (let p = 0; p < track.pulses; p++) {
        const time = now + (p / track.pulses) * measureDurationSecs;
        // Betonen des allerersten gemeinsamen Schlags auf die "1"
        const isBeatOne = (p === 0);
        playMetronomeClick(time, isBeatOne ? Math.max(trackFreq, 1200) : trackFreq);
      }
    });

    // Visueller Countdown des Haupttakts
    for (let b = 0; b < basePulses; b++) {
      timeoutsRef.current.push(setTimeout(() => {
        setCount(basePulses - b);
      }, (startOffset * 1000) + b * (measureDuration / basePulses)));
    }

    // Übergang zum Spiel-Status (nach dem Einzählen)
    timeoutsRef.current.push(setTimeout(() => {
      setGameState('playing');
    }, (startOffset * 1000) + measureDuration));
    
    // --- SPIELPHASE: Metronom spielt nur noch den ausgewählten Haupttakt ---
    const baseFreq = tracks.indexOf(baseTrack) === 0 ? 1000 : 600;
    for (let m = 0; m < measures; m++) {
      for (let p = 0; p < basePulses; p++) {
        // Taktanfang wird leicht höher gepitcht
        const isMeasureStart = (p === 0);
        const time = now + measureDurationSecs + m * measureDurationSecs + (p / basePulses) * measureDurationSecs;
        playMetronomeClick(time, isMeasureStart ? baseFreq + 200 : baseFreq);
      }
    }
    
    // Den finalen Klick am ganz exakten Ende ansagen
    playMetronomeClick(now + measureDurationSecs + measures * measureDurationSecs, 1200);

    // Spielende
    timeoutsRef.current.push(setTimeout(() => {
      endGame();
    }, (startOffset * 1000) + measureDuration + (measureDuration * measures) + 500));
  };

  const abortGame = () => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    if (audioCtxRef.current) {
      // Audio stoppen, andernfalls spielt es im Hintergrund weiter
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
    let totalDeviation = 0; // Wir addieren hier einfach alle ms-Abweichungen auf
    let maxAllowedDeviation = 0; // Summiert die größtmöglichen Fehlerpunkte auf
    const expected = expectedTapsRef.current;
    const availableActualTaps = [...actualTapsRef.current];
    
    detailedResultsRef.current = [];

    expected.forEach(exp => {
      // Herausfinden, wie weit die Schläge auf diesem Track auseinanderliegen.
      const track = tracks.find(t => t.id === exp.trackId);
      // Wenn man genau bis zur Hälfte des nächsten Schlags verspätet ist, hat man ihn maximal verfehlt. (0%)
      const maxErrorForBeat = (measureDuration / track.pulses) / 2;
      maxAllowedDeviation += maxErrorForBeat;

      // Suche den nächsten passenden Anschlag für diesen Schlag
      const matchingTaps = availableActualTaps.filter(act => act.key === exp.key);
      
      if (matchingTaps.length === 0) {
        // Gar nicht gedrückt -> Maximaler Fehler (genau zwischen zwei Schlägen)
        totalDeviation += maxErrorForBeat;
        detailedResultsRef.current.push({ ...exp, actualTime: null, diff: null });
        return; 
      }

      // Welcher war am nächsten dran?
      let closestTap = matchingTaps.reduce((prev, curr) => 
        Math.abs(curr.time - exp.time) < Math.abs(prev.time - exp.time) ? curr : prev
      );

      const diff = closestTap.time - exp.time;
      const absDiff = Math.abs(diff);
      
      if (absDiff <= maxErrorForBeat) {
        // Differenz einfach aufaddieren!
        totalDeviation += absDiff;
        
        detailedResultsRef.current.push({
          ...exp,
          actualTime: closestTap.time,
          diff
        });

        // Den Tap aus der Liste nehmen, damit er nicht doppelt zählt
        const usedIndex = availableActualTaps.findIndex(act => act === closestTap);
        if (usedIndex > -1) {
          availableActualTaps.splice(usedIndex, 1);
        }
      } else {
        // Viel zu spät/früh gedrückt (mehr als die Hälfte zum nächsten Schlag) -> Zählt als komplett verfehlt
        totalDeviation += maxErrorForBeat;
        detailedResultsRef.current.push({ ...exp, actualTime: null, diff: null });
      }
    });

    // Straf-Abweichung, falls man einfach nur extrem oft gedrückt hat (Spamming)
    const extraTaps = availableActualTaps.filter(act => tracks.some(t => t.key === act.key));
    // Ein extra Klick wird mit dem durchschnittlichen Max-Error bestraft
    const avgMaxError = expected.length > 0 ? (maxAllowedDeviation / expected.length) : 200;
    totalDeviation += extraTaps.length * (avgMaxError / 2);

    extraTaps.forEach(act => {
      const track = tracks.find(t => t.key === act.key);
      if (track) {
        const measureIndex = Math.floor(act.time / measureDuration);
        const baseTime = act.time % measureDuration;
        detailedResultsRef.current.push({
          trackId: track.id,
          key: act.key,
          baseTime: baseTime,
          diff: 0, // baseTime already contains the exact tap time within the measure
          actualTime: act.time,
          measureIndex: measureIndex,
          isExtra: true
        });
      }
    });

    // Prozentualen Score aus der Gesamtabweichung berechnen (0 Abweichung = 100%)
    const finalPercentage = maxAllowedDeviation > 0 
      ? 100 - ((totalDeviation / maxAllowedDeviation) * 100) 
      : 0;
    
    setScore(Math.max(0, Math.round(finalPercentage)));
  };

  // --- EVENT LISTENERS ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.repeat) return;

      // Globale Steuerung: Start / Restart (Enter oder Leertaste im Setup/Result-Screen)
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

      // Spielsteuerung: Nur in countIn und playing
      if (gameState !== 'playing' && gameState !== 'countIn') return;

      const key = e.key.toLowerCase();
      
      // Verhindere Scrollen bei Leertaste
      if (key === ' ') e.preventDefault();
      
      // Prüfen ob die Taste einem laufenden Rhythmus zugeordnet ist
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

  // --- RENDER ---
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
          basePulses={tracks.find(t => t.id === baseTrackId)?.pulses || tracks[0].pulses}
          measures={measures}
        />
      )}

      {/* RESULT PHASE */}
      {gameState === 'result' && (
        <ResultPhase 
          score={score}
          tracks={tracks}
          expectedTapsRef={expectedTapsRef}
          detailedResultsRef={detailedResultsRef}
          measureDuration={measureDuration}
          measures={measures}
          setGameState={setGameState}
        />
      )}

    </div>
  );
}