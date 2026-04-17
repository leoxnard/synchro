const HIGHSCORE_PREFIX = 'synchro_highscore_';

export const getHighscore = (gameId) => {
    if (typeof window === 'undefined') return 0;
    try {
        const stored = window.localStorage.getItem(`${HIGHSCORE_PREFIX}${gameId}`);
        return stored ? Number(stored) : 0;
    } catch {
        return 0;
    }
};

export const saveHighscore = (gameId, score) => {
    if (typeof window === 'undefined') return;
    try {
        const current = getHighscore(gameId);
        if (score > current) {
            window.localStorage.setItem(`${HIGHSCORE_PREFIX}${gameId}`, String(Math.round(score)));
            return true;
        }
    } catch {
        // silently fail
    }
    return false;
};

export const isNewHighscore = (gameId, score) => {
    return score > getHighscore(gameId);
};
