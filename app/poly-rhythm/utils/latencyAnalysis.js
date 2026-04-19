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

export const estimateAutoLatencyCorrectionMs = ({ matchedResults, tracks, measureDuration }) => {
    const MIN_MATCHED_SAMPLES = 8;
    const MIN_ABS_MEDIAN_MS = 8;
    const DIRECTION_DEADZONE_MS = 10;
    const BUCKET_DEADZONE_MS = 8;
    if (matchedResults.length < MIN_MATCHED_SAMPLES) return 0;

    const diffs = matchedResults.map((result) => result.diff);
    const overallMedian = median(diffs);
    const overallDirection = signOf(overallMedian, DIRECTION_DEADZONE_MS);

    if (overallDirection === 0 || Math.abs(overallMedian) < MIN_ABS_MEDIAN_MS) return 0;

    const directionalHits = diffs.filter((diff) => signOf(diff, DIRECTION_DEADZONE_MS) === overallDirection).length;
    const directionalRatio = directionalHits / diffs.length;
    if (directionalRatio < 0.68) return 0;

    const groupedBySubdivision = new Map();

    matchedResults.forEach((result) => {
        const track = tracks.find((candidate) => candidate.id === result.trackId);
        if (!track || track.pulses <= 0) return;

        const pulseDuration = measureDuration / track.pulses;
        const pulseIndex = Math.round(result.baseTime / pulseDuration) % track.pulses;
        const bucketKey = `${track.id}:${pulseIndex}`;

        if (!groupedBySubdivision.has(bucketKey)) {
            groupedBySubdivision.set(bucketKey, []);
        }
        groupedBySubdivision.get(bucketKey).push(result.diff);
    });

    let sameDirectionWeight = 0;
    let oppositeDirectionWeight = 0;

    groupedBySubdivision.forEach((bucketDiffs) => {
        if (bucketDiffs.length < 2) return;
        const bucketMedian = median(bucketDiffs);
        const bucketDirection = signOf(bucketMedian, BUCKET_DEADZONE_MS);
        if (bucketDirection === 0) return;

        if (bucketDirection === overallDirection) {
            sameDirectionWeight += bucketDiffs.length;
        } else {
            oppositeDirectionWeight += bucketDiffs.length;
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
