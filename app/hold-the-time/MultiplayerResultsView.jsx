import React, { useMemo, useRef, useState } from 'react';
import { MdVolumeUp } from 'react-icons/md';
import { SlArrowLeft, SlArrowRight } from 'react-icons/sl';

import { BEATS } from './constants/gameConfig';
import { getModeLabel } from './utils/multiplayerHelpers';

function LeaderboardRow({ rank, entry, isWinner = false }) {
    return (
        <div className={`flex items-center justify-between rounded-2xl border px-3 py-2 ${isWinner ? 'border-emerald-400/30 bg-emerald-400/10' : 'border-white/10 bg-white/[0.04]'}`}>
            <div>
                <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">{rank}</div>
                <div className="mt-1 text-sm font-semibold text-stone-100">{entry.player_name}</div>
            </div>
            <div className="text-right">
                <div className="text-lg font-black text-stone-100">{entry.totalScore.toFixed(1)}</div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">{entry.rounds} rounds</div>
            </div>
        </div>
    );
}

function MiniDrift({ analysis }) {
    const points = useMemo(() => {
        const pairs = analysis?.pairs || [];
        const silencePairs = pairs.filter((item) => !item.missed && item.phase === 'silence');
        if (silencePairs.length < 2) return '';

        const maxAbs = Math.max(30, ...silencePairs.map((item) => Math.abs(item.deltaMs || 0)));
        const last = silencePairs.length - 1;

        return silencePairs.map((item, index) => {
            const x = (index / last) * 100;
            const y = 50 - (((item.deltaMs || 0) / maxAbs) * 40);
            return `${x},${y}`;
        }).join(' ');
    }, [analysis]);

    if (!points) return null;
    return (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="block h-7 w-full min-w-10">
            <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
            <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" className="text-neutral-300" />
        </svg>
    );
}

