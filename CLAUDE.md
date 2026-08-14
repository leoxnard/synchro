# CLAUDE.md

Guidance for AI assistants working in this repository.

## What this project is

**Synchro** (https://synchro.leonardsima.de) is a Next.js web app hosting three
browser-based rhythm/timing games. Everything is client-side except the
multiplayer lobby for *Hold The Tempo*, which uses Supabase (Postgres + Realtime)
directly from the browser. There is no custom backend, no API routes, and no
server actions in use.

The core engineering problem across all three games is **audio timing accuracy**:
scheduling clicks on the Web Audio clock, measuring taps against
`performance.now()`, compensating for input/output latency, and (in multiplayer)
aligning the start of a round across devices.

## Commands

```bash
npm install
npm run dev              # next dev on :3000
npm run build            # next build
npm run start            # serve the production build
npm run lint             # eslint (flat config, eslint.config.mjs)
npm run generate:schema  # supabase db dump --schema public -f supabase/schema.sql
```

There is **no test suite and no CI**. `npm run lint` and `npm run build` are the
only automated checks — run both after non-trivial changes.

`.claude/launch.json` and `.vscode/` hold local editor launch config; `.vscode`
is gitignored.

## Environment variables

All are `NEXT_PUBLIC_*` because everything runs in the browser. `.env*` is
gitignored, so a local `.env.local` is needed for multiplayer to work:

| Variable | Used by | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `app/hold-the-time/utils/lobbyApi.js` | Required for multiplayer; solo play works without it |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same | same |
| `NEXT_PUBLIC_SITE_URL` | `app/robots.ts`, `app/sitemap.ts` | Falls back to `https://synchro.leonardsima.de` |

`lobbyApi.getSupabase()` throws if the first two are missing, so multiplayer
code paths fail loudly rather than silently.

## Layout

```
app/
  layout.tsx            Root layout: fixed 100dvh column, Navbar / main / Footer, Vercel Analytics
  page.tsx              "/" → redirect to /poly-rhythm
  globals.css           Tailwind v4 entry + custom classes (.tempo-window, .tempo-orb-*)
  robots.ts, sitemap.ts
  components/           Shared UI: GameContainer, Navbar, NumberStepper, Footer
  hooks/                useAudioEngine (Web Audio), useIsMobile (touch detection)
  lib/                  highscoreStorage, configStorage — localStorage wrappers
  poly-rhythm/          Game 1
  hold-the-time/        Game 2 (incl. multiplayer)
  tempo-recognition/    Game 3
  legal-notice/, privacy-policy/
public/drumSamples/     .wav loops used by Hold The Tempo (filename encodes BPM)
supabase/
  hold_the_time.sql     Hand-written, idempotent migration — the source of truth
  schema.sql            Generated dump (npm run generate:schema) — do not hand-edit
```

### Per-game folder convention

Every game follows the same shape and it should be preserved when adding one:

```
app/<game>/
  page.tsx               Server component: route metadata + renders the game shell
  <GameName>.jsx         'use client' — owns ALL state, timing, audio, scoring orchestration
  <Something>View.jsx    Presentational views, one per gameState, props-only
  constants/gameConfig.js  Tuning constants and content tables
  utils/                 Pure functions (math, scoring, analysis) + lobbyApi for network
  components/            Game-local components (only poly-rhythm has this today)
```

The `*Game.jsx` / `HoldTheTime.jsx` file is deliberately a large single
controller (873 and 1367 lines respectively). Refs and timers live there; views
receive callbacks. Don't split these up opportunistically — timing correctness
depends on a single owner of the audio context and the ref-held clock.

## The three games

### `/poly-rhythm` — Polyrhythm
Play up to `MAX_TRACKS` (5) simultaneous pulse patterns against a metronome.
`gameState`: `setup → countIn → playing → result`, plus `practice` and
`latencyTest` branches.

- Config persists to localStorage under `polyrhythm_config` via
  `app/lib/configStorage.js` (bpm, measures, beatsPerMeasure, countInBars,
  tracks, latencyCompMs) and is validated on load with a fallback to
  `DEFAULT_CONFIG`.
- `utils/scoringEngine.js` is the heavy piece: on touch devices taps have no
  key identity, so k-means clustering (`clusterMobileTapsForScoring`) assigns
  taps to tracks before scoring. `computeFinalScore` combines timing, coverage
  and precision using the weights in `GAME_TUNING.scoring`.
- `utils/latencyAnalysis.js` estimates a per-session latency correction from the
  matched taps (weighted median), bounded by `MAX_AUTO_CORRECTION_MS`.
- `LatencyTestView.jsx` is an explicit calibration flow writing `latencyCompMs`.

### `/hold-the-time` — Hold The Tempo
A drum loop plays, drops out for `silentBars`, and the player keeps tapping the
tempo through the silence; the loop returns and accuracy/consistency are scored.

- Phases within a round: `listening → silence → return` (`phase` state);
  outer flow: `setup → countdown → running → results → …` plus multiplayer
  states `name`, `lobby`, `waiting`, `round-result`, `final`.
- `LISTENING_BEATS = 8` (two bars) before silence; `SYNC_LEAD_MS = 3500` is the
  countdown lead for synchronized starts.
- `utils/analyzeSession.js` + `constants/gameConfig.js#SCORING_CONFIG` produce
  the score. The comments in `SCORING_CONFIG` are in German — the tolerance
  values are expressed as fractions of a beat, not milliseconds.
- `BEATS` in `constants/gameConfig.js` maps each drum loop to its true BPM;
  the `src` must match a file in `public/drumSamples/`.

### `/tempo-recognition` — Tempo Recognition
Listen to a tempo, then reproduce it with a stepper. `gameState`:
`intro → listening → adjusting → round-results → final-results`. Highscore
persists via `app/lib/highscoreStorage.js` under key
`synchro_highscore_tempo-recognition`.

## Audio timing rules

`app/hooks/useAudioEngine.js` is the shared engine (poly-rhythm and
tempo-recognition; Hold The Tempo manages its own `AudioContext` because it
plays buffered `.wav` loops rather than oscillators).

- Create the context **only inside a user gesture**, via `initAudioContext()`.
  It also lazily imports `iosunmute` to work around the iOS silent switch.
- Schedule with `AudioContext.currentTime`, never `setTimeout`, for anything
  audible. `setTimeout` is only for UI state transitions.
- Convert between clocks with `getAudioContextOffset()`
  (`performance.now() - currentTime * 1000`). Tap times are recorded from
  `performance.now()` relative to a ref-held session start.
- `scheduleDedupedClickEvents` collapses clicks within
  `CLICK_DEDUP_EPSILON_MS` (12 ms), keeping the lowest `rank` — this is how
  overlapping polyrhythm tracks avoid flamming.
- Always `stopAllAudioNodes()` / `closeAudioContext()` on teardown; nodes are
  tracked in a ref array.
- Input dedup for taps is separate and lives in
  `GAME_TUNING.input` (`dedupWindowMs`, `recentTrackClaimWindowMs` for
  multi-touch track claiming).

## Multiplayer (Hold The Tempo only)

All networking is in `app/hold-the-time/utils/lobbyApi.js` — the browser talks
to Supabase directly with the anon key. `HoldTheTime.jsx` orchestrates; no other
file should import `@supabase/supabase-js`.

- **Tables** (all prefixed `htt_`): `htt_rooms`, `htt_room_players`,
  `htt_room_rounds`, `htt_room_results`.
- **Room phase** on `htt_rooms.phase`:
  `lobby | running | round_result | final | sync_failed` (enforced by a check
  constraint).
- **Modes** (`app/hold-the-time/utils/multiplayerHelpers.js`): `solo`,
  `local` (host device is the only audio output), `online` (every device plays
  audio). Room codes/tokens use a 32-char ambiguity-free alphabet and
  `crypto.getRandomValues`.
- **Realtime**: `subscribeRoomPlayers` / `subscribeRoomState` use Supabase
  Realtime; all four tables are added to the `supabase_realtime` publication by
  the migration.
- **Synchronized start**: clients call the `htt_now()` RPC a few times, keep the
  smallest-RTT sample, derive `serverOffsetRef` (serverTime − Date.now()), and
  schedule the round against `htt_rooms.round_starts_at` in the server-time
  domain.
- **Presence**: `touchPlayerPresence` / `setPlayerOffline` maintain
  `is_online` / `last_seen_at`; hosts can `kickRoomPlayer` / `banRoomPlayer`.
- **Invite links** are `/hold-the-time?room=<TOKEN>`; the component syncs the
  query param with `history` as the room state changes.
- Player identity is anonymous and stored in localStorage: `htt-player-id`,
  `htt-player-name`.

### Schema conventions

- Write migrations in `supabase/hold_the_time.sql` and keep them **idempotent**
  (`create table if not exists`, `add column if not exists`, `do $$ ... $$`
  guards around policies and publication membership). The file is re-runnable
  against an existing database.
- Regenerate `supabase/schema.sql` with `npm run generate:schema` after schema
  changes; treat it as a build artifact.
- RLS is enabled on every table but the policies are **open to `anon`** — rooms
  are secured only by the unguessable token. Don't put anything sensitive in
  these tables.
- `lobbyApi.js` degrades gracefully when a newer column is missing
  (`isMissingPlayerMetaColumnError`, `isMissingRoundAnchorError` detect
  Postgres `42703` and retry with a reduced column list). Keep this pattern when
  adding columns, so deployed clients don't break before the migration lands.

## Code conventions

- **Language mix is intentional**: `.tsx`/`.ts` for routing, layout, and shared
  typed components; `.jsx`/`.js` for game logic, hooks, and utils. `allowJs` is
  on and `strict` is on for the TypeScript that exists. Don't convert existing
  `.jsx` game files to TypeScript as a drive-by change.
- **Indentation is 4 spaces**, enforced by ESLint (`indent: ["error", 4]`,
  `SwitchCase: 1`). `max-len` is off.
- Path alias `@/*` maps to the repo root (rarely used; most imports are
  relative).
- Any component using hooks, audio, or `window` needs `'use client'`. Route
  `page.tsx` files stay server components and exist mainly to export `metadata`.
- Styling is **Tailwind v4** (via `@tailwindcss/postcss`, no `tailwind.config`);
  custom classes and the animated background orbs live in `app/globals.css`.
  The app is dark-first (`bg-neutral-900 text-white` on `body` in the layout).
- Layout animations use `framer-motion` `layout` with the shared spring
  `{ type: "spring", bounce: 0, duration: 1 }` — reuse `GameContainer` rather
  than rebuilding the frame; it takes `desktopWidth` / `desktopHeight` /
  `mobileHeight` and games vary these per `gameState`.
- localStorage access is always wrapped in `typeof window === 'undefined'`
  guards and `try/catch` (see `app/lib/*`). Follow that when adding keys.
- Adding a game means adding it to `GAMES` in `app/components/Navbar.tsx` and to
  `app/sitemap.ts`.
- Some comments in the codebase are German; new comments are English.

## Deployment

Vercel. `@vercel/analytics` is mounted in `app/layout.tsx`.
`next.config.ts` allows `*.loca.lt` dev origins for tunneling to a phone during
timing tests — that's the normal way to check touch/latency behavior, since
mobile Safari behaves very differently from desktop.
