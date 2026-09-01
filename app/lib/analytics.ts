/**
 * Umami, self-hosted on analytics.leonardsima.de. The instance runs on the same
 * machine as the app, so nothing leaves our own infrastructure.
 *
 * The website id and host sit here rather than in an env var: the id is visible
 * in the served HTML anyway, and this way a deploy needs no configuration.
 * `UMAMI_DOMAINS` keeps a local dev server or a preview out of the stats.
 *
 * Every route here is a game name, so nothing in the URL needs scrubbing —
 * unlike the sibling apps, this one can let Umami track pages by itself.
 *
 * RULE — never put personal data in an event. Counters and coarse categories
 * only; scores stay in the player's own browser.
 */

export const UMAMI_SRC = "https://analytics.leonardsima.de/script.js";
export const UMAMI_WEBSITE_ID = "ac6c140e-f473-4f50-aef7-3b1547fb0969";
export const UMAMI_DOMAINS = "synchro.leonardsima.de";

type EventData = Record<string, string | number | boolean>;

declare global {
    interface Window {
        umami?: {
            track: (event: string, data?: EventData) => void;
        };
    }
}

/**
 * Records a custom event. Silently does nothing when the script hasn't loaded
 * yet or an ad blocker removed it.
 */
export const track = (event: string, data?: EventData): void => {
    if (typeof window === "undefined" || !window.umami) return;
    try {
        window.umami.track(event, data);
    } catch {
        // A failed measurement is worth less than the game in progress.
    }
};