export default function MultiplayerResultsView({
    mode,
    roomPhase,
    currentRound,
    totalRounds,
    currentBeatId,
    roomPlayers = [],
    roundResults = [],
    allResults = [],
    isHost,
    selfPlayerId,
    canAdvance,
    pendingCount,
    onKickPlayer,
    onNextRound,
    onChangeBeat,
}) {
    const beatLabel = BEATS.find((beat) => beat.id === currentBeatId)?.name || 'Beat';
    const beatLabelMinWidth = useMemo(() => {
        const longestBeatNameLength = Math.max(...BEATS.map((beat) => beat.name.length));
        return `${longestBeatNameLength + 1}ch`;
    }, []);
    const [previewingBeatId, setPreviewingBeatId] = useState(null);
    const previewAudioRef = useRef(null);

    function stopPreview() {
        if (previewAudioRef.current) {
            previewAudioRef.current.pause();
            previewAudioRef.current = null;
        }
        setPreviewingBeatId(null);
    }

    function startPreview(beatId) {
        if (previewingBeatId === beatId) return;
        stopPreview();

        const beat = BEATS.find((item) => item.id === beatId);
        if (!beat) return;

        const audio = new Audio(beat.src);
        audio.loop = false;
        audio.onended = () => stopPreview();
        audio.play().catch(() => {});
        previewAudioRef.current = audio;
        setPreviewingBeatId(beatId);
    }

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

    const roundResultMap = useMemo(() => {
        const map = new Map();
        roundResults.forEach((item) => map.set(item.player_id, item));
        return map;
    }, [roundResults]);

    return (
        <div className="flex h-full w-full flex-col gap-4 overflow-y-auto">
            <div className="rounded-[1.8rem] pb-2">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                        <div className="text-[11px] uppercase tracking-[0.24em] text-neutral-500">{getModeLabel(mode)}</div>
                        <div className="mt-1 text-2xl font-black text-stone-100">
                            Round {currentRound} result
                        </div>
                    </div>

                    <div className="text-right text-sm text-neutral-400">
                        <div>{currentRound} / {totalRounds}</div>
                    </div>
                </div>
            </div>

            <div className="rounded-[1.8rem] py-2">
                <div className="text-[10px] uppercase tracking-[0.22em] text-neutral-500">This round</div>
                <div className="mt-3 grid gap-2 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                    {roomPlayers.map((player) => {
                        const result = roundResultMap.get(player.id);
                        const statusText = player.isOnline ? 'online' : 'offline';
                        const statusClass = player.isOnline ? 'text-emerald-300' : 'text-amber-300';
                        return (
                            <div key={player.id} className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <div className="text-sm font-semibold text-stone-100">{player.name}</div>
                                        <div className={`mt-1 text-[10px] uppercase tracking-[0.18em] ${statusClass}`}>{statusText}</div>
                                    </div>
                                    {isHost && player.id !== selfPlayerId && (
                                        <button
                                            type="button"
                                            onClick={() => onKickPlayer(player.id)}
                                            className="rounded-full border border-rose-400/30 bg-rose-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-200"
                                        >
                                            Kick
                                        </button>
                                    )}
                                </div>

                                <div className="mt-2 flex items-center gap-2">
                                    <div className={`shrink-0 text-md uppercase tracking-[0.15em] ${result ? Number(result.score) > 9 ? 'text-emerald-300' : Number(result.score) > 8 ? 'text-amber-300' : 'text-neutral-300' : 'text-neutral-500'}`}>
                                        {result ? Number(result.score).toFixed(1) : 'Playing'}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <MiniDrift analysis={result?.analysis} />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
                {!canAdvance && pendingCount > 0 && (
                    <div className="mt-3 text-xs uppercase tracking-[0.18em] text-amber-300">
                        {pendingCount} playing
                    </div>
                )}
            </div>

            <div className="rounded-[1.8rem] py-2">
                <div className="text-[10px] uppercase tracking-[0.22em] text-neutral-500">Leaderboard</div>
                <div className="mt-3 grid gap-2">
                    {leaderboard.map((entry, index) => (
                        <LeaderboardRow
                            key={entry.player_id}
                            rank={`${index + 1}`}
                            entry={entry}
                            isWinner={index === 0}
                        />
                    ))}
                </div>
            </div>

            {isHost && roomPhase !== 'final' && (
                <div className="rounded-[1.8rem] pt-2">
                    <div className="text-[10px] uppercase tracking-[0.22em] text-neutral-500">Host controls</div>
                    <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                            <div className="text-[10px] uppercase tracking-[0.22em] text-neutral-500">Next beat</div>
                            <div className="flex items-center justify-between gap-3">
                                <div className="whitespace-nowrap" style={{ minWidth: beatLabelMinWidth }}>
                                    <div className="text-lg font-semibold text-stone-100">{beatLabel}</div>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center"> 
                            <button
                                type="button"
                                onClick={() => onChangeBeat('prev')}
                                className="flex items-center justify-center rounded-full w-10 h-10 border border-white/10 bg-white/[0.04] text-stone-100 hover:bg-white/[0.08] text-xs font-semibold uppercase tracking-[0.2em] text-emerald-50 mr-2"
                            >
                                <SlArrowLeft size={15} />
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    if (previewingBeatId === currentBeatId) {
                                        stopPreview();
                                        return;
                                    }
                                    startPreview(currentBeatId);
                                }}
                                className={`flex items-center justify-center rounded-full w-10 h-10 text-xs font-bold uppercase transition-colors border border-white/10 ${previewingBeatId === currentBeatId ? 'bg-emerald-500/20 text-emerald-200' : 'bg-white/[0.04] text-stone-100 hover:bg-white/[0.08]'}`}
                                title="Tap to preview"
                            >
                                <MdVolumeUp size={15} />
                            </button>

                            <button
                                type="button"
                                onClick={() => onChangeBeat('next')}
                                className="flex items-center justify-center rounded-full w-10 h-10 border border-white/10 bg-white/[0.04] text-stone-100 hover:bg-white/[0.08] text-xs font-semibold uppercase tracking-[0.2em] text-emerald-50 ml-2"
                            >
                                <SlArrowRight size={15} />
                            </button>
                        </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" disabled={!canAdvance} onClick={onNextRound} className="rounded-full w-full bg-stone-200 px-5 py-2 text-xs font-bold uppercase tracking-[0.22em] text-neutral-950 disabled:opacity-60">
                            Next round
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
