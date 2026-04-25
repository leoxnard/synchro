export const SCORING_CONFIG = {
    returnBars: 1,

    // --- ACCURACY  ---
    accuracyInflectionPct: 0.18,
    accuracySteepness: 3.8,
    accuracyLinearDropMs: 1200,   

    // --- CONSISTENCY  ---
    consistencyInflectionPct: 0.09,
    consistencySteepness: 4.7,
    consistencyLinearDropMs: 1500,  

    weightConsistency: 0.5,
    weightAccuracy: 0.5,

    faultPenaltyMultiplier: 4, // multiplier for the penalty per fault (missed beat or extra tap) applied to the consistency score
    earlyLateThresholdMs: 15, // ms threshold for counting as early or late tap

    extraTapThresholdPct: 0.6, // below this ratio of the beat interval, it's considered an extra tap rather than a late tap
    missingTapThresholdPct: 1.4, // above this ratio of the beat interval, it's considered a missed tap rather than a late tap

    baseSilenceBeats: 4,     // Bis zu dieser Anzahl an Schlägen gibt es keine Extrapunkte/Kulanz
    leniencyFactor: 0.005,   // Wie stark die Kulanz danach quadratisch ansteigt (kleine Werte nutzen!)

    perfectAccuracyThresholdMs: 15,   // Bis zu 15ms durchschnittliche Abweichung bleiben 100% (Score 10)
    perfectConsistencyThresholdMs: 6, // Bis zu 6ms Standardabweichung bleiben 100% (Score 10)

    downbeatAccuracyWeight: 0.3,
};

export const BEATS = [
    { id: 'solid-95', name: 'Solid 70s Drumset', bpm: 95, src: '/drumSamples/Solid 70s Drumset 16 95bpm.wav' },
    { id: 'shuffle-125', name: '60s Shuffle Drumset', bpm: 125, src: '/drumSamples/60s Shuffle Drumset 03 125bpm.wav' },
    { id: 'funked-105', name: 'Funked Out Drumset', bpm: 105, src: '/drumSamples/Funked Out Drumset 05 105bpm.wav' },
    { id: 'funky-98', name: 'Funky Shuffle Drumset', bpm: 98, src: '/drumSamples/Funky Shuffle Drumset 21 98bpm.wav' },
    { id: 'laid-back-70', name: 'Laid Back Soul Drumset', bpm: 70, src: '/drumSamples/Laid Back Soul Break 02 70bpm.wav' },
    { id: 'disco-120', name: 'Disco Drumset', bpm: 120, src: '/drumSamples/Disco Dreams Bridge Drums 120bpm.wav' },
];