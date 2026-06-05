import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { SlArrowDown } from 'react-icons/sl';

function smoothPathFromPoints(points) {
    if (points.length < 2) return '';

    const first = points[0];
    let path = `M ${first.x} ${first.y}`;

    for (let index = 0; index < points.length - 1; index += 1) {
        const previous = points[index - 1] || points[index];
        const current = points[index];
        const next = points[index + 1];
        const afterNext = points[index + 2] || next;

        const controlOneX = current.x + ((next.x - previous.x) / 6);
        const controlOneY = current.y + ((next.y - previous.y) / 6);
        const controlTwoX = next.x - ((afterNext.x - current.x) / 6);
        const controlTwoY = next.y - ((afterNext.y - current.y) / 6);

        path += ` C ${controlOneX} ${controlOneY}, ${controlTwoX} ${controlTwoY}, ${next.x} ${next.y}`;
    }

    return path;
}

function buildDriftSamples(results = []) {
    const samples = [];

    const parseAnalysis = (analysis) => {
        if (!analysis) return null;
        if (typeof analysis === 'string') {
            try {
                return JSON.parse(analysis);
            } catch {
                return null;
            }
        }
        return analysis;
    };

    results
        .map((result) => ({ ...result, analysis: parseAnalysis(result?.analysis) }))
        .filter((result) => result?.analysis?.pairs?.length)
        .sort((left, right) => Number(left.round_number || 0) - Number(right.round_number || 0))
        .forEach((result) => {
            const silencePairs = result.analysis.pairs.filter((item) => !item.missed && item.phase === 'silence');

            silencePairs.forEach((item) => {
                samples.push({
                    deltaMs: Number(item.deltaMs || 0),
                    roundNumber: Number(result.round_number || 0),
                });
            });
        });

    return samples;
}

function MiniDrift({ samples }) {
    const points = useMemo(() => {
        if (!samples || samples.length < 2) return '';

        const maxAbs = Math.max(30, ...samples.map((item) => Math.abs(item.deltaMs || 0)));
        const last = samples.length - 1;
        const normalizedPoints = samples.map((item, index) => {
            const x = (index / last) * 100;
            const y = 50 - (((item.deltaMs || 0) / maxAbs) * 40);
            return { x, y };
        });

        return smoothPathFromPoints(normalizedPoints);
    }, [samples]);

    if (!points) return null;
    return (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="block h-7 w-full">
            <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
            <path d={points} fill="none" stroke="currentColor" strokeWidth="2" className="text-neutral-300" />
        </svg>
    );
}

function PlayerStats({ results }) {
    const summary = useMemo(() => {
        const samples = buildDriftSamples(results);
        const analyzedResults = results.filter((item) => item?.analysis);
        const totalAbs = samples.reduce((sum, item) => sum + Math.abs(item.deltaMs || 0), 0);
        const totalSigned = samples.reduce((sum, item) => sum + Number(item.deltaMs || 0), 0);
        const earlyCount = samples.filter((item) => item.deltaMs < -15).length;
        const lateCount = samples.filter((item) => item.deltaMs > 15).length;

        let driftSlope = 0;
        if (samples.length > 1) {
            const n = samples.length;
            let sumX = 0;
            let sumY = 0;
            let sumXY = 0;
            let sumXX = 0;

            samples.forEach((item, index) => {
                sumX += index;
                sumY += item.deltaMs;
                sumXY += index * item.deltaMs;
                sumXX += index * index;
            });

            driftSlope = (n * sumXY - sumX * sumY) / Math.max(1, (n * sumXX - sumX * sumX));
        }

        const tempoTrend = driftSlope > 1.5 ? 'slowing_down' : driftSlope < -1.5 ? 'speeding_up' : Math.abs(driftSlope) > 0.5 ? 'wobbly' : 'steady';

        return {
            samples,
            rounds: analyzedResults.length,
            accuracy: analyzedResults.length > 0
                ? analyzedResults.reduce((sum, item) => sum + Number(item?.analysis?.accuracyScore || 0), 0) / analyzedResults.length
                : 0,
            consistency: analyzedResults.length > 0
                ? analyzedResults.reduce((sum, item) => sum + Number(item?.analysis?.consistencyScore || 0), 0) / analyzedResults.length
                : 0,
            averageOffsetMs: samples.length > 0 ? totalSigned / samples.length : 0,
            averageAbsOffsetMs: samples.length > 0 ? totalAbs / samples.length : 0,
            earlyCount,
            lateCount,
            driftSlope,
            tempoTrend,
        };
    }, [results]);

    if (!summary.samples.length) {
        return (
            <div className="mt-4 rounded-2xl border border-white/5 bg-black/20 px-4 py-5 text-sm text-neutral-500">
                No tempo drift data available.
            </div>
        );
    }

    return (
        <div className="space-y-4 mt-4 pt-4 border-t border-white/10">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Accuracy</div>
                    <div className="mt-1 text-lg font-semibold text-stone-100">{summary.accuracy.toFixed(1)}/10</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Consistency</div>
                    <div className="mt-1 text-lg font-semibold text-stone-100">{summary.consistency.toFixed(1)}/10</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Absolute Distance</div>
                    <div className="mt-1 text-lg font-semibold text-stone-100">{summary.averageAbsOffsetMs.toFixed(1)} ms</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Rounds</div>
                    <div className="mt-1 text-lg font-semibold text-stone-100">{summary.rounds}</div>
                </div>
            </div>

            <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-neutral-400">
                    <span>Tempo Drift</span>
                    <span>{summary.tempoTrend === 'speeding_up' ? 'Speeding up' : summary.tempoTrend === 'slowing_down' ? 'Slowing down' : summary.tempoTrend === 'wobbly' ? 'Wobbly' : 'Steady'}</span>
                </div>
                <div className="mb-2 text-[11px] text-neutral-400">
                    Avg offset {summary.averageOffsetMs.toFixed(1)} ms · Early {summary.earlyCount} · Late {summary.lateCount} · Drift {summary.driftSlope > 0 ? '+' : ''}{summary.driftSlope.toFixed(2)} ms/beat
                </div>
                <MiniDrift samples={summary.samples} />
                <div className="mt-2 flex justify-between text-[8px] text-neutral-600">
                    <span>Early</span>
                    <span>Beat sequence</span>
                    <span>Late</span>
                </div>
            </div>
        </div>
    );
}

