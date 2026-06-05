import { createClient } from '@supabase/supabase-js';

// Store client in globalThis to persist across hot module reloads in development.
const globalForSupabase = globalThis;

function isMissingPlayerMetaColumnError(error) {
    const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
    return error?.code === '42703'
        || message.includes('is_online')
        || message.includes('last_seen_at')
        || message.includes('first_tap_at')
        || message.includes('is_banned');
}

// The synchronized-start anchor column (round_starts_at) ships in a later
// migration. Until it is applied, fall back gracefully so the room flow keeps
// working (it just starts immediately instead of via the countdown).
function isMissingRoundAnchorError(error) {
    const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
    return error?.code === '42703' || message.includes('round_starts_at');
}

const ROOM_COLUMNS = 'id, token, mode, beat_id, silent_bars, phase, current_round, total_rounds, current_beat_id, active_round_id, round_starts_at, locked_at';
const ROOM_COLUMNS_NO_ANCHOR = ROOM_COLUMNS.replace(', round_starts_at', '');

/**
 * Read the Postgres server clock (via the htt_now() RPC) as epoch milliseconds.
 * Used for NTP-style offset estimation so the synchronized-start countdown lands
 * together across devices regardless of each device's local wall-clock drift.
 */
export async function getServerNow() {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('htt_now');
    if (error) throw error;
    return new Date(data).getTime();
}

function getSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !anonKey) {
        throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
    }

    const cachedConfig = globalForSupabase.supabaseConfig;
    if (
        globalForSupabase.supabaseClient
        && cachedConfig?.url === url
        && cachedConfig?.anonKey === anonKey
    ) {
        return globalForSupabase.supabaseClient;
    }

    globalForSupabase.supabaseClient = createClient(url, anonKey);
    globalForSupabase.supabaseConfig = { url, anonKey };
    return globalForSupabase.supabaseClient;
}

export async function createRoom({ roomToken, mode, beatId, silentBars, hostPlayerId, hostName, totalRounds = 5 }) {
    const supabase = getSupabase();

    const { data: room, error: roomError } = await supabase
        .from('htt_rooms')
        .insert({
            token: roomToken,
            mode,
            beat_id: beatId,
            silent_bars: silentBars,
            phase: 'lobby',
            current_round: 0,
            total_rounds: totalRounds,
            current_beat_id: beatId,
        })
        .select('id, token, mode, beat_id, silent_bars, phase, current_round, total_rounds, current_beat_id')
        .single();

    if (roomError) throw roomError;

    const { error: playerError } = await supabase
        .from('htt_room_players')
        .insert({
            room_id: room.id,
            player_id: hostPlayerId,
            player_name: hostName,
            is_host: true,
            ready: true,
            first_tap_at: null,
            is_banned: false,
        });

    if (playerError && isMissingPlayerMetaColumnError(playerError)) {
        const { error: fallbackError } = await supabase
            .from('htt_room_players')
            .insert({
                room_id: room.id,
                player_id: hostPlayerId,
                player_name: hostName,
                is_host: true,
                ready: true,
            });

        if (fallbackError) throw fallbackError;
        return room;
    }

    if (playerError) throw playerError;
    return room;
}

export async function getRoomByToken(roomToken) {
    const supabase = getSupabase();
    const { data, error } = await supabase
        .from('htt_rooms')
        .select(ROOM_COLUMNS)
        .eq('token', roomToken)
        .single();

    if (error && isMissingRoundAnchorError(error)) {
        const { data: fallback, error: fallbackError } = await supabase
            .from('htt_rooms')
            .select(ROOM_COLUMNS_NO_ANCHOR)
            .eq('token', roomToken)
            .single();
        if (fallbackError) throw fallbackError;
        return { ...fallback, round_starts_at: null };
    }

    if (error) throw error;
    return data;
}

