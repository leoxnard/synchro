export const RHYTHM_TONES_HZ = [880, 740, 659, 587, 523];

export const MAX_EVENTS = 320;
export const WINDOW_BEFORE_MS = 2000;
export const WINDOW_AFTER_MS = 2000;
export const SCHEDULE_INTERVAL_MS = 25;
export const SCHEDULE_AHEAD_SECONDS = 8;
export const BPM = 60;
export const MIN_ALLOWED_NEGATIVE_LATENCY_MS = 0;
export const MAX_TRACKS = 5;

export const MAX_LATENCY_COMP_MS = 2000;
export const DEFAULT_LATENCY_COMP_MS = 0; 
export const AUTO_LATENCY_SAMPLE_MAX_MS = 600;
export const MAX_AUTO_CORRECTION_MS = 600;
export const START_TAP_GRACE_MS = AUTO_LATENCY_SAMPLE_MAX_MS;
export const END_TAP_GRACE_MS = AUTO_LATENCY_SAMPLE_MAX_MS;
export const END_TAP_BASE_BUFFER_MS = 220;
export const BEAT_ACCENT_TONE_HZ = 1175;
export const BEAT_PULSE_TONE_HZ = 988;

export const GAME_TUNING = {
    input: {
        dedupWindowMs: 24, // Minimum time between taps to be considered separate
        recentTrackClaimWindowMs: 45 // How long after a tap the claimed track is protected from being claimed by other taps (for better multi-touch support)
    },
    scoring: {
        beatHitWindowMultiplier: 0.42,
        extraTapPenaltyWeight: 0.32,
        timingWeight: 0.80,
        coverageWeight: 0.14,
        precisionWeight: 0.06,
        finalScoreExponent: 0.95,
        finalScoreScale: 10
    }
};