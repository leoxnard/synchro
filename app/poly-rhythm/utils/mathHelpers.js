import { RHYTHM_TONES_HZ, MIN_ALLOWED_NEGATIVE_LATENCY_MS } from '../constants/gameConfig';

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const getRhythmToneHz = (trackIndex) => RHYTHM_TONES_HZ[trackIndex] || RHYTHM_TONES_HZ[RHYTHM_TONES_HZ.length - 1];

export const median = (values) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
};

export const signOf = (value, deadzone = 0) => {
    if (Math.abs(value) <= deadzone) return 0;
    return value > 0 ? 1 : -1;
};

export const distanceSquared = (ax, ay, bx, by) => {
    const dx = ax - bx;
    const dy = ay - by;
    return (dx * dx) + (dy * dy);
};

export const getPointCentroid = (points) => {
    if (!points.length) return { x: 0, y: 0 };

    const totals = points.reduce((accumulator, point) => ({
        x: accumulator.x + point.x,
        y: accumulator.y + point.y
    }), { x: 0, y: 0 });

    return {
        x: totals.x / points.length,
        y: totals.y / points.length
    };
};

export const getOrientationFromWindow = () => (
    window.matchMedia('(orientation: landscape)').matches ? 'landscape' : 'portrait'
);

export const normalizeLatencyMs = (latencyMs, cycleMs) => {
    if (!Number.isFinite(latencyMs)) return 0;
    if (latencyMs >= MIN_ALLOWED_NEGATIVE_LATENCY_MS) return latencyMs;
    if (!Number.isFinite(cycleMs) || cycleMs <= 0) return MIN_ALLOWED_NEGATIVE_LATENCY_MS;

    let adjusted = latencyMs;
    while (adjusted < MIN_ALLOWED_NEGATIVE_LATENCY_MS) {
        adjusted += cycleMs;
    }

    return adjusted;
};