export async function joinRoom({ roomId, playerId, playerName }) {
    const supabase = getSupabase();

    const { data: room, error: roomError } = await supabase
        .from('htt_rooms')
        .select('phase')
        .eq('id', roomId)
        .single();

    if (roomError) throw roomError;

    // Try to check is_banned, with fallback
    let existingPlayer = null;
    try {
        const { data, error: existingPlayerError } = await supabase
            .from('htt_room_players')
            .select('id, is_banned')
            .eq('room_id', roomId)
            .eq('player_id', playerId)
            .maybeSingle();

        if (existingPlayerError && !isMissingPlayerMetaColumnError(existingPlayerError)) throw existingPlayerError;
        existingPlayer = data;
    } catch {
        // fallback: query without is_banned
        const { data, error } = await supabase
            .from('htt_room_players')
            .select('id')
            .eq('room_id', roomId)
            .eq('player_id', playerId)
            .maybeSingle();
        if (error) throw error;
        existingPlayer = data;
    }

    if (existingPlayer?.is_banned) {
        throw new Error('Player is banned');
    }
    if (room.phase !== 'lobby' && !existingPlayer) {
        throw new Error('Room locked');
    }

    const { error } = await supabase
        .from('htt_room_players')
        .upsert({
            room_id: roomId,
            player_id: playerId,
            player_name: playerName,
            first_tap_at: null,
            is_banned: false,
            is_online: true,
            last_seen_at: new Date().toISOString(),
            joined_at: new Date().toISOString(),
        }, {
            onConflict: 'room_id,player_id',
            ignoreDuplicates: false,
        });

    if (error && isMissingPlayerMetaColumnError(error)) {
        const { error: fallbackError } = await supabase
            .from('htt_room_players')
            .upsert({
                room_id: roomId,
                player_id: playerId,
                player_name: playerName,
                is_banned: false,
                joined_at: new Date().toISOString(),
            }, {
                onConflict: 'room_id,player_id',
                ignoreDuplicates: false,
            });

        if (fallbackError) throw fallbackError;
        return;
    }

    if (error) throw error;
}

export async function leaveRoom({ roomId, playerId }) {
    const supabase = getSupabase();
    const { error } = await supabase
        .from('htt_room_players')
        .delete()
        .eq('room_id', roomId)
        .eq('player_id', playerId);

    if (error) throw error;
}

export async function listRoomPlayers(roomId) {
    const supabase = getSupabase();
    const { data, error } = await supabase
        .from('htt_room_players')
        .select('player_id, player_name, is_host, ready, first_tap_at, is_banned, is_online, last_seen_at, joined_at')
        .eq('room_id', roomId)
        .eq('is_banned', false)
        .order('joined_at', { ascending: true });

    if (error && isMissingPlayerMetaColumnError(error)) {
        const { data: fallbackData, error: fallbackError } = await supabase
            .from('htt_room_players')
            .select('player_id, player_name, is_host, ready, joined_at')
            .eq('room_id', roomId)
            .order('joined_at', { ascending: true });

        if (fallbackError) throw fallbackError;

        return (fallbackData || []).map((player) => ({
            isOnline: true,
            lastSeenAt: null,
            isBanned: false,
            firstTapAt: null,
            id: player.player_id,
            name: player.player_name,
            role: player.is_host ? 'host' : 'player',
            ready: player.ready,
        }));
    }

    if (error) throw error;
    const nowMs = Date.now();
    return (data || []).map((player) => ({
        isOnline: Boolean(player.is_online) && (nowMs - new Date(player.last_seen_at).getTime()) < 20000,
        lastSeenAt: player.last_seen_at,
        firstTapAt: player.first_tap_at,
        isBanned: Boolean(player.is_banned),
        id: player.player_id,
        name: player.player_name,
        role: player.is_host ? 'host' : 'player',
        ready: player.ready,
    }));
}

export async function getRoomPlayer(roomId, playerId) {
    const supabase = getSupabase();
    try {
        const { data, error } = await supabase
            .from('htt_room_players')
            .select('player_id, player_name, is_host, ready, first_tap_at, is_banned, is_online, last_seen_at, joined_at')
            .eq('room_id', roomId)
            .eq('player_id', playerId)
            .maybeSingle();

        if (error && !isMissingPlayerMetaColumnError(error)) throw error;
        return data || null;
    } catch (e) {
        // Fallback: query without the new columns
        if (isMissingPlayerMetaColumnError(e)) {
            const { data, error } = await supabase
                .from('htt_room_players')
                .select('player_id, player_name, is_host, ready, joined_at')
                .eq('room_id', roomId)
                .eq('player_id', playerId)
                .maybeSingle();

            if (error) throw error;
            return data || null;
        }
        throw e;
    }
}

