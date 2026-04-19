export const SCORING_CONFIG = {
    returnBars: 1,

    // --- ACCURACY (Ziel: Unter 20ms = 100% | 159ms = ~35%) ---
    accuracyInflectionPct: 0.18,  // Wendepunkt (50 Pkt) bei ca. 120ms (bei 120 BPM)
    accuracySteepness: 3.8,       // Etwas steiler, um das Plateau oben zu halten
    // Sehr hoher Wert = fast kein Abzug bei perfekten Schlägen (< 20ms)
    accuracyLinearDropMs: 1200,   

    // --- CONSISTENCY (Ziel: Unter 15ms = 100% | 31ms = ~85% | 36ms = ~75%) ---
    consistencyInflectionPct: 0.10, // Sehr strenger Wendepunkt (ca. 45ms bei 120 BPM)
    consistencySteepness: 4.9,      // Extreme S-Form: oben flach, dann Klippe
    consistencyLinearDropMs: 1500,  

    weightConsistency: 0.6,
    weightAccuracy: 0.4,

    faultPenaltyMultiplier: 1.4,
    earlyLateThresholdMs: 15
};

export const BEATS = [
    { id: 'solid-95', name: 'Solid 70s Drumset', bpm: 95, bars: 2, src: '/drumSamples/Solid 70s Drumset 16 95bpm 2bars.wav' },
    { id: 'shuffle-125', name: '60s Shuffle Drumset', bpm: 125, bars: 2, src: '/drumSamples/60s Shuffle Drumset 03 125bpm 2bars.wav' },
    { id: 'funked-105', name: 'Funked Out Drumset', bpm: 105, bars: 2, src: '/drumSamples/Funked Out Drumset 05 105bpm 2bars.wav' },
    { id: 'funky-98', name: 'Funky Shuffle Drumset', bpm: 98, bars: 1, src: '/drumSamples/Funky Shuffle Drumset 21 98bpm 1bars.wav' },
];