import { clamp, median, signOf } from './mathHelpers';
import { AUTO_LATENCY_SAMPLE_MAX_MS, MIN_ALLOWED_NEGATIVE_LATENCY_MS, MAX_AUTO_CORRECTION_MS } from '../constants/gameConfig';

export const buildAutoLatencySamples = ({ expectedTaps, actualTaps }) => {
    const expectedByKey = new Map();
    expectedTaps.forEach((tap) => {
        if (!expectedByKey.has(tap.key)) {
            expectedByKey.set(tap.key, []);
        }
        expectedByKey.get(tap.key).push(tap);
    });

    expectedByKey.forEach((list) => list.sort((a, b) => a.time - b.time));

    const actualByKey = new Map();
    actualTaps.forEach((tap) => {
        if (!actualByKey.has(tap.key)) {
            actualByKey.set(tap.key, []);
        }
        actualByKey.get(tap.key).push(tap);
    });

    actualByKey.forEach((list) => list.sort((a, b) => a.time - b.time));

    const samples = [];

    actualByKey.forEach((actualList, key) => {
        const expectedList = expectedByKey.get(key);
        if (!expectedList || expectedList.length === 0) return;

        let expectedIdx = 0;

        actualList.forEach((actualTap) => {
            while (
                expectedIdx + 1 < expectedList.length &&
                expectedList[expectedIdx + 1].time <= actualTap.time
            ) {
                expectedIdx += 1;
            }

            const expectedTap = expectedList[expectedIdx];
            if (!expectedTap) return;

            const diff = actualTap.time - expectedTap.time;
            if (Math.abs(diff) > AUTO_LATENCY_SAMPLE_MAX_MS) return;

            samples.push({
                trackId: expectedTap.trackId,
                baseTime: expectedTap.baseTime,
                diff
            });
        });
    });

    return samples;
};

const calculateWeightedMedian = (items) => {
    if (items.length === 0) return 0;

    const sorted = [...items].sort((a, b) => a.diff - b.diff);
    const totalWeight = sorted.reduce((sum, item) => sum + item.weight, 0);
    
    let cumulativeWeight = 0;
    for (const item of sorted) {
        cumulativeWeight += item.weight;
        if (cumulativeWeight >= totalWeight / 2) {
            return item.diff;
        }
    }
    return sorted[sorted.length - 1].diff;
};

export const estimateAutoLatencyCorrectionMs = ({ matchedResults, tracks, measureDuration, beatsPerMeasure = 4 }) => {
    const MIN_MATCHED_SAMPLES = 8;
    const MIN_ABS_MEDIAN_MS = 8;
    const DIRECTION_DEADZONE_MS = 10;
    const BUCKET_DEADZONE_MS = 8;
    
    if (matchedResults.length < MIN_MATCHED_SAMPLES) return 0;

    const weightedResults = matchedResults.map((result) => {
        const track = tracks.find((candidate) => candidate.id === result.trackId);
        const pulses = track ? track.pulses : 1;
        
        let weight = 1;
        
        if (pulses === beatsPerMeasure) {
            weight = 4;
        } else if (pulses % beatsPerMeasure === 0) {
            weight = 3;
        } else if (pulses === beatsPerMeasure / 2) {
            weight = 2;
        } else if (pulses === 1) {
            weight = 1.5;
        }

        return { ...result, weight };
    });

    const overallMedian = calculateWeightedMedian(weightedResults);
    const overallDirection = signOf(overallMedian, DIRECTION_DEADZONE_MS);

    if (overallDirection === 0 || Math.abs(overallMedian) < MIN_ABS_MEDIAN_MS) return 0;

    const totalWeight = weightedResults.reduce((sum, r) => sum + r.weight, 0);
    const directionalWeight = weightedResults
        .filter((r) => signOf(r.diff, DIRECTION_DEADZONE_MS) === overallDirection)
        .reduce((sum, r) => sum + r.weight, 0);

    const directionalRatio = directionalWeight / totalWeight;
    if (directionalRatio < 0.68) return 0;

    const groupedBySubdivision = new Map();

    weightedResults.forEach((result) => {
        const track = tracks.find((candidate) => candidate.id === result.trackId);
        if (!track || track.pulses <= 0) return;

        const pulseDuration = measureDuration / track.pulses;
        const pulseIndex = Math.round(result.baseTime / pulseDuration) % track.pulses;
        const bucketKey = `${track.id}:${pulseIndex}`;

        if (!groupedBySubdivision.has(bucketKey)) {
            groupedBySubdivision.set(bucketKey, []);
        }
        groupedBySubdivision.get(bucketKey).push(result);
    });

    let sameDirectionWeight = 0;
    let oppositeDirectionWeight = 0;

    groupedBySubdivision.forEach((bucketItems) => {
        if (bucketItems.length < 2) return;
        
        const bucketMedian = calculateWeightedMedian(bucketItems);
        const bucketDirection = signOf(bucketMedian, BUCKET_DEADZONE_MS);
        if (bucketDirection === 0) return;

        const bucketTotalWeight = bucketItems.reduce((sum, item) => sum + item.weight, 0);

        if (bucketDirection === overallDirection) {
            sameDirectionWeight += bucketTotalWeight;
        } else {
            oppositeDirectionWeight += bucketTotalWeight;
        }
    });

    if (sameDirectionWeight === 0) return 0;
    if (oppositeDirectionWeight > sameDirectionWeight * 0.3) return 0;

    return clamp(overallMedian, MIN_ALLOWED_NEGATIVE_LATENCY_MS, MAX_AUTO_CORRECTION_MS);
};

export const estimateFallbackAutoLatencyMs = (samples) => {
    const MIN_FALLBACK_SAMPLES = 3;
    const MIN_FALLBACK_MEDIAN_MS = 12;

    const filteredDiffs = samples
        .map((sample) => sample.diff)
        .filter((diff) => Number.isFinite(diff) && Math.abs(diff) <= AUTO_LATENCY_SAMPLE_MAX_MS);

    if (filteredDiffs.length < MIN_FALLBACK_SAMPLES) return 0;

    const fallbackMedian = median(filteredDiffs);
    if (Math.abs(fallbackMedian) < MIN_FALLBACK_MEDIAN_MS) return 0;

    return clamp(fallbackMedian, MIN_ALLOWED_NEGATIVE_LATENCY_MS, MAX_AUTO_CORRECTION_MS);
};