export async function markPlayerFirstTap({ roomId, playerId }) {
    const supabase = getSupabase();
    const { error } = await supabase
        .from('htt_room_players')
        .update({
            first_tap_at: new Date().toISOString(),
        })
        .eq('room_id', roomId)
        .eq('player_id', playerId)
        .is('first_tap_at', null);

    if (error && isMissingPlayerMetaColumnError(error)) return;
    if (error) throw error;
}

export async function resetRoomPlayerFirstTaps(roomId) {
    const supabase = getSupabase();
    const { error } = await supabase
        .from('htt_room_players')
        .update({
            first_tap_at: null,
        })
        .eq('room_id', roomId);

    if (error && isMissingPlayerMetaColumnError(error)) return;
    if (error) throw error;
}

export async function touchPlayerPresence({ roomId, playerId }) {
    const supabase = getSupabase();
    const { error } = await supabase
        .from('htt_room_players')
        .update({
            is_online: true,
            last_seen_at: new Date().toISOString(),
        })
        .eq('room_id', roomId)
        .eq('player_id', playerId);
    if (error && isMissingPlayerMetaColumnError(error)) return;
    if (error) throw error;
}

export async function setPlayerOffline({ roomId, playerId }) {
    const supabase = getSupabase();
    const { error } = await supabase
        .from('htt_room_players')
        .update({
            is_online: false,
            last_seen_at: new Date().toISOString(),
        })
        .eq('room_id', roomId)
        .eq('player_id', playerId);
    if (error && isMissingPlayerMetaColumnError(error)) return;
    if (error) throw error;
}

export async function kickRoomPlayer({ roomId, playerId }) {
    const supabase = getSupabase();
    const { error } = await supabase
        .from('htt_room_players')
        .delete()
        .eq('room_id', roomId)
        .eq('player_id', playerId);

    if (error) throw error;
}

export async function banRoomPlayer({ roomId, playerId }) {
    const supabase = getSupabase();
    const { error } = await supabase
        .from('htt_room_players')
        .update({
            is_banned: true,
            is_online: false,
            ready: false,
        })
        .eq('room_id', roomId)
        .eq('player_id', playerId);

    if (error && isMissingPlayerMetaColumnError(error)) return;
    if (error) throw error;
}

export function subscribeRoomPlayers(roomId, onChange) {
    const supabase = getSupabase();
    const channel = supabase
        .channel(`htt-room-${roomId}`)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'htt_room_players',
            filter: `room_id=eq.${roomId}`,
        }, onChange)
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
}

export async function getRoomState(roomId) {
    const supabase = getSupabase();
    const { data, error } = await supabase
        .from('htt_rooms')
        .select(ROOM_COLUMNS)
        .eq('id', roomId)
        .single();

    if (error && isMissingRoundAnchorError(error)) {
        const { data: fallback, error: fallbackError } = await supabase
            .from('htt_rooms')
            .select(ROOM_COLUMNS_NO_ANCHOR)
            .eq('id', roomId)
            .single();
        if (fallbackError) throw fallbackError;
        return { ...fallback, round_starts_at: null };
    }

    if (error) throw error;
    return data;
}

export function subscribeRoomState(roomId, onChange) {
    const supabase = getSupabase();
    const channel = supabase
        .channel(`htt-room-state-${roomId}`)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'htt_rooms',
            filter: `id=eq.${roomId}`,
        }, onChange)
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
}

