import React from 'react';

export default function SyncErrorView({ isHost, playerId, failedPlayerIds, roomPlayers, onRestartRound, handleKickPlayer, handleBanPlayer, restartToSetup }: {
    isHost: boolean;
    playerId: string;
    failedPlayerIds: Set<string>;
    roomPlayers: { id: string; name: string; role: string }[];
    onRestartRound: () => void;
    handleKickPlayer: (id: string) => void;
    handleBanPlayer: (id: string) => void;
    restartToSetup: () => void;
}) {
    return (
        <div className="flex h-full w-full items-center justify-center">
            <div className="text-center max-w-lg p-4">
                <div className="text-xl font-semibold text-rose-300">Sync failed</div>
                <div className="mt-2 text-sm text-neutral-400">Not all players joined within the tolerance window. The host can restart the round, ban players, or return to setup.</div>
                <div className="mt-4">
                    <div className="text-sm text-neutral-500 uppercase tracking-[0.12em] mb-2">Players ({roomPlayers.length})</div>
                    <div className="grid gap-2 max-h-40 overflow-y-auto">
                        {roomPlayers.length > 0 ? (
                            roomPlayers.map((p) => (
                                <div key={p.id} className={`flex items-center justify-between gap-3 rounded-2xl border px-3 py-2 ${failedPlayerIds.has(p.id) ? 'border-rose-400/30 bg-rose-400/10' : 'border-white/10 bg-white/[0.02]'}`}>
                                    <div className="min-w-0 text-left">
                                        <div className="text-sm font-medium text-stone-100 truncate">{p.name}</div>
                                        <div className={`mt-1 text-[10px] uppercase tracking-[0.16em] ${failedPlayerIds.has(p.id) ? 'text-rose-300' : 'text-neutral-500'}`}>
                                            {failedPlayerIds.has(p.id) ? 'Not synchronized' : 'Synchronized'}
                                        </div>
                                    </div>
                                    {isHost && p.id !== playerId ? (
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => handleKickPlayer(p.id)}
                                                className="rounded-full border border-white/10 bg-transparent px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-rose-300 hover:bg-rose-400/10"
                                            >
                                                Kick
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleBanPlayer(p.id)}
                                                className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-200 hover:bg-amber-400/20"
                                            >
                                                Ban
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="text-xs text-neutral-500">{p.role}</div>
                                    )}
                                </div>
                            ))
                        ) : (
                            <div className="text-xs text-neutral-500">Loading players...</div>
                        )}
                    </div>
                </div>
                <div className="mt-6 flex justify-center gap-4">
                    <button
                        type="button"
                        onClick={restartToSetup}
                        className="rounded-full border border-white/10 bg-transparent px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400 hover:text-stone-100"
                    >
                        Back to setup
                    </button>
                    {isHost ? (
                        <button
                            type="button"
                            onClick={onRestartRound}
                            className="rounded-full bg-stone-200 px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-neutral-950"
                        >
                            Restart round
                        </button>
                    ) : (
                        <button
                            type="button"
                            disabled
                            className="rounded-full bg-stone-700/40 px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-neutral-400"
                        >
                            Waiting for host
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};