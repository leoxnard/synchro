export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const median = (values) => {
    if (!values.length) return 0;
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle];
};

export const formatMs = (value) => `${value > 0 ? '+' : ''}${Math.round(value)}ms`;

export const estimateCalibrationMs = (taps, beatMs, actualActiveMs) => {
    const listeningTaps = taps.filter(t => t.time <= actualActiveMs);
    if (listeningTaps.length === 0) return 0;

    const offsets = listeningTaps.map(tap => {
        let offset = tap.time % beatMs;
        if (offset > beatMs / 2) offset -= beatMs;
        return offset;
    });

    const initialMedian = median(offsets);
    const outlierThreshold = beatMs * 0.25; 
    
    const validOffsets = offsets.filter(offset => {
        let diff = Math.abs(offset - initialMedian);
        if (diff > beatMs / 2) {
            diff = beatMs - diff;
        }
        return diff <= outlierThreshold;
    });

    if (validOffsets.length === 0) return initialMedian;

    return median(validOffsets);
};