export async function startRoomRound({ roomId, beatId, roundStartsAt = null }) {
    const supabase = getSupabase();

    const { data: room, error: roomError } = await supabase
        .from('htt_rooms')
        .select('current_round, total_rounds, phase, active_round_id, current_beat_id')
        .eq('id', roomId)
        .single();

    if (roomError) throw roomError;

    if (room.phase === 'running' && room.active_round_id) {
        const { data: existingRound, error: existingRoundError } = await supabase
            .from('htt_room_rounds')
            .select('id, room_id, round_number, beat_id, status')
            .eq('id', room.active_round_id)
            .single();

        if (existingRoundError) throw existingRoundError;
        return existingRound;
    }

    await resetRoomPlayerFirstTaps(roomId);

    const nextRound = room.current_round + 1;
    const { error: roundUpsertError } = await supabase
        .from('htt_room_rounds')
        .upsert({
            room_id: roomId,
            round_number: nextRound,
            beat_id: beatId,
            status: 'running',
        }, {
            onConflict: 'room_id,round_number',
            ignoreDuplicates: false,
        });

    if (roundUpsertError) throw roundUpsertError;

    const { data: roundRow, error: roundSelectError } = await supabase
        .from('htt_room_rounds')
        .select('id, room_id, round_number, beat_id, status')
        .eq('room_id', roomId)
        .eq('round_number', nextRound)
        .single();

    if (roundSelectError) throw roundSelectError;

    const updatePayload = {
        phase: 'running',
        sync_failed_player_ids: [],
        current_round: nextRound,
        current_beat_id: beatId,
        active_round_id: roundRow.id,
        round_starts_at: roundStartsAt,
        locked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
    let { error: updateError } = await supabase.from('htt_rooms').update(updatePayload).eq('id', roomId);

    if (updateError && isMissingRoundAnchorError(updateError)) {
        const { round_starts_at, ...noAnchor } = updatePayload;
        void round_starts_at;
        ({ error: updateError } = await supabase.from('htt_rooms').update(noAnchor).eq('id', roomId));
    }

    if (updateError) throw updateError;

    return roundRow;
}

/**
 * Re-anchor the current round to a fresh synchronized-start timestamp without
 * advancing the round number. Used by the host "Restart round" control so every
 * device (including any that got stuck) re-runs the countdown and resumes together.
 */
export async function rescheduleRoomRound(roomId, roundStartsAt) {
    const supabase = getSupabase();
    let { error } = await supabase
        .from('htt_rooms')
        .update({
            phase: 'running',
            round_starts_at: roundStartsAt,
            updated_at: new Date().toISOString(),
        })
        .eq('id', roomId);

    if (error && isMissingRoundAnchorError(error)) {
        ({ error } = await supabase
            .from('htt_rooms')
            .update({ phase: 'running', updated_at: new Date().toISOString() })
            .eq('id', roomId));
    }

    if (error) throw error;
}

export async function setRoomPhase(roomId, phase, extraUpdates = {}) {
    const supabase = getSupabase();
    const { error } = await supabase
        .from('htt_rooms')
        .update({
            phase,
            ...extraUpdates,
            updated_at: new Date().toISOString(),
        })
        .eq('id', roomId);

    if (error) throw error;
}

export async function updateRoomBeat(roomId, beatId) {
    const supabase = getSupabase();
    const { error } = await supabase
        .from('htt_rooms')
        .update({
            beat_id: beatId,
            current_beat_id: beatId,
            updated_at: new Date().toISOString(),
        })
        .eq('id', roomId);

    if (error) throw error;
}

export async function updateRoomSilentBars(roomId, silentBars) {
    const supabase = getSupabase();

    // Only allow changing silent bars in lobby phase.
    const { data: room, error: roomError } = await supabase
        .from('htt_rooms')
        .select('phase')
        .eq('id', roomId)
        .single();

    if (roomError) throw roomError;
    if (room.phase !== 'lobby') {
        throw new Error('Can only change silent bars in lobby phase');
    }

    const { error } = await supabase
        .from('htt_rooms')
        .update({
            silent_bars: silentBars,
            updated_at: new Date().toISOString(),
        })
        .eq('id', roomId);

    if (error) throw error;
}

export async function updateRoomMode(roomId, mode) {
    const supabase = getSupabase();

    const { data: room, error: roomError } = await supabase
        .from('htt_rooms')
        .select('phase')
        .eq('id', roomId)
        .single();

    if (roomError) throw roomError;
    if (room.phase !== 'lobby') {
        throw new Error('Can only change mode in lobby phase');
    }

    const { error } = await supabase
        .from('htt_rooms')
        .update({
            mode,
            updated_at: new Date().toISOString(),
        })
        .eq('id', roomId);

    if (error) throw error;
}

export async function submitRoundResult({ roomId, roundNumber, playerId, playerName, score, consistencyScore, accuracyScore, analysis }) {
    const supabase = getSupabase();

    const { data: roundRow, error: roundError } = await supabase
        .from('htt_room_rounds')
        .select('id')
        .eq('room_id', roomId)
        .eq('round_number', roundNumber)
        .single();

    if (roundError) throw roundError;

    const { error } = await supabase
        .from('htt_room_results')
        .upsert({
            room_id: roomId,
            round_id: roundRow.id,
            round_number: roundNumber,
            player_id: playerId,
            player_name: playerName,
            score,
            consistency_score: consistencyScore,
            accuracy_score: accuracyScore,
            analysis,
        }, {
            onConflict: 'room_id,round_number,player_id',
            ignoreDuplicates: false,
        });

    if (error) throw error;
}

export async function listRoundResults(roomId, roundNumber) {
    const supabase = getSupabase();
    const { data, error } = await supabase
        .from('htt_room_results')
        .select('player_id, player_name, score, consistency_score, accuracy_score, analysis, round_number')
        .eq('room_id', roomId)
        .eq('round_number', roundNumber)
        .order('score', { ascending: false });

    if (error) throw error;
    return data || [];
}

export async function listAllRoomResults(roomId) {
    const supabase = getSupabase();
    const { data, error } = await supabase
        .from('htt_room_results')
        .select('player_id, player_name, score, consistency_score, accuracy_score, analysis, round_number')
        .eq('room_id', roomId);

    if (error) throw error;
    return data || [];
}

export async function finalizeRoundIfComplete(roomId, roundNumber) {
    const supabase = getSupabase();

    const [{ data: players, error: playersError }, { data: results, error: resultsError }, { data: room, error: roomError }] = await Promise.all([
        supabase.from('htt_room_players').select('player_id').eq('room_id', roomId),
        supabase.from('htt_room_results').select('player_id').eq('room_id', roomId).eq('round_number', roundNumber),
        supabase.from('htt_rooms').select('total_rounds').eq('id', roomId).single(),
    ]);

    if (playersError) throw playersError;
    if (resultsError) throw resultsError;
    if (roomError) throw roomError;

    if ((results || []).length < (players || []).length) {
        return { phase: 'running', complete: false };
    }

    // On last round, show round_result (waiting) until we explicitly move to final
    // Otherwise go straight to round_result
    const nextPhase = 'round_result';
    const supabaseUpdate = await supabase
        .from('htt_rooms')
        .update({
            phase: nextPhase,
            locked_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq('id', roomId);

    if (supabaseUpdate.error) throw supabaseUpdate.error;

    const { error: roundUpdateError } = await supabase
        .from('htt_room_rounds')
        .update({
            status: 'complete',
            finished_at: new Date().toISOString(),
        })
        .eq('room_id', roomId)
        .eq('round_number', roundNumber);

    if (roundUpdateError) throw roundUpdateError;

    // If it's the last round, transition to final results
    if (roundNumber >= room.total_rounds) {
        const { error: finalError } = await supabase
            .from('htt_rooms')
            .update({
                phase: 'final',
                updated_at: new Date().toISOString(),
            })
            .eq('id', roomId);

        if (finalError) throw finalError;

        return { phase: 'final', complete: true };
    }

    return { phase: 'round_result', complete: true };
}

export async function updateRoomTotalRounds(roomId, totalRounds) {
    const supabase = getSupabase();

    // Only allow changing rounds in lobby phase
    const { data: room, error: roomError } = await supabase
        .from('htt_rooms')
        .select('phase')
        .eq('id', roomId)
        .single();

    if (roomError) throw roomError;
    if (room.phase !== 'lobby') {
        throw new Error('Can only change rounds in lobby phase');
    }

    const { error } = await supabase
        .from('htt_rooms')
        .update({
            total_rounds: totalRounds,
            updated_at: new Date().toISOString(),
        })
        .eq('id', roomId);

    if (error) throw error;
}

export async function openLobbyAgain(roomId) {
    const supabase = getSupabase();
    const lobbyReset = {
        phase: 'lobby',
        current_round: 0,
        current_beat_id: null,
        active_round_id: null,
        round_starts_at: null,
        locked_at: null,
        updated_at: new Date().toISOString(),
    };
    const [resultsDelete, roundsDelete, roomUpdate] = await Promise.all([
        supabase.from('htt_room_results').delete().eq('room_id', roomId),
        supabase.from('htt_room_rounds').delete().eq('room_id', roomId),
        supabase.from('htt_rooms').update(lobbyReset).eq('id', roomId),
    ]);

    if (resultsDelete.error) throw resultsDelete.error;
    if (roundsDelete.error) throw roundsDelete.error;
    if (roomUpdate.error && isMissingRoundAnchorError(roomUpdate.error)) {
        const { round_starts_at, ...noAnchor } = lobbyReset;
        void round_starts_at;
        const { error } = await supabase.from('htt_rooms').update(noAnchor).eq('id', roomId);
        if (error) throw error;
    } else if (roomUpdate.error) {
        throw roomUpdate.error;
    }
}