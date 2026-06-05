// app/hold-the-time/HoldTheTime.jsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import SetupView from './SetupView';
import ResultView from './ResultView';
import PlayView from './PlayView';
import MultiplayerLobbyView from './MultiplayerLobbyView';
import MultiplayerResultsView from './MultiplayerResultsView';
import MultiplayerFinalResults from './MultiplayerFinalResults';
import GameContainer from '../components/GameContainer';

import { SCORING_CONFIG, BEATS } from './constants/gameConfig';
import { clamp } from './utils/mathHelpers';
import { analyzeSession } from './utils/analyzeSession';
import { useIsMobile } from '../hooks/useIsMobile';
import { createPlayerId, createRoomToken } from './utils/multiplayerHelpers';
import {
    createRoom,
    banRoomPlayer,
    finalizeRoundIfComplete,
    getRoomByToken,
    getRoomState,
    getServerNow,
    joinRoom,
    kickRoomPlayer,
    leaveRoom,
    listAllRoomResults,
    listRoundResults,
    listRoomPlayers,
    getRoomPlayer,
    openLobbyAgain,
    rescheduleRoomRound,
    startRoomRound,
    subscribeRoomPlayers,
    subscribeRoomState,
    submitRoundResult,
    setPlayerOffline,
    touchPlayerPresence,
    updateRoomBeat,
    updateRoomMode,
    updateRoomSilentBars,
    updateRoomTotalRounds,
} from './utils/lobbyApi';

// Listening phase = one full audio loop (8 beats / 2 bars) before silence.
const LISTENING_BEATS = 8;
// Lead time for the synchronized countdown (server-time domain).
const SYNC_LEAD_MS = 3500;

function getPlayerId() {
    if (typeof window === 'undefined') return createPlayerId('player');
    const storageKey = 'htt-player-id';
    const existing = window.localStorage.getItem(storageKey);
    if (existing) return existing;
    const next = createPlayerId('player');
    window.localStorage.setItem(storageKey, next);
    return next;
}

function getPlayerName() {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem('htt-player-name') || '';
}

function setPlayerName(value) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('htt-player-name', value);
}

