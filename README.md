# Scholaris Learning — Static Portable Build

Scholaris is a static education site with a separate browser-game arcade and no application backend. The application source remains in `index.html`; catalogue metadata, game launchers, and assets are generated as separate static files during the build. Browser data is stored locally in IndexedDB and localStorage.

## Files

| File | Purpose |
|---|---|
| `index.html` | Portable application source and UI. |
| `manifest.json` | Seed catalogue for the built-in games. |
| `build.mjs` | Builds `dist/`, imports the existing repository archive and pinned GitHub catalogues. |
| `community-games-import.mjs`, `community-games.json` | Curated, licensed browser games from pinned GitHub commits, with size and static dependency checks. |
| `seraph-import.mjs`, `seraph-import.json` | Pinned Seraph source import, lightweight filters, static dependency checks, and generated report. |
| `catalogue-overrides.json`, `catalogue-rules.json`, `seraph-title-aliases.json`, `seraph-genre-overrides.json` | Curated catalogue metadata, overlap handling, and classification. |
| `package.json`, `package-lock.json` | Node 22 build dependencies and test command. |
| `vercel.json`, `netlify.toml` | Static hosting settings; output is `dist/`. |
| `SERAPH-IMPORT.md` | Scope, build and validation notes for the Seraph import. |
| `COMMUNITY-GAMES.md` | Sources, pinned games, licensing, size and validation notes for the added GitHub games. |

## Build and run locally

```bash
npm ci
npm test
npm run build
python3 -m http.server 8000 --directory dist
# → http://localhost:8000
```

The full build downloads the curated, pinned community games and Seraph files from GitHub plus the existing catalogue archives from GitLab; imported game files are separate static assets, not added to `index.html`. For a Seraph-only local smoke build (skips GitLab and community imports), use `NODE_USE_SYSTEM_CA=1 SERAPH_ONLY=1 npm run build`. `SERAPH_ONLY` is test-only and is rejected on Vercel. See [COMMUNITY-GAMES.md](COMMUNITY-GAMES.md) and [SERAPH-IMPORT.md](SERAPH-IMPORT.md) for sources and validation limits.

Routes are hash-based: `#/`, `#/practice`, `#/pricing`, `#/games`, `#/community`, and `#/admin`.

## Deploy to Vercel

Connect the repository with the **Other** framework preset, repository-root working directory, Node.js **22.x**, install command `npm ci`, build command `npm run build`, and output directory `dist`. These are set in `vercel.json`. Do not upload `node_modules/` or generated `dist/` files.

CLI alternative:

```bash
npm i -g vercel
vercel --prod
```

## Deploy to Netlify

Connect the Git repository and use the build command and publish directory in `netlify.toml` (`npm run build` and `dist`). A source-only drag-and-drop deploy will not run the game importer.

CLI alternative:

```bash
npm i -g netlify-cli
netlify deploy --dir=. --prod
```

## Admin — adding games (easy)

1. Go to the existing `#/admin` route and use the local admin gate configured in the application. This is a client-side convenience gate, not secure authentication.
2. **Push a new game**: enter **Name** + **Genre**, paste **full HTML** *or* a single `https://` URL (iframe game), optionally upload a thumbnail (≤ 3 MB) or `.html` file, then hit **Push to all users**. The game appears in **Games** instantly.
3. **Bulk import**: paste a JSON array (or load a `.json` file) and hit **Import all**.
4. **Library**: edit, hide/show, or delete any game. **Broadcast**: toggle the announcement banner + patch notes. **Settings**: change password, arcade accent, panic button, splash texts. **Data**: export JSON, reset stats, wipe.

> Local-only note: admin pushes save to *this browser's* IndexedDB and sync across tabs via `BroadcastChannel`. To share games with other visitors, export JSON from Admin and import it on their device — or re-add the game via the form. There is no server to push to.

## What was replaced (no-backend map)

| Original (Supabase / edge functions) | Portable replacement |
|---|---|
| Supabase Auth (sign up / log in) | Local users in IndexedDB `users` store; SHA-256 password hashes; 30-day sessions in `sessions` + `scholaris.session` |
| 5-digit email verification (`/api/check-email`) | Code generated locally, **shown on screen** (no mail server), 15-min expiry, single-use, 60s resend cooldown |
| `admin_games` table | IndexedDB `adminGames` store + `arcade.customGames` localStorage mirror |
| `game_stats` + `vote_game` RPC | IndexedDB `gameStats` store + `arcade.votes` localStorage |
| Realtime `game_stats_live` channel | `BroadcastChannel("scholaris-sync")` cross-tab sync |
| `/api/public/admin-manifest`, `/api/public/large-upload` | Direct IndexedDB writes; thumbnail/HTML via `FileReader` (3 MB limits kept) |
| `/api/broadcast` (announcement banner) | IndexedDB `settings.broadcast`, rendered on load, dismiss persisted |
| Patch notes / hidden games / site theme keys | IndexedDB `settings` store |
| Chat server functions (channels, DMs, roles, bans) | Local `messages` store + channels (`general`, `announcements`, `study-help`); multi-tab sync via BroadcastChannel |
| Game saves (`__arcadeSave` postMessage) | `localStorage["arcade.save.<game>"]` bridge (same protocol) |
| Accessibility (`a11y.textSize`, `a11y.theme`) | Same localStorage keys, same behaviour |
| Contact / enrollment forms | IndexedDB `contacts` / `enrollments` stores + audit log |
| Vimeo lesson video | Same external embed (`player.vimeo.com/video/543156776`) — needs internet |

## Features kept

- Home 1:1 (hero, stats, featured lesson, 4 subject tracks with syllabi, lesson theatre, 6 testimonials, Ireland schools, 22-question FAQ)
- Practice engine 1:1 (5 topics, shuffled questions, streak/accuracy, explanations, Science reference video, per-user progress)
- Pricing 1:1 (Curious/Scholar/Family, monthly/annual toggle, institutional seats, FAQ, enrollment requests)
- Games/Arcade (built-in titles plus build-generated GitHub community and Seraph games, local favourites shown first, per-game keyboard remapping where accessible, search/genre/sort, play/vote, random, fullscreen, new tab, panic button, themes, custom games)
- Community chat (local), auth with verification codes, accessibility (text size + dark mode), broadcast banner, admin dashboard

## Limitations (by design — no backend)

- Data is per-browser/device. Favourites, play stats, and custom games are not synced across devices. No real email or payments (enrollment requests are saved locally).
- Games added through Admin remain browser-local. The existing embedded catalogue retains its current launch behavior; pinned GitHub community and Seraph games are generated as separate static files during deployment.
- Keyboard remapping is best-effort: it only works for same-origin game frames and games that accept simulated keyboard events. Cross-origin frames cannot be inspected or intercepted.
- Fonts + Vimeo video need internet; everything else works offline.
