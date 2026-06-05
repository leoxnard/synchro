import React, { useState, useRef } from 'react';

import { NumberStepperNoInput } from '../components/NumberStepper';
import {
    getModeDescription,
    getModeLabel,
} from './utils/multiplayerHelpers';

function ParticipantCard({ participant, isHost, onKick, onBan }) {
    const dotClass = participant.isOnline
        ? (participant.ready ? 'bg-emerald-400' : 'bg-yellow-400')
        : 'bg-rose-400';

    return (
        <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3">
            <div className="flex flex-col justify-between gap-1">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                        <div className={`h-2.5 w-2.5 rounded-full ${dotClass} flex-shrink-0`} />
                        <div className="text-sm font-semibold text-stone-100 truncate">
                            {participant.name}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 justify-between">
                    <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-neutral-500">
                        {participant.role}
                    </div>
                    {participant.latencyMs != null && (
                        <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">
                            {Math.round(participant.latencyMs)} ms
                        </div>
                    )}
                    {isHost && participant.role !== 'host' && (
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => onKick && onKick(participant.id)}
                                className="rounded-full border border-white/10 bg-transparent px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-300 hover:bg-rose-400/10"
                            >
                                Kick
                            </button>
                            <button
                                type="button"
                                onClick={() => onBan && onBan(participant.id)}
                                className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-200 hover:bg-amber-400/20"
                            >
                                Ban
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function MultiplayerLobbyView({
    mode,
    roomLink,
    players = [],
    isHost = false,
    isStartingRound = false,
    errorMessage = '',
    silentBars = 4,
    totalRounds = 5,
    onBackToSetup,
    onStartRound,
    onKickPlayer,
    onBanPlayer,
    onChangeSilentBars,
    onChangeTotalRounds,
    onChangeRoomMode,
}) {
    const [copyState, setCopyState] = useState('Copy link');
    const latestCopyId = useRef(0); 

    const canStart = players.length > 0 && players.every((p) => Boolean(p.isOnline) && Boolean(p.ready));
    const isOneDeviceMode = mode === 'local';

    // The async Clipboard API only works in a secure context (HTTPS or localhost),
    // so over a LAN IP (http://192.168.x.x) it throws. Fall back to the legacy
    // execCommand copy via a hidden textarea, which works on insecure origins too.
    async function copyRoomLinkToClipboard() {
        if (navigator.clipboard && window.isSecureContext) {
            try {
                await navigator.clipboard.writeText(roomLink);
                return true;
            } catch {
                // fall through to the legacy path
            }
        }

        try {
            const textarea = document.createElement('textarea');
            textarea.value = roomLink;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'fixed';
            textarea.style.top = '-9999px';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            textarea.setSelectionRange(0, roomLink.length);
            const ok = document.execCommand('copy');
            document.body.removeChild(textarea);
            return ok;
        } catch {
            return false;
        }
    }

    async function handleCopyRoomLink() {
        latestCopyId.current += 1;
        const current_copy_id = latestCopyId.current;

        const ok = await copyRoomLinkToClipboard();
        setCopyState(ok ? 'Copied' : 'Copy failed');

        window.setTimeout(() => {
            if (latestCopyId.current === current_copy_id) {
                setCopyState('Copy link');
            }
        }, 1400);
    }

    return (
        <div className="flex h-full w-full flex-col gap-5 overflow-y-auto">
            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-neutral-500">{getModeLabel(mode)}</div>
                    <div className="flex flex-row gap-2 justify-between">
                        <div className="mt-2 max-w-xs text-sm text-neutral-400">{getModeDescription(mode)}</div> 
                        <button
                            type="button"
                            onClick={handleCopyRoomLink}
                            className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-stone-100 transition-colors hover:bg-white/[0.08]"
                        >
                            {/* Grid legt alle 3 Texte übereinander; das breiteste Element bestimmt die feste Button-Breite */}
                            <div className="grid place-items-center">
                                <span className={`col-start-1 row-start-1  ${copyState === 'Copy link' ? 'visible opacity-100' : 'invisible opacity-0'}`}>
                                    Copy link
                                </span>
                                <span className={`col-start-1 row-start-1  ${copyState === 'Copied' ? 'visible opacity-100' : 'invisible opacity-0'}`}>
                                    Copied
                                </span>
                                <span className={`col-start-1 row-start-1  ${copyState === 'Copy failed' ? 'visible opacity-100' : 'invisible opacity-0'}`}>
                                    Copy failed
                                </span>
                            </div>
                        </button>
                    </div>

                </div>
            </div>

            <div className="flex-1 overflow-y-auto">
                <p className="text-[11px] uppercase tracking-[0.24em] text-neutral-500 pb-2">Players ({players.length})</p>
                <div className="grid gap-3 grid-cols-2">
                    {players.map((participant) => (
                        <ParticipantCard
                            key={participant.id}
                            participant={participant}
                            isHost={isHost}
                            onKick={(id) => onKickPlayer && onKickPlayer(id)}
                            onBan={(id) => onBanPlayer && onBanPlayer(id)}
                        />
                    ))}
                </div>
            </div>

            <div className="mt-auto flex flex-col gap-3 md:justify-between">
                <div className="flex flex-col gap-2">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-neutral-500">Audio output</div>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            disabled={!isHost}
                            onClick={() => onChangeRoomMode && onChangeRoomMode('online')}
                            className={`rounded-full border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors ${
                                !isOneDeviceMode
                                    ? 'border-cyan-300/30 bg-cyan-400/10 text-stone-100'
                                    : 'border-white/10 bg-transparent text-neutral-400 hover:text-stone-100'
                            } disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                            All devices
                        </button>
                        <button
                            type="button"
                            disabled={!isHost}
                            onClick={() => onChangeRoomMode && onChangeRoomMode('local')}
                            className={`rounded-full border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors ${
                                isOneDeviceMode
                                    ? 'border-cyan-300/30 bg-cyan-400/10 text-stone-100'
                                    : 'border-white/10 bg-transparent text-neutral-400 hover:text-stone-100'
                            } disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                            One device
                        </button>
                    </div>
                </div>
                <div className="text-[11px] uppercase tracking-[0.24em] text-neutral-500">Round control</div>
                <div className={`flex flex-wrap ${isHost ? 'justify-between' : 'justify-center'} gap-3`}>
                    <NumberStepperNoInput
                        label="Silent bars"
                        value={silentBars}
                        onChange={(newValue) => onChangeSilentBars(silentBars, newValue)}
                        min={1}
                        max={16}
                        compact
                        monitoring={!isHost}
                    />
                    <NumberStepperNoInput
                        label="Rounds"
                        value={totalRounds}
                        onChange={(newValue) => onChangeTotalRounds(totalRounds, newValue)}
                        min={1}
                        max={20}
                        step={1}
                        compact
                        monitoring={!isHost}
                    />
                </div>
                {errorMessage && <div className="mt-1 text-xs text-rose-300">{errorMessage}</div>}
                <div className="flex flex-row gap-3 justify-between">
                    <button
                        type="button"
                        onClick={onBackToSetup}
                        className="rounded-full border border-white/10 bg-transparent px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400 transition-colors hover:text-stone-100"
                    >
                        Back
                    </button>
                    <button
                        type="button"
                        disabled={isStartingRound || !canStart || !isHost}
                        onClick={onStartRound}
                        className="rounded-full bg-stone-200 px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-neutral-950 transition-transform active:scale-95 disabled:opacity-60"
                    >
                        {isStartingRound ? 'Starting' : !isHost ? 'Waiting for host' : (canStart ? 'Start round' : 'Waiting for players')}
                    </button>
                </div>
            </div>
        </div>
    );
}
