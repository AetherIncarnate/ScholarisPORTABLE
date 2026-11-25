# Seraph game-library import

Scholaris imports a **pinned, filtered snapshot** of `a456pur/seraph` at build time. The imported game files and thumbnails remain separate static files under `dist/games/`, `dist/images/`, and `dist/library/`; they are not added to or base64-embedded in `index.html`. The browser loads the generated same-origin manifest and game launchers, rather than fetching a source ZIP at play time.

## Scope and selection

`seraph-import.json` pins the source commit and the confirmed lightweight cutoff of 12,000,000 bytes per game folder. The importer:

- skips titles already represented by Scholaris, including reviewed spelling/alias matches;
- excludes console-emulator and Unity entries;
- excludes oversized folders, invalid launch paths, missing required local files, and launchers requiring external scripts/stylesheets/frames;
- keeps Flash games only when the source folder contains the SWF and adds the pinned Ruffle runtime plus its notices;
- preserves game folder dependencies and relevant shared assets; makes thumbnails into small WebP files;
- estimates genre/device support and records the estimate and source revision in the generated manifest/report;
- removes known analytics scripts from imported launchers.

The current pinned build selected 83 games (about 308 MB of game-folder files), plus approximately 26 MB of Ruffle runtime. The local static output measured about 336 MB. These are build observations for the pinned snapshot, not a promise about later revisions or Vercel's current deployment limits. Vercel project access could not be verified in this session.

The full generated report is `dist/library/seraph-build-report.json`; it lists imported titles, duplicates, exclusions, optional missing assets, external optional dependencies, and static validation limits. It is generated output and should not be committed.

## Build and test

Production build remains static and retains the existing GitLab catalogue import:

```sh
npm ci
npm test
npm run build
```

For local Seraph-only verification (does not run the existing GitLab import):

```sh
NODE_USE_SYSTEM_CA=1 SERAPH_ONLY=1 npm run build
```

A small import smoke test can use `SERAPH_IMPORT_LIMIT=10` with `SERAPH_ONLY=1`. These test-only flags are rejected on Vercel. `dist/` and `node_modules/` are ignored by Git.

The importer checks launcher presence and static asset references; it does **not** claim all games were played or fully gameplay-tested. Device support is inferred, not verified on physical iPads. Some games retain optional external fonts/images; see the generated report.

## Rights and notices

The upstream root GPL-3.0 license is copied to `dist/library/seraph/UPSTREAM-LICENSE.txt`; relevant source game and Ruffle notices are retained with their files. Upstream per-game assets may have additional terms. The user's permission from the Seraph owner is user-provided and was not independently verified here.
