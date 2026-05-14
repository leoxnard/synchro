const STORAGE_KEY = 'polyrhythm_config';
const DEFAULT_CONFIG = {
    bpm: 90,
    measures: 4,
    beatsPerMeasure: 4,
    countInBars: 1,
    tracks: [
        { id: 1, pulses: 4, key: 'shift' },
        { id: 2, pulses: 3, key: ' ' }
    ],
    latencyCompMs: 0
};

export const savePolyrhythmConfig = (config) => {
    if (typeof window === 'undefined') return;
    try {
        const configToSave = {
            bpm: config.bpm,
            measures: config.measures,
            beatsPerMeasure: config.beatsPerMeasure,
            countInBars: config.countInBars,
            tracks: config.tracks,
            latencyCompMs: config.latencyCompMs
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(configToSave));
    } catch (error) {
        console.warn('Failed to save polyrhythm config to localStorage:', error);
    }
};

export const loadPolyrhythmConfig = () => {
    if (typeof window === 'undefined') return DEFAULT_CONFIG;
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            // Validate the stored config has required fields
            if (
                typeof parsed.bpm === 'number' &&
                typeof parsed.measures === 'number' &&
                typeof parsed.beatsPerMeasure === 'number' &&
                typeof parsed.countInBars === 'number' &&
                Array.isArray(parsed.tracks) &&
                typeof parsed.latencyCompMs === 'number'
            ) {
                return parsed;
            }
        }
    } catch (error) {
        console.warn('Failed to load polyrhythm config from localStorage:', error);
    }
    return DEFAULT_CONFIG;
};

export const clearPolyrhythmConfig = () => {
    if (typeof window === 'undefined') return;
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
        console.warn('Failed to clear polyrhythm config from localStorage:', error);
    }
};
