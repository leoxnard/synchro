export const SCORING_CONFIG = {
    returnBars: 1,

    weightConsistency: 0.5,
    weightAccuracy: 0.5,
    downbeatAccuracyWeight: 0.3,

    // --- TOLERANZ-ZONEN (Ab wann gibt es Punktabzug?) ---
    // 0.04 entspricht 20ms bei 120 BPM (Sehr präzise)
    perfectAccuracyThresholdPct: 0.05,  
    
    // 0.02 entspricht 10ms bei 120 BPM (Strenge Grenze für Beschleunigung)
    perfectConsistencyThresholdPct: 0.04, 

    // --- KURVEN-EINSTELLUNGEN (Der "Sweet Spot" des Schwierigkeitsgrads) ---
    // 0.12 entspricht ca. 60ms Abweichung bei 120 BPM
    accuracyInflectionPct: 0.18,
    
    consistencyInflectionPct: 0.03,

    accuracySteepness: 3.8,
    consistencySteepness: 6,

    accuracyLinearDropPct: 0.4,
    consistencyLinearDropPct: 0.3,

    // Penalty
    faultPenaltyMultiplier: 2.0, 
    
    extraTapThresholdPct: 0.3,
    missingTapThresholdPct: 1.5,

    // --- UI & FEEDBACK ---
    earlyLateThresholdPct: 0.06,

    // --- LENIENCY ---
    baseSilenceBeats: 8,
    leniencyFactor: 0.005
};

export const BEATS = [
    { id: 'solid-95', name: 'Solid 70s Drumset', bpm: 95, src: '/drumSamples/Solid 70s Drumset 16 95bpm.wav' },
    { id: 'shuffle-125', name: '60s Shuffle Drumset', bpm: 125, src: '/drumSamples/60s Shuffle Drumset 03 125bpm.wav' },
    { id: 'funked-105', name: 'Funked Out Drumset', bpm: 105, src: '/drumSamples/Funked Out Drumset 05 105bpm.wav' },
    { id: 'funky-98', name: 'Funky Shuffle Drumset', bpm: 98, src: '/drumSamples/Funky Shuffle Drumset 21 98bpm.wav' },
    { id: 'laid-back-70', name: 'Laid Back Soul Drumset', bpm: 70, src: '/drumSamples/Laid Back Soul Break 02 70bpm.wav' },
    { id: 'disco-120', name: 'Disco Drumset', bpm: 120, src: '/drumSamples/Disco Dreams Bridge Drums 120bpm.wav' },
];