export default function HoldTheTime() {
    const [selectedBeatId, setSelectedBeatId] = useState(BEATS[0].id);
    const [silentBars, setSilentBars] = useState(4);
    const [totalRounds, setTotalRounds] = useState(5);
    const [sessionMode, setSessionMode] = useState('solo');
    const [roomToken, setRoomToken] = useState('');
    const [roomId, setRoomId] = useState(null);
    const [roomState, setRoomState] = useState(null);
    const [roomPlayers, setRoomPlayers] = useState([]);
    const [playerId] = useState(() => getPlayerId());
    const [playerNameInput, setPlayerNameInput] = useState(() => getPlayerName());
    const [nameIntent, setNameIntent] = useState(null);
    const [joinError, setJoinError] = useState('');
    const [isSubmittingName, setIsSubmittingName] = useState(false);
    const [isStartingRound, setIsStartingRound] = useState(false);
    const [lobbyError, setLobbyError] = useState('');
    const [gameState, setGameState] = useState('setup');
    const [showAnalysis, setShowAnalysis] = useState(false);
    const [phase, setPhase] = useState('listening');
    const [tapCount, setTapCount] = useState(0);
    const [sessionProgress, setSessionProgress] = useState(0);
    const [analysis, setAnalysis] = useState(null);
    const [tapRipples, setTapRipples] = useState([]);
    const [previewingBeatId, setPreviewingBeatId] = useState(null);
    const [roundResults, setRoundResults] = useState([]);
    const [allResults, setAllResults] = useState([]);

    const previewAudioRef = useRef(null);
    const timerRefs = useRef([]);
    const clockRef = useRef(0);
    const sessionStartRef = useRef(0);
    const silenceStartRef = useRef(0);
    const hasTriggeredSilenceRef = useRef(false);
    const tapEntriesRef = useRef([]);
    const audioCtxRef = useRef(null);
    const sourceNodeRef = useRef(null);
    const gainNodeRef = useRef(null);
    const activeRoundRef = useRef(0);
    const activeRoundIdRef = useRef(null);
    const autoJoinFromStorageRef = useRef(false);
    const selectedBeatIdRef = useRef(BEATS[0].id);
    const silentBarsRef = useRef(4);
    const pendingBeatIdRef = useRef(null);
    const silentBarsTimeoutRef = useRef(null);
    const totalRoundsTimeoutRef = useRef(null);
    // Synchronized-start (countdown) refs/state.
    const serverOffsetRef = useRef(0); // serverTimeMs - Date.now()
    const anchorTimerRef = useRef(null); // setTimeout to fire startSession at the anchor
    const countdownIntervalRef = useRef(null); // interval driving the visible countdown
    const countdownTargetWallRef = useRef(0); // Date.now() target instant for the start
    const scheduledAnchorKeyRef = useRef(null); // dedupes start scheduling across realtime events
    const sessionModeRef = useRef('solo'); // fresh mode for closures inside the room effect
    const isHostRef = useRef(false); // fresh host flag for closures inside the room effect
    const [countdownValue, setCountdownValue] = useState(0);
    const [syncError, setSyncError] = useState(false);

    const isMobile = useIsMobile();
    const [isClient, setIsClient] = useState(false);

    const selectedBeat = useMemo(() => BEATS.find((beat) => beat.id === selectedBeatId) || BEATS[0], [selectedBeatId]);
    const beatMs = 60000 / selectedBeat.bpm;
    const triggerTaps = 8;
    const hostPlayerId = useMemo(() => roomPlayers.find((player) => player.role === 'host')?.id || null, [roomPlayers]);
    const isHost = hostPlayerId != null && hostPlayerId === playerId;
    const roundResultMap = useMemo(() => {
        const map = new Map();
        roundResults.forEach((item) => map.set(item.player_id, item));
        return map;
    }, [roundResults]);
    const pendingPlayers = useMemo(() => roomPlayers.filter((player) => !roundResultMap.has(player.id)), [roomPlayers, roundResultMap]);
    const canAdvanceRound = pendingPlayers.length === 0;
    const roomLink = useMemo(() => {
        if (!isClient || !roomToken) return '';
        return `${window.location.origin}/hold-the-time?room=${roomToken}`;
    }, [isClient, roomToken]);

    useEffect(() => {
        selectedBeatIdRef.current = selectedBeatId;
    }, [selectedBeatId]);

    useEffect(() => {
        silentBarsRef.current = silentBars;
    }, [silentBars]);

    useEffect(() => {
        sessionModeRef.current = sessionMode;
    }, [sessionMode]);

    useEffect(() => {
        isHostRef.current = isHost;
    }, [isHost]);

    const stopPreview = useCallback(() => {
        if (previewAudioRef.current) {
            previewAudioRef.current.pause();
            previewAudioRef.current = null;
        }
        setPreviewingBeatId(null);
    }, []);

    const clearSession = useCallback(() => {
        timerRefs.current.forEach((timerId) => clearTimeout(timerId));
        timerRefs.current = [];
        if (clockRef.current) cancelAnimationFrame(clockRef.current);
        clockRef.current = 0;
        if (anchorTimerRef.current) {
            clearTimeout(anchorTimerRef.current);
            anchorTimerRef.current = null;
        }
        if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
        }

        if (sourceNodeRef.current) {
            try {
                sourceNodeRef.current.stop();
                sourceNodeRef.current.disconnect();
            } catch {}
            sourceNodeRef.current = null;
        }

        if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
            audioCtxRef.current.close().catch(() => {});
        }
        audioCtxRef.current = null;

        setTapRipples([]);
        tapEntriesRef.current = [];
        setTapCount(0);
        setSessionProgress(0);
        hasTriggeredSilenceRef.current = false;
        silenceStartRef.current = 0;
    }, []);

    const restartToSetup = useCallback(() => {
        clearSession();
        activeRoundRef.current = 0;
        activeRoundIdRef.current = null;
        scheduledAnchorKeyRef.current = null;
        setAnalysis(null);
        setShowAnalysis(false);
        setGameState('setup');
        setPhase('listening');
        setJoinError('');
        setNameIntent(null);
        setRoomId(null);
        setRoomState(null);
        setRoomPlayers([]);
        setRoomToken('');
        setRoundResults([]);
        setAllResults([]);
        setRoomLinkInUrl('');
        setTotalRounds(5);
    }, [clearSession]);

    function setRoomLinkInUrl(token) {
        if (typeof window === 'undefined') return;
        const nextUrl = token ? `/hold-the-time?room=${token}` : '/hold-the-time';
        window.history.replaceState({}, '', nextUrl);
    }

    function openNameGate(intent, token = '') {
        stopPreview();
        clearSession();
        setAnalysis(null);
        setShowAnalysis(false);
        setRoundResults([]);
        setAllResults([]);
        setJoinError('');
        setLobbyError('');
        setNameIntent(intent);
        if (token) setRoomToken(token);
        setGameState('name');
        setPhase('listening');
    }

    function startSingleplayer() {
        setSessionMode('solo');
        // Keep the refs in sync synchronously: startSession reads them immediately,
        // before the state-driven effects that normally update them have run.
        sessionModeRef.current = 'solo';
        isHostRef.current = false;
        setRoomId(null);
        setRoomState(null);
        setRoomToken('');
        setRoomPlayers([]);
        setLobbyError('');
        setRoomLinkInUrl('');
        setGameState('running');
        startSession(selectedBeatId);
    }

    function createRoomFromSetup() {
        void (async () => {
            if (roomId) {
                try {
                    await leaveRoom({ roomId, playerId });
                } catch {}
            }

            setRoomId(null);
            setRoomState(null);
            setRoomPlayers([]);
            setRoundResults([]);
            setAllResults([]);
            setRoomToken('');
            setRoomLinkInUrl('');

            setSessionMode('online');
            setLobbyError('');
            openNameGate('create-online');
        })();
    }

    async function loadRoundData(currentRoomId, roundNumber) {
        const [round, all] = await Promise.all([
            listRoundResults(currentRoomId, roundNumber),
            listAllRoomResults(currentRoomId),
        ]);
        setRoundResults(round);
        setAllResults(all);
    }

    async function loadAllResults(currentRoomId) {
        const all = await listAllRoomResults(currentRoomId);
        setAllResults(all);
        setRoundResults([]);
    }

    async function submitNameAndContinue() {
        const cleanName = playerNameInput.trim();
        if (!cleanName || !nameIntent) return;

        setIsSubmittingName(true);
        setJoinError('');

        try {
            setPlayerName(cleanName);

            if (nameIntent === 'join') {
                const room = await getRoomByToken(roomToken);

                if (roomId && roomId !== room.id) {
                    try {
                        await leaveRoom({ roomId, playerId });
                    } catch {}
                }

                await joinRoom({ roomId: room.id, playerId, playerName: cleanName });
                const state = await getRoomState(room.id);
                const players = await listRoomPlayers(room.id);

                setSessionMode(room.mode || 'online');
                setRoomId(room.id);
                setRoomState(state);
                setRoomPlayers(players);
                // If our player row no longer appears, check if we've been banned
                try {
                    const myRow = await getRoomPlayer(roomId, playerId);
                    if (myRow && myRow.is_banned) {
                        setJoinError('You were banned from this room');
                        restartToSetup();
                        return;
                    }
                } catch {
                    // ignore errors here
                }
                setRoomToken(room.token);
                setSilentBars(room.silent_bars || 4);
                setSelectedBeatId(state.current_beat_id || room.beat_id || BEATS[0].id);
                setRoomLinkInUrl(room.token);
                setNameIntent(null);

                if (state.phase === 'lobby') {
                    setGameState('lobby');
                } else if (state.phase === 'running') {
                    activeRoundRef.current = state.current_round;
                    activeRoundIdRef.current = state.active_round_id || null;
                    scheduledAnchorKeyRef.current = `${state.active_round_id || ''}:${state.round_starts_at || ''}`;
                    scheduleAnchoredStart(state);
                } else if (state.phase === 'round_result') {
                    setGameState('round-result');
                    await loadRoundData(room.id, state.current_round);
                } else {
                    setGameState('final');
                    await loadAllResults(room.id);
                }
            } else {
                if (roomId) {
                    try {
                        await leaveRoom({ roomId, playerId });
                    } catch {}
                }

                const nextToken = createRoomToken();
                const room = await createRoom({
                    roomToken: nextToken,
                    mode: 'online',
                    beatId: selectedBeatId,
                    silentBars,
                    hostPlayerId: playerId,
                    hostName: cleanName,
                    totalRounds,
                });

                const players = await listRoomPlayers(room.id);
                const state = await getRoomState(room.id);

                setRoomId(room.id);
                setRoomState(state);
                setRoomPlayers(players);
                setTotalRounds(state.total_rounds || 5);
                setRoomToken(room.token);
                setRoomLinkInUrl(room.token);
                setNameIntent(null);
                setGameState('lobby');
            }
        } catch (error) {
            const actionLabel = nameIntent === 'join' ? 'Join failed' : 'Create failed';
            const message = `${error?.message || ''}`.toLowerCase();
            if (message.includes('is_online') || message.includes('last_seen_at') || message.includes('first_tap_at') || message.includes('is_banned') || message.includes('sync_failed') || message.includes('column')) {
                setJoinError(`${actionLabel}: run latest SQL migration`);
            } else {
                setJoinError(`${actionLabel}: ${error?.message || 'Unknown error'}`);
            }
        } finally {
            setIsSubmittingName(false);
        }
    }

    async function handleLobbyStart() {
        if (!isHost || !roomId || isStartingRound) return;
        if (gameState === 'round-result' && !canAdvanceRound) {
            setLobbyError('Wait or kick');
            return;
        }

        // Ensure everyone is online and ready before starting
        const notReadyOrOffline = roomPlayers.filter((p) => !(p.ready && p.isOnline));
        if (notReadyOrOffline.length > 0) {
            setLobbyError('Everyone must be online and ready');
            return;
        }

        setLobbyError('');
        setIsStartingRound(true);
        try {
            // Wait for any pending debounced updates to sync
            if (silentBarsTimeoutRef.current || totalRoundsTimeoutRef.current) {
                await new Promise((resolve) => {
                    const checkCompletion = () => {
                        if (!silentBarsTimeoutRef.current && !totalRoundsTimeoutRef.current) {
                            resolve();
                        } else {
                            setTimeout(checkCompletion, 50);
                        }
                    };
                    checkCompletion();
                });
            }

            const roundStartsAt = computeRoundStartsAt();
            await startRoomRound({ roomId, beatId: selectedBeatId, roundStartsAt });
            // Schedule the countdown immediately from authoritative state instead of
            // waiting on the realtime round-trip; the realtime echo is de-duped by
            // scheduledAnchorKeyRef so we never double-schedule.
            const state = await getRoomState(roomId);
            activeRoundRef.current = state.current_round;
            activeRoundIdRef.current = state.active_round_id || null;
            scheduledAnchorKeyRef.current = `${state.active_round_id || ''}:${state.round_starts_at || ''}`;
            scheduleAnchoredStart(state);
        } catch {
            setLobbyError('Start failed');
        } finally {
            setIsStartingRound(false);
        }
    }

    // Compute a start anchor in the server-time domain so every device converts it
    // back to its own clock with serverOffsetRef and lands the countdown together.
    function computeRoundStartsAt(leadMs = SYNC_LEAD_MS) {
        const serverNowMs = Date.now() + serverOffsetRef.current;
        return new Date(serverNowMs + leadMs).toISOString();
    }

    // Host-only: re-anchor the current round to a fresh countdown so everyone
    // (including any client that drifted or got stuck) restarts together.
    async function handleRestartRound() {
        if (!isHostRef.current || !roomId) return;
        try {
            const roundStartsAt = computeRoundStartsAt();
            await rescheduleRoomRound(roomId, roundStartsAt);
            const state = await getRoomState(roomId);
            scheduledAnchorKeyRef.current = `${state.active_round_id || ''}:${state.round_starts_at || ''}`;
            scheduleAnchoredStart(state);
        } catch {}
    }

    // Read the server clock a handful of times and keep the lowest-RTT sample to
    // estimate this device's offset to server time (NTP-style).
    async function refreshServerOffset() {
        let best = null;
        for (let i = 0; i < 5; i += 1) {
            try {
                const t0 = Date.now();
                const serverMs = await getServerNow();
                const t1 = Date.now();
                const rtt = t1 - t0;
                const offset = (serverMs + rtt / 2) - t1;
                if (!best || rtt < best.rtt) best = { rtt, offset };
            } catch {
                return; // htt_now() not deployed yet — keep previous (0) offset
            }
        }
        if (best) serverOffsetRef.current = best.offset;
    }

    // Convert the room's server-time anchor into this device's clock, run the
    // visible countdown, then start the session at exactly that instant. Used by
    // host and clients alike, on first start and on restart.
    function scheduleAnchoredStart(state) {
        const beatId = state.current_beat_id || state.beat_id || BEATS[0].id;
        clearSession();
        setSyncError(false);
        setLobbyError('');
        setSelectedBeatId(beatId);

        if (!state.round_starts_at) {
            // No anchor (older room / fallback) — start right away.
            setGameState('running');
            startSession(beatId);
            return;
        }

        const startWall = new Date(state.round_starts_at).getTime() - serverOffsetRef.current;
        const delay = startWall - Date.now();

        if (delay <= 80) {
            // Anchor already reached (e.g. joined late) — start immediately.
            setGameState('running');
            startSession(beatId);
            return;
        }

        countdownTargetWallRef.current = startWall;
        setCountdownValue(Math.max(1, Math.ceil(delay / 1000)));
        setGameState('countdown');

        countdownIntervalRef.current = window.setInterval(() => {
            const remaining = countdownTargetWallRef.current - Date.now();
            setCountdownValue(Math.max(0, Math.ceil(remaining / 1000)));
            if (remaining <= 0 && countdownIntervalRef.current) {
                clearInterval(countdownIntervalRef.current);
                countdownIntervalRef.current = null;
            }
        }, 100);

        anchorTimerRef.current = window.setTimeout(() => {
            anchorTimerRef.current = null;
            startSession(beatId);
        }, delay);
    }

    async function handleChangeBeat(direction) {
        if (!isHost || !roomId) return;
        const currentIndex = BEATS.findIndex((beat) => beat.id === selectedBeatIdRef.current);
        const nextIndex = direction === 'next'
            ? (currentIndex + 1) % BEATS.length
            : (currentIndex - 1 + BEATS.length) % BEATS.length;
        const nextBeat = BEATS[nextIndex];
        pendingBeatIdRef.current = nextBeat.id;
        setSelectedBeatId(nextBeat.id);

        try {
            await updateRoomBeat(roomId, nextBeat.id);
        } catch {
            if (pendingBeatIdRef.current === nextBeat.id) {
                pendingBeatIdRef.current = null;
            }
            setSelectedBeatId(selectedBeatIdRef.current);
        }
    }

    async function handleChangeTotalRounds(oldTotalRounds, newTotalRounds) {
        if (!isHost || !roomId) return;

        setTotalRounds(newTotalRounds);

        if (totalRoundsTimeoutRef.current) {
            clearTimeout(totalRoundsTimeoutRef.current);
        }

        totalRoundsTimeoutRef.current = setTimeout(async () => {
            try {
                await updateRoomTotalRounds(roomId, newTotalRounds);
                totalRoundsTimeoutRef.current = null;
            } catch (error) {
                setLobbyError(`Failed to update rounds: ${error?.message || 'Unknown error'}`);
                totalRoundsTimeoutRef.current = null;
            }
        }, 500);
    }

    async function handleChangeSilentBars(oldSilentBars, newSilentBars) {
        if (!isHost || !roomId) return;

        setSilentBars(newSilentBars);
        silentBarsRef.current = newSilentBars;

        if (silentBarsTimeoutRef.current) {
            clearTimeout(silentBarsTimeoutRef.current);
        }

        silentBarsTimeoutRef.current = setTimeout(async () => {
            try {
                await updateRoomSilentBars(roomId, newSilentBars);
                silentBarsTimeoutRef.current = null;
            } catch (error) {
                setLobbyError(`Failed to update silent bars: ${error?.message || 'Unknown error'}`);
                silentBarsTimeoutRef.current = null;
            }
        }, 500);
    }

    async function handleChangeRoomMode(nextMode) {
        if (!isHost || !roomId || nextMode === sessionMode) return;

        setLobbyError('');
        setSessionMode(nextMode);

        try {
            await updateRoomMode(roomId, nextMode);
        } catch (error) {
            setSessionMode(roomState?.mode || 'online');
            setLobbyError(`Failed to update mode: ${error?.message || 'Unknown error'}`);
        }
    }

    async function handleOpenLobbyAgain() {
        if (!isHost || !roomId) return;
        await openLobbyAgain(roomId);
        activeRoundRef.current = 0;
        activeRoundIdRef.current = null;
        setRoundResults([]);
        setAllResults([]);
        setAnalysis(null);
        setGameState('lobby');
    }

    async function handleKickPlayer(targetPlayerId) {
        if (!isHost || !roomId || !targetPlayerId || targetPlayerId === playerId) return;
        try {
            await kickRoomPlayer({ roomId, playerId: targetPlayerId });
            // optimistic local update so UI responds immediately
            setRoomPlayers((prev) => prev.filter((p) => p.id !== targetPlayerId));
        } catch {}
    }

    async function handleBanPlayer(targetPlayerId) {
        if (!isHost || !roomId || !targetPlayerId || targetPlayerId === playerId) return;
        try {
            await banRoomPlayer({ roomId, playerId: targetPlayerId });
            setRoomPlayers((prev) => prev.filter((p) => p.id !== targetPlayerId));
        } catch {}
    }

    function startPreview(beatId) {
        if (previewingBeatId === beatId) return;
        stopPreview();

        const beat = BEATS.find((b) => b.id === beatId);
        if (!beat) return;

        const audio = new Audio(beat.src);
        audio.loop = false;
        audio.onended = () => stopPreview();
        audio.play().catch(() => {});
        previewAudioRef.current = audio;
        setPreviewingBeatId(beatId);
    }

    async function startSession(beatIdOverride = selectedBeatId) {
        stopPreview();
        clearSession();
        setSyncError(false);
        setShowAnalysis(false);
        setSelectedBeatId(beatIdOverride);
        setGameState('running');
        setPhase('listening');
        sessionStartRef.current = performance.now();

        const mode = sessionModeRef.current;
        const host = isHostRef.current;
        // In local (one-device) mode the round runs on a fixed, host-anchored
        // timeline so every device is scored against the exact same silence gap.
        const isLocalAnchored = mode === 'local';
        const shouldPlayAudio = mode !== 'local' || host;

        if (shouldPlayAudio) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            const ctx = new AudioContext();
            const unmute = (await import('iosunmute')).default;
            unmute(ctx);
            audioCtxRef.current = ctx;
            if (ctx.state !== 'running') {
                ctx.resume().catch(() => {});
            }

            const beat = BEATS.find((item) => item.id === beatIdOverride) || BEATS[0];
            const response = await fetch(beat.src);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

            const source = ctx.createBufferSource();
            const gainNode = ctx.createGain();

            source.buffer = audioBuffer;
            source.loop = true;

            const exactLoopLengthSec = (60 / beat.bpm) * 4 * 2;
            source.loopStart = 0;
            source.loopEnd = exactLoopLengthSec;

            source.connect(gainNode);
            gainNode.connect(ctx.destination);

            sourceNodeRef.current = source;
            gainNodeRef.current = gainNode;

            source.start(ctx.currentTime);

            // Local mode fades the (host) audio at the listening boundary, beat-aligned.
            if (isLocalAnchored) {
                const beatMsLocal = 60000 / beat.bpm;
                const listeningSec = (LISTENING_BEATS * beatMsLocal) / 1000;
                const silentSec = (silentBarsRef.current * beatMsLocal * 4) / 1000;
                const fadeStartSec = ctx.currentTime + listeningSec;
                gainNode.gain.cancelScheduledValues(ctx.currentTime);
                gainNode.gain.setValueAtTime(1, Math.max(ctx.currentTime, fadeStartSec - 0.05));
                gainNode.gain.linearRampToValueAtTime(0, fadeStartSec);
                const returnSec = fadeStartSec + silentSec;
                gainNode.gain.setValueAtTime(0, returnSec - 0.05);
                gainNode.gain.linearRampToValueAtTime(1, returnSec);
            }
        }

        const updateClock = () => {
            setSessionProgress(performance.now());
            clockRef.current = requestAnimationFrame(updateClock);
        };
        clockRef.current = requestAnimationFrame(updateClock);

        if (isLocalAnchored) {
            // Deterministic timeline driven from the shared anchor (not the 8th tap).
            const beat = BEATS.find((item) => item.id === beatIdOverride) || BEATS[0];
            const beatMsLocal = 60000 / beat.bpm;
            const listeningMs = LISTENING_BEATS * beatMsLocal;
            const silentMs = silentBarsRef.current * beatMsLocal * 4;
            const returnMs = SCORING_CONFIG.returnBars * beatMsLocal * 4;

            hasTriggeredSilenceRef.current = true; // disable the solo tap-trigger
            timerRefs.current.push(window.setTimeout(() => {
                setPhase('silence');
                silenceStartRef.current = sessionStartRef.current + listeningMs;
            }, listeningMs));
            timerRefs.current.push(window.setTimeout(() => setPhase('return'), listeningMs + silentMs));
            timerRefs.current.push(window.setTimeout(() => finishSession(), listeningMs + silentMs + returnMs));
        }
    }

    async function finishSession() {
        const actualActiveMs = silenceStartRef.current > 0
            ? silenceStartRef.current - sessionStartRef.current
            : triggerTaps * beatMs;

        const result = analyzeSession({
            taps: tapEntriesRef.current,
            beatMs,
            actualActiveMs,
            silentBars,
            returnBars: SCORING_CONFIG.returnBars,
        });

        // A player who didn't tap (or tapped too little to score) gets a null
        // result. Treat it as a zero score so the round can still finalize for
        // everyone instead of crashing / blocking on the missing submission.
        const scored = result || { score: 0, consistencyScore: 0, accuracyScore: 0 };

        if (sessionMode === 'solo' || !roomId || !roomState) {
            clearSession();
            if (result) {
                setAnalysis(result);
                setGameState('results');
            } else {
                // Nothing to analyze (no taps) — go back to setup rather than show an empty card.
                setAnalysis(null);
                setGameState('setup');
            }
            setPhase('return');
            return;
        }

        const roundNumber = roomState.current_round || activeRoundRef.current || 1;
        const playerName = playerNameInput.trim() || 'Player';

        await submitRoundResult({
            roomId,
            roundNumber,
            playerId,
            playerName,
            score: scored.score,
            consistencyScore: scored.consistencyScore,
            accuracyScore: scored.accuracyScore,
            analysis: result,
        });

        await finalizeRoundIfComplete(roomId, roundNumber);
        const isLastRound = roundNumber >= (roomState?.total_rounds || 5);
        if (!isLastRound) {
            await loadRoundData(roomId, roundNumber);
        }

        clearSession();
        setAnalysis(result);
        if (isLastRound) {
            setGameState('waiting');
        } else {
            setGameState('round-result');
        }
        setPhase('return');
    }

    function spawnRipple(event) {
        if (event && event.isKeyboard) return;

        let x = 50;
        let y = 50;
        if (event && event.currentTarget && !event.isKeyboard) {
            const rect = event.currentTarget.getBoundingClientRect();
            if (rect.width && rect.height) {
                const point = event.clientX != null && event.clientY != null
                    ? { clientX: event.clientX, clientY: event.clientY }
                    : event.changedTouches?.[0];
                if (point) {
                    x = ((point.clientX - rect.left) / rect.width) * 100;
                    y = ((point.clientY - rect.top) / rect.height) * 100;
                }
            }
        }

        const ripple = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, x, y };
        setTapRipples((current) => [...current, ripple]);
        window.setTimeout(() => {
            setTapRipples((current) => current.filter((item) => item.id !== ripple.id));
        }, 350);
    }

    function triggerSilencePhase() {
        setPhase('silence');
        silenceStartRef.current = performance.now();

        const silentMs = silentBars * beatMs * 4;
        const returnMs = SCORING_CONFIG.returnBars * beatMs * 4;

        if (gainNodeRef.current && audioCtxRef.current) {
            const ctx = audioCtxRef.current;
            const nowAudio = ctx.currentTime;
            const silentSecs = silentMs / 1000;

            gainNodeRef.current.gain.cancelScheduledValues(nowAudio);
            gainNodeRef.current.gain.setValueAtTime(gainNodeRef.current.gain.value, nowAudio);
            gainNodeRef.current.gain.linearRampToValueAtTime(0, nowAudio + 0.05);

            const returnAudioTime = nowAudio + silentSecs;
            gainNodeRef.current.gain.setValueAtTime(0, returnAudioTime - 0.05);
            gainNodeRef.current.gain.linearRampToValueAtTime(1, returnAudioTime);
        }

        timerRefs.current.push(window.setTimeout(() => setPhase('return'), silentMs));
        timerRefs.current.push(window.setTimeout(() => {
            finishSession();
        }, silentMs + returnMs));
    }

    function recordTap(event) {
        if (gameState !== 'running') return;

        if (syncError) return;

        const time = performance.now() - sessionStartRef.current;
        if (tapEntriesRef.current.length > 0) {
            const lastTime = tapEntriesRef.current[tapEntriesRef.current.length - 1].time;
            if (time - lastTime < 150) return;
        }

        event?.preventDefault?.();
        tapEntriesRef.current.push({ time });

        const newCount = tapEntriesRef.current.length;
        setTapCount(newCount);
        spawnRipple(event);

        // Solo mode: the 8th tap triggers the silence phase. In local mode the
        // timeline is anchored (hasTriggeredSilenceRef is pre-set), so this is inert.
        if (phase === 'listening' && newCount === triggerTaps && !hasTriggeredSilenceRef.current) {
            hasTriggeredSilenceRef.current = true;
            window.setTimeout(() => {
                triggerSilencePhase();
            }, beatMs);
        }
    }

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsClient(true);

        const params = new URLSearchParams(window.location.search);
        const joinToken = params.get('room');
        if (joinToken) {
            setRoomToken(joinToken.toUpperCase());
            openNameGate('join', joinToken.toUpperCase());
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const handlePopState = () => {
            const params = new URLSearchParams(window.location.search);
            const currentRoom = params.get('room');
            
            if (!currentRoom && gameState !== 'setup') {
                restartToSetup();
            }
        };

        window.addEventListener('popstate', handlePopState);
        
        let lastUrl = window.location.href;
        const checkUrlChange = setInterval(() => {
            if (window.location.href !== lastUrl) {
                lastUrl = window.location.href;
                handlePopState();
            }
        }, 100);

        return () => {
            window.removeEventListener('popstate', handlePopState);
            clearInterval(checkUrlChange);
        };
    }, [gameState, restartToSetup]);


    useEffect(() => {
        const handleGlobalKeyDown = (e) => {
            if (e.repeat) return;

            if (gameState === 'name' && e.key === 'Enter') {
                e.preventDefault();
                submitNameAndContinue();
                return;
            }

            if (gameState === 'setup') {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    startSingleplayer();
                } else if (e.key === ' ') {
                    e.preventDefault();
                    startPreview(selectedBeatId);
                } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                    e.preventDefault();
                    const idx = BEATS.findIndex((beat) => beat.id === selectedBeatId);
                    if (idx > 0) setSelectedBeatId(BEATS[idx - 1].id);
                } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                    e.preventDefault();
                    const idx = BEATS.findIndex((beat) => beat.id === selectedBeatId);
                    if (idx < BEATS.length - 1) setSelectedBeatId(BEATS[idx + 1].id);
                }
            } else if (gameState === 'running' && !isMobile) {
                if (e.key === ' ') {
                    e.preventDefault();
                    recordTap({ isKeyboard: true });
                }
            } else if (gameState === 'lobby' && e.key === 'Enter' && isHost) {
                e.preventDefault();
                handleLobbyStart();
            } else if ((gameState === 'round-result' || gameState === 'final') && e.key === 'Enter') {
                e.preventDefault();
                if (isHost && roomState?.phase === 'final') {
                    handleOpenLobbyAgain();
                }
            }

            if (e.key === 'Escape') {
                e.preventDefault();
                clearSession();
                setGameState('setup');
                setPhase('listening');
            }
        };

        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gameState, isMobile, selectedBeatId, isHost, roomState?.phase, playerNameInput, nameIntent, restartToSetup, clearSession]);

    useEffect(() => {
        return () => {
            timerRefs.current.forEach((timerId) => clearTimeout(timerId));
            if (clockRef.current) cancelAnimationFrame(clockRef.current);
            stopPreview();
            clearSession();
        };
    }, [clearSession, stopPreview]);

    useEffect(() => {
        if (!roomId) return;

        let active = true;

        const syncRoom = async () => {
            try {
                const [state, players] = await Promise.all([
                    getRoomState(roomId),
                    listRoomPlayers(roomId),
                ]);

                if (!active) return;

                setRoomState(state);
                setRoomPlayers(players);

                const nextSilentBars = state.silent_bars || 4;
                if (nextSilentBars !== silentBarsRef.current) {
                    setSilentBars(nextSilentBars);
                }

                if (!isHost) {
                    const nextTotalRounds = state.total_rounds || 5;
                    setTotalRounds(nextTotalRounds);
                }

                // If our player row no longer appears, check if we've been banned
                try {
                    const myRow = await getRoomPlayer(roomId, playerId);
                    if (myRow && myRow.is_banned) {
                        setJoinError('You were banned from this room');
                        restartToSetup();
                        return;
                    }
                } catch {
                    // ignore errors here
                }

                const nextBeatId = state.current_beat_id || state.beat_id || BEATS[0].id;
                const pendingBeatId = pendingBeatIdRef.current;
                if (pendingBeatId) {
                    if (nextBeatId === pendingBeatId) {
                        pendingBeatIdRef.current = null;
                    }
                } else if (nextBeatId !== selectedBeatIdRef.current) {
                    setSelectedBeatId(nextBeatId);
                }

                if (state.phase === 'lobby') {
                    activeRoundRef.current = 0;
                    activeRoundIdRef.current = null;
                    scheduledAnchorKeyRef.current = null;
                    pendingBeatIdRef.current = null;
                    setSessionMode(state.mode || 'online');
                    setGameState('lobby');
                    setIsStartingRound(false);
                } else if (state.phase === 'running') {
                    // (Re)schedule the synchronized countdown whenever the round or its
                    // start anchor changes. The key dedupes the realtime echoes so we
                    // never restart an already-scheduled round. A changed round_starts_at
                    // (host "Restart round") re-keys and resumes everyone together.
                    const nextActiveRoundId = state.active_round_id || null;
                    const anchorKey = `${nextActiveRoundId || ''}:${state.round_starts_at || ''}`;
                    if (anchorKey !== scheduledAnchorKeyRef.current) {
                        scheduledAnchorKeyRef.current = anchorKey;
                        activeRoundRef.current = state.current_round;
                        activeRoundIdRef.current = nextActiveRoundId;
                        setLobbyError('');
                        setIsStartingRound(false);
                        scheduleAnchoredStart(state);
                    }
                } else if (state.phase === 'round_result') {
                    // On last round, show waiting screen instead of round results
                    if (state.current_round >= state.total_rounds) {
                        setGameState('waiting');
                        await loadAllResults(roomId);
                    } else {
                        setGameState('round-result');
                        await loadRoundData(roomId, state.current_round);
                    }
                } else if (state.phase === 'final') {
                    setGameState('final');
                    await loadAllResults(roomId);
                }
            } catch {}
        };

        syncRoom();

        const unsubscribeRoom = subscribeRoomState(roomId, syncRoom);
        const unsubscribePlayers = subscribeRoomPlayers(roomId, syncRoom);

        return () => {
            active = false;
            unsubscribeRoom();
            unsubscribePlayers();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [roomId]);

    useEffect(() => {
        if (!roomId) return;

        let active = true;
        const touch = async () => {
            if (!active) return;
            try {
                await touchPlayerPresence({ roomId, playerId });
            } catch {}
        };

        touch();
        const timerId = window.setInterval(touch, 8000);

        const handleVisibility = () => {
            if (document.visibilityState === 'hidden') {
                setPlayerOffline({ roomId, playerId }).catch(() => {});
            } else {
                touch();
            }
        };

        document.addEventListener('visibilitychange', handleVisibility);
        window.addEventListener('beforeunload', handleVisibility);

        return () => {
            active = false;
            clearInterval(timerId);
            document.removeEventListener('visibilitychange', handleVisibility);
            window.removeEventListener('beforeunload', handleVisibility);
            setPlayerOffline({ roomId, playerId }).catch(() => {});
        };
    }, [roomId, playerId]);

    useEffect(() => {
        if (gameState !== 'name' || nameIntent !== 'join' || !playerNameInput.trim()) return;
        if (!autoJoinFromStorageRef.current) return;
        autoJoinFromStorageRef.current = false;
        submitNameAndContinue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gameState, nameIntent, playerNameInput]);

    useEffect(() => {
        if (!roomId) return;
        let active = true;
        const run = async () => {
            if (!active) return;
            await refreshServerOffset();
        };
        run();
        const id = window.setInterval(run, 30000);
        return () => {
            active = false;
            clearInterval(id);
        };
    }, [roomId]);

    useEffect(() => {
        return () => {
            if (silentBarsTimeoutRef.current) clearTimeout(silentBarsTimeoutRef.current);
            if (totalRoundsTimeoutRef.current) clearTimeout(totalRoundsTimeoutRef.current);
        };
    }, []);

    if (!isClient) return <div className="loading-placeholder" />;

    const desktopWidth = gameState === 'results' || gameState === 'final' ? '55rem' : gameState === 'lobby' || gameState === 'round-result' ? 'auto' : gameState === 'name' ? '25rem' : '30rem';
    let desktopHeight = '32rem';
    const mobileHeight = '100%';

    if (gameState === 'setup') desktopHeight = '40rem';
    if (gameState === 'lobby') desktopHeight = 'auto';
    if (gameState === 'name') desktopHeight = '20rem';
    if (gameState === 'running' || gameState === 'countdown') desktopHeight = '34rem';
    if (gameState === 'results' || gameState === 'round-result' || gameState === 'waiting' || gameState === 'final') desktopHeight = 'auto';

    const multiplayerRoundNumber = roomState?.current_round || 0;
    const multiplayerTotalRounds = roomState?.total_rounds || 5;

    return (
        <div className="flex flex-col w-full flex-1 px-2 md:px-4 md:py-4 min-h-0 justify-center items-center">
            <GameContainer desktopWidth={desktopWidth} desktopHeight={desktopHeight} mobileHeight={mobileHeight}>
                <div className="flex flex-1 flex-col p-4 md:p-8 w-full h-full min-h-0">
                    {gameState === 'setup' && (
                        <SetupView
                            silentBars={silentBars}
                            setSilentBars={setSilentBars}
                            selectedBeatId={selectedBeatId}
                            setSelectedBeatId={setSelectedBeatId}
                            actionButtons={[
                                { id: 'solo', label: 'Start Singleplayer', onClick: startSingleplayer, style: 'primary' },
                                { id: 'online', label: 'Create Online Room', onClick: createRoomFromSetup },
                            ]}
                            previewingBeatId={previewingBeatId}
                            onPreviewStart={startPreview}
                            isMobile={isMobile}
                        />
                    )}

                    {gameState === 'name' && (
                        <div className="flex h-full w-full flex-col justify-center gap-4">
                            <input
                                value={playerNameInput}
                                onChange={(event) => setPlayerNameInput(event.target.value)}
                                maxLength={24}
                                placeholder="Name"
                                className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-stone-100 outline-none"
                            />
                            {joinError && <div className="text-sm text-rose-300">{joinError}</div>}
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={restartToSetup}
                                    className="flex-1 rounded-full bg-stone-700 px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-stone-100 hover:bg-stone-600"
                                >
                                    Back
                                </button>
                                <button
                                    type="button"
                                    disabled={isSubmittingName || !playerNameInput.trim()}
                                    onClick={submitNameAndContinue}
                                    className="flex-1 rounded-full bg-stone-200 px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-neutral-950 disabled:opacity-60"
                                >
                                    {isSubmittingName ? 'Loading' : 'Continue'}
                                </button>
                            </div>
                        </div>
                    )}

                    {gameState === 'lobby' && (
                        <MultiplayerLobbyView
                            mode={sessionMode}
                            roomLink={roomLink}
                            players={roomPlayers}
                            isHost={isHost}
                            isStartingRound={isStartingRound}
                            errorMessage={lobbyError}
                            silentBars={silentBars}
                            totalRounds={isHost ? totalRounds : (roomState?.total_rounds || 5)}
                            onBackToSetup={restartToSetup}
                            onStartRound={handleLobbyStart}
                            onKickPlayer={handleKickPlayer}
                            onBanPlayer={handleBanPlayer}
                            onChangeSilentBars={handleChangeSilentBars}
                            onChangeTotalRounds={handleChangeTotalRounds}
                            onChangeRoomMode={handleChangeRoomMode}
                        />
                    )}

                    {gameState === 'countdown' && (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-6 text-center">
                            <div className="text-[11px] uppercase tracking-[0.24em] text-neutral-500">
                                {sessionMode === 'local' && !isHost ? "Tap to the host's beat" : 'Get ready'}
                            </div>
                            <div className="text-8xl font-black tabular-nums text-stone-100">
                                {countdownValue > 0 ? countdownValue : 'GO'}
                            </div>
                            <div className="text-sm uppercase tracking-[0.2em] text-neutral-400">
                                {selectedBeat.name} · {selectedBeat.bpm} BPM
                            </div>
                            {isHost && (
                                <button
                                    type="button"
                                    onClick={handleRestartRound}
                                    className="mt-2 rounded-full border border-white/10 bg-transparent px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400 hover:text-stone-100"
                                >
                                    Restart
                                </button>
                            )}
                        </div>
                    )}

                    {gameState === 'running' && (
                        <PlayView
                            subLabel={phase === 'listening' ? 'Listening' : phase === 'silence' ? 'Silence Phase' : 'Return Phase'}
                            labels={isMobile ? {
                                listening: 'Tap with the beat',
                                silence: 'Keep the pulse',
                                return: 'Beat returns'
                            } : {
                                listening: 'Press Spacebar with the beat',
                                silence: 'Keep the pulse',
                                return: 'Beat returns'
                            }}
                            progressPct={phase === 'listening'
                                ? (sessionMode === 'local'
                                    ? clamp(((sessionProgress - sessionStartRef.current) / (LISTENING_BEATS * beatMs)) * 100, 0, 100)
                                    : clamp((tapCount / triggerTaps) * 100, 0, 100))
                                : phase === 'silence'
                                    ? clamp(100 - (((sessionProgress - silenceStartRef.current) / (silentBars * beatMs * 4)) * 100), 0, 100)
                                    : clamp((((sessionProgress - (silenceStartRef.current + (silentBars * beatMs * 4))) / (SCORING_CONFIG.returnBars * beatMs * 4)) * 100), 0, 100)}
                            onTap={recordTap}
                            beatName={selectedBeat.name}
                            bpm={selectedBeat.bpm}
                            isMobile={isMobile}
                            setTapRipples={setTapRipples}
                            phase={phase}
                            syncError={syncError}
                            isHost={isHost}
                            canRestart={isHost && sessionMode === 'local'}
                            onRestartRound={handleRestartRound}
                        />
                    )}

                    {gameState === 'results' && analysis && (
                        <ResultView
                            analysis={analysis}
                            selectedBeat={selectedBeat}
                            onPlayAgain={startSingleplayer}
                            onBackToSetup={restartToSetup}
                            isMobile={isMobile}
                            showAnalysis={showAnalysis}
                            onToggleAnalysis={() => setShowAnalysis(!showAnalysis)}
                        />
                    )}

                    {gameState === 'round-result' && (
                        <MultiplayerResultsView
                            mode={sessionMode}
                            roomPhase={roomState?.phase || gameState}
                            currentRound={multiplayerRoundNumber}
                            totalRounds={multiplayerTotalRounds}
                            currentBeatId={selectedBeatId}
                            roomPlayers={roomPlayers}
                            roundResults={roundResults}
                            allResults={allResults}
                            isHost={isHost}
                            selfPlayerId={playerId}
                            canAdvance={canAdvanceRound}
                            pendingCount={pendingPlayers.length}
                            onKickPlayer={handleKickPlayer}
                            onNextRound={handleLobbyStart}
                            onOpenLobby={handleOpenLobbyAgain}
                            onChangeBeat={handleChangeBeat}
                        />
                    )}

                    {gameState === 'waiting' && (
                        <div className="flex h-full w-full items-center justify-center">
                            <div className="text-center">
                                <div className="text-xl font-semibold text-stone-100">Waiting for others to finish...</div>
                            </div>
                        </div>
                    )}

                    {gameState === 'final' && (
                        <MultiplayerFinalResults
                            roomPlayers={roomPlayers}
                            allResults={allResults}
                            isHost={isHost}
                            onOpenLobby={handleOpenLobbyAgain}
                        />
                    )}
                </div>

                {gameState === 'running' && tapRipples.map((ripple) => (
                    <div
                        key={ripple.id}
                        className="pointer-events-none absolute z-20 h-24 w-24 rounded-full"
                        style={{
                            left: `${ripple.x}%`, top: `${ripple.y}%`,
                            transform: 'translate(-50%, -50%)',
                            background: 'radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(125,211,252,0.7) 24%, rgba(34,211,238,0.22) 48%, transparent 72%)',
                            filter: 'drop-shadow(0 0 12px rgba(125,211,252,0.55))',
                            animation: 'tapRipple 0.35s ease-out forwards',
                        }}
                    />
                ))}
                <style jsx>{`
                    @keyframes tapRipple {
                        0% { opacity: 0.45; transform: translate(-50%, -50%) scale(0.7); }
                        100% { opacity: 0; transform: translate(-50%, -50%) scale(1.8); }
                    }
                `}</style>
            </GameContainer>
        </div>
    );
}
