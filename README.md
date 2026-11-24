# Scholaris Learning — Portable Single-File Build

A 1:1 functional clone of [scholaris-learning.lovable.app](https://scholaris-learning.lovable.app)
(source: `github.com/AetherIncarnate/scholaris-learning`, private — reconstructed from the live build)
as **one portable `index.html`** with **no backend**. All data lives in the browser
(IndexedDB + localStorage). Open the file directly, or host it statically.

## Files

| File | Purpose |
|---|---|
| `index.html` | The entire app — HTML + CSS + JS inline. No build step. |
| `games/manifest.json` | Seed catalogue of the 65 built-in games (also embedded in `index.html`). |
| `vercel.json` | Vercel static hosting config (SPA fallback + security headers). |
| `netlify.toml` + `_redirects` | Netlify static hosting config (SPA fallback + headers). |

## Run locally

```bash
# Option A — just open it
open index.html            # macOS
# or
xdg-open index.html        # Linux

# Option B — tiny static server (recommended for iframe games)
python3 -m http.server 8000
# → http://localhost:8000
```

Routes are hash-based so the file works from `file://` and any static host:
`#/`, `#/practice`, `#/pricing`, `#/games`, `#/community`, `#/admin`.

## Deploy to Vercel

1. Push this folder to GitHub (or drag-and-drop the folder at vercel.com/new).
2. Framework preset: **Other**. Build command: *(empty)*. Output directory: `.` (root).
3. Deploy. `vercel.json` handles SPA fallback (`/practice` → `/index.html`) and headers.

CLI alternative:

```bash
npm i -g vercel
vercel --prod
```

## Deploy to Netlify

1. Drag-and-drop this folder onto Netlify Drop, **or** connect the Git repo.
2. Build command: *(empty)*. Publish directory: `.` (root).
3. Deploy. `netlify.toml` / `_redirects` handle SPA fallback and headers.

CLI alternative:

```bash
npm i -g netlify-cli
netlify deploy --dir=. --prod
```

## Admin — adding games (easy)

1. Go to `#/admin`. Default password: **`scholaris-admin`** (change it in Settings after first login).
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
- Games/Arcade (65 built-in titles, search/genre/sort, play/vote, random, fullscreen, new tab, panic button, themes, custom games)
- Community chat (local), auth with verification codes, accessibility (text size + dark mode), broadcast banner, admin dashboard

## Limitations (by design — no backend)

- Data is per-browser/device. No cross-device sync, no real email, no payments (enrollment requests are saved locally).
- Built-in game files (`/games/*.html`) are not bundled — iframe games load from their URLs; HTML games added via Admin are stored in IndexedDB and played via blob URLs.
- Fonts + Vimeo video need internet; everything else works offline.
