export const SCORING_CONFIG = {
    returnBars: 1,

    // --- ACCURACY  ---
    accuracyInflectionPct: 0.18,
    accuracySteepness: 3.8,
    accuracyLinearDropMs: 1200,   

    // --- CONSISTENCY  ---
    consistencyInflectionPct: 0.10,
    consistencySteepness: 4.9,
    consistencyLinearDropMs: 1500,  

    weightConsistency: 0.5,
    weightAccuracy: 0.5,

    faultPenaltyMultiplier: 1.4,
    earlyLateThresholdMs: 15
};

export const BEATS = [
    { id: 'solid-95', name: 'Solid 70s Drumset', bpm: 95, bars: 2, src: '/drumSamples/Solid 70s Drumset 16 95bpm 2bars.wav' },
    { id: 'shuffle-125', name: '60s Shuffle Drumset', bpm: 125, bars: 2, src: '/drumSamples/60s Shuffle Drumset 03 125bpm 2bars.wav' },
    { id: 'funked-105', name: 'Funked Out Drumset', bpm: 105, bars: 2, src: '/drumSamples/Funked Out Drumset 05 105bpm 2bars.wav' },
    { id: 'funky-98', name: 'Funky Shuffle Drumset', bpm: 98, bars: 1, src: '/drumSamples/Funky Shuffle Drumset 21 98bpm 1bars.wav' },
];