# Additional pinned GitHub games

The full static build adds a small, curated set of browser games from GitHub. They are downloaded at build time from immutable commit IDs and served as separate files under `dist/games/community/`; the game code is not copied into `index.html`. Each source repository has a tracked MIT license, copied to `dist/library/licenses/`, and the generated manifest/report records its GitHub URL, revision and license.

| Game | GitHub source | Estimated source-folder bytes | Genre | Device estimate |
|---|---|---:|---|---|
| 2048 | [gabrielecirulli/2048](https://github.com/gabrielecirulli/2048) | 603,765 | Puzzle | Mobile + PC |
| Canvas Tetris | [dionyziz/canvas-tetris](https://github.com/dionyziz/canvas-tetris) | 18,744 | Puzzle | PC |
| JavaScript Racer | [jakesgordon/javascript-racer](https://github.com/jakesgordon/javascript-racer) | 8,924,617 | Racing | PC |
| Maze Escape | [mariohd/JSGames](https://github.com/mariohd/JSGames) | 849,052 | Puzzle | PC |
| TicTacBRed | [mariohd/JSGames](https://github.com/mariohd/JSGames) | 4,944 | Puzzle | Mobile + PC |
| Mini Racer 2 | [mariohd/JSGames](https://github.com/mariohd/JSGames) | 331,669 | Racing | Mobile + PC |

All six configured entries are below the existing 12,000,000-byte per-game source-folder limit. Duplicate checks run against the existing Scholaris and GitLab game catalogues before adding them; game titles and genre/device metadata are editable in `community-games.json`. The compatibility values are estimates based on launcher/input signals, not iPad test results.

The importer checks the pinned launcher, required local launcher assets and remote script/style/frame dependencies. These are static checks; they do not establish that every game works or that scripts have no runtime network requests. No WebAssembly or SWF games were added in this batch. The pinned Seraph import remains the separately documented source for the current Flash selection and Ruffle runtime.

To validate the curated imports independently:

```sh
npm ci
npm test
NODE_USE_SYSTEM_CA=1 node --input-type=module -e "import {importCommunityGames} from './community-games-import.mjs'; const r=await importCommunityGames({distDir:'/tmp/community-games-check'}); console.log(JSON.stringify(r.report,null,2))"
```

For generated details after a full build, see `dist/library/build-report.json` (`community`) and `dist/library/manifest.json`.