export default function MultiplayerFinalResults({
    roomPlayers = [],
    allResults = [],
    isHost,
    onOpenLobby,
}) {
    const [expandedPlayerId, setExpandedPlayerId] = useState(null);

    const resultsByPlayerId = useMemo(() => {
        const map = new Map();

        allResults.forEach((result) => {
            const existing = map.get(result.player_id) || [];
            existing.push(result);
            map.set(result.player_id, existing);
        });

        return map;
    }, [allResults]);

    const leaderboard = useMemo(() => {
        const map = new Map();

        roomPlayers.forEach((player) => {
            map.set(player.id, {
                player_id: player.id,
                player_name: player.name,
                totalScore: 0,
                rounds: 0,
            });
        });

        allResults.forEach((result) => {
            const existing = map.get(result.player_id) || {
                player_id: result.player_id,
                player_name: result.player_name,
                totalScore: 0,
                rounds: 0,
            };
            existing.totalScore += Number(result.score || 0);
            existing.rounds += 1;
            map.set(result.player_id, existing);
        });

        return [...map.values()].sort((left, right) => right.totalScore - left.totalScore);
    }, [allResults, roomPlayers]);

    return (
        <div className="flex h-full w-full flex-col gap-4 overflow-y-auto pb-2">
            <div className="text-[10px] uppercase tracking-[0.22em] text-neutral-500">Final Leaderboard</div>
            <div className="mt-4 grid gap-2">
                {leaderboard.map((entry, index) => {
                    const playerResults = resultsByPlayerId.get(entry.player_id) || [];
                    const isExpanded = expandedPlayerId === entry.player_id;
                    
                    return (
                        <div 
                            key={entry.player_id}
                            className="rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden transition-colors"
                        >
                            <button
                                type="button"
                                onClick={() => setExpandedPlayerId(isExpanded ? null : entry.player_id)}
                                className="w-full px-4 py-4 flex items-center justify-between hover:bg-white/[0.08] transition-colors"
                            >
                                <div className="flex items-center justify-between flex-1 gap-3">
                                    <div className="flex items-center gap-3">
                                        <div className={`text-2xl font-black w-8 text-center ${index === 0 ? 'text-amber-300' : index === 1 ? 'text-emerald-300' : 'text-stone-400'}`}>
                                            {index + 1}
                                        </div>
                                        <div>
                                            <div className="text-sm font-semibold text-stone-100">{entry.player_name}</div>
                                            <div className="text-[10px] uppercase tracking-[0.15em] text-neutral-500 mt-1">{entry.rounds} rounds</div>
                                        </div>
                                    </div>
                                    <div className={`text-3xl font-black ${index === 0 ? 'text-amber-300' : index === 1 ? 'text-emerald-300' : 'text-stone-100'}`}>
                                        {entry.totalScore.toFixed(1)}
                                    </div>
                                </div>
                                <div className={`ml-3 text-neutral-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                                    <SlArrowDown size={20} />
                                </div>
                            </button>
                            
                            <AnimatePresence initial={false}>
                                {isExpanded && (
                                    <motion.div
                                        key="player-stats"
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.28, ease: 'easeInOut' }}
                                        style={{ overflow: 'hidden' }}
                                    >
                                        <div className="px-4 pb-4">
                                            <PlayerStats results={playerResults} />
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    );
                })}
            </div>

            {isHost && (
                <div className="px-4 flex justify-center">
                    <button type="button" onClick={onOpenLobby} className="rounded-full bg-stone-200 px-6 py-2 text-xs font-bold uppercase tracking-[0.22em] text-neutral-950">
                        Open lobby
                    </button>
                </div>
            )}
        </div>
    );
}
