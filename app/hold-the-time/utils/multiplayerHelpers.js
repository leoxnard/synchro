export const MULTIPLAYER_MODES = [
    {
        id: 'solo',
        label: 'Solo',
        description: 'Current single-player flow',
    },
    {
        id: 'local',
        label: 'One device',
        description: 'Only one device outputs audio while everyone taps in sync',
    },
    {
        id: 'online',
        label: 'All devices',
        description: 'Every connected device outputs audio in the shared room',
    },
];

export const LOCAL_AUDIO_POLICY = {
    label: 'Host audio only',
    description: 'Only the host device plays audio while everyone taps on their own device.',
};

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function createRoomCode(length = 6) {
    const buffer = new Uint32Array(length);
    crypto.getRandomValues(buffer);

    let roomCode = '';
    for (let index = 0; index < length; index += 1) {
        roomCode += ROOM_ALPHABET[buffer[index] % ROOM_ALPHABET.length];
    }

    return roomCode;
}

export function createPlayerId(prefix = 'player') {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createRoomToken(length = 12) {
    const buffer = new Uint32Array(length);
    crypto.getRandomValues(buffer);

    let token = '';
    for (let index = 0; index < length; index += 1) {
        token += ROOM_ALPHABET[buffer[index] % ROOM_ALPHABET.length];
    }

    return token;
}

export function getModeLabel(modeId) {
    return MULTIPLAYER_MODES.find((mode) => mode.id === modeId)?.label || 'Solo';
}

export function getModeDescription(modeId) {
    return MULTIPLAYER_MODES.find((mode) => mode.id === modeId)?.description || '';
}