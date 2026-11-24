# Scholaris: automated ZIP deployment from iPad

## What this package does

Your existing Vercel site builds a static library by downloading games.zip and images-webp.zip from the public scholaris-team/scholaris GitLab repository. No game-asset uploads, second hosting project, CORS setup, backend, or access token are needed. Both ZIPs are fetched from the same commit so they cannot change halfway through a build.

The current test produced 826 games: 97 existing plus 729 imports, with 78 overlapping imports skipped. Existing games take priority. Genres and device compatibility are estimates, not full gameplay tests. Some games require outside game servers/assets. Future unfamiliar names use automatic rules; catalogue-overrides.json can correct their genre/device. Matching uses game and image basenames.

This package has already been built and sample launchers tested locally. It has NOT been uploaded to GitHub or deployed to your Vercel project. Vercel rejected project access through the connected app; GitHub/GitLab writes were unavailable.

## 1. Download and extract

1. Download scholaris-auto-setup.zip from this conversation. Ignore the earlier three ZIPs for this workflow.
2. Open Apple's Files app, then Downloads. Tap scholaris-auto-setup.zip once to extract it.
3. Open the extracted folder. You should see index.html, build.mjs, package.json, package-lock.json, vercel.json, three catalogue/existing-game JSON files, two license files, and these instructions.
4. Do not upload the ZIP itself. GitHub must receive the extracted files.

## 2. Upload the files to the website repository

1. In Safari open https://github.com/AetherIncarnate/ScholarisPORTABLE and sign in with an account allowed to edit it.
2. Make sure the branch is main. Stay at the TOP LEVEL where the old index.html is visible, not inside games or another folder.
3. If buttons are missing, open Safari's page menu and choose Request Desktop Website.
4. Tap Add file, then Upload files. If the layout is narrow, look for the plus button/menu near the file list.
5. Tap Choose your files, then Browse. Open the extracted setup folder in Files.
6. Select ALL the files inside it, not the enclosing folder. Use Select if needed. Confirm/Open to upload. Every individual file is below 25 MB; index.html is about 9.6 MB.
7. Wait until every upload has finished. Replacing the existing index.html and vercel.json is intentional.
8. Enter the commit message 'Add automated GitLab game build'. Choose Commit directly to main if available, then Commit changes. If repository rules require a pull request, create and merge it instead.
9. Check the repository root: build.mjs and package.json must sit beside index.html. Do NOT create an extra scholaris-auto folder around them.

Leave existing games files and other root files alone. The new build outputs only its generated dist folder, so old files are not automatically copied into the deployment. Required original game data is already embedded in the supplied index.html. The old netlify.toml is not used by Vercel.

## 3. Check Vercel build settings

1. Open https://vercel.com/dashboard and select the project serving scholaris-azure.vercel.app. Make sure you are in the correct personal account/team.
2. Open Settings, then Git. Confirm the connected repository is AetherIncarnate/ScholarisPORTABLE and the Production Branch is main. Do not disconnect/reconnect an already correct repository.
3. Open Settings, then Build and Deployment (some dashboard layouts call this Build & Development Settings).
4. Framework Preset: Other.
5. Root Directory: leave blank / repository root. If it currently points to a subfolder, change it to the root.
6. Build Command: npm run build.
7. Output Directory: dist.
8. Install Command: npm ci.
9. Node.js Version: 22.x.
10. Save any changes. The supplied vercel.json also declares the build command, install command, framework and output directory; Vercel may show that configuration-file values take precedence.
11. No environment variables or secrets are required. Leave existing unrelated environment variables alone. Do not add LOCAL_GAMES_ZIP or LOCAL_IMAGES_ZIP; those are only for local testing.

If the GitHub commit has already created a deployment, wait for it; if settings changed after it started, redeploy afterwards.

## 4. Deploy

1. Open the project's Deployments tab.
2. Find the latest deployment for main. If it is building, open its logs and wait.
3. If no build was triggered, or it used the previous settings, use the latest production deployment's three-dot menu and choose Redeploy. Check that the source corresponds to your new commit; if not, deploy the new commit from the connected repository rather than rebuilding an old one.
4. Where offered, turn OFF Use existing Build Cache for the first build, then confirm Redeploy.
5. Logs should include 'Upstream revision', 'Built 729 imported games; skipped 78 overlaps; 0 warnings.' and 'Static output: dist'. Counts may differ if the GitLab library changes.
6. Wait for Ready and confirm it is a PRODUCTION deployment assigned to scholaris-azure.vercel.app. A preview deployment alone does not update the public domain.
7. If it fails, open Build Logs and copy the first actual error. Do not upload the extracted games manually. GitLab download failures fail the build rather than publishing an empty new library; a failed replacement deployment normally leaves the previous production deployment active.

## 5. Verify the live site

1. Open https://scholaris-azure.vercel.app/#/ and reload. Use a fresh private tab if Safari shows an old copy. A private tab has separate local saves/accounts.
2. The dark education cover should appear first.
3. Use Sign in and enter the arcade password: femboy. The arcade should open in the same tab and URL.
4. Search for Slime Rancher and Team Fortress 2 (imports), then Geometry Dash Full Version (existing version should win).
5. Open a game and check its thumbnail, player controls, Close, and fullscreen. Test on the actual iPad; browser APIs and external game servers can differ.
6. Existing admin gate remains green_apples at #/admin. These are client-side gates, NOT strong security or a server account system. Browser-local edits/saves do not sync between devices.
7. Optional diagnostics: https://scholaris-azure.vercel.app/library/build-report.json shows the upstream commit, imported count and skipped names. /library/manifest.json contains the generated catalogue.

If the cover works but imports are missing, check build-report.json and Vercel build logs first. If the page says it cannot load the catalogue, verify the Output Directory is dist and library/manifest.json returns JSON, not the home page.

## 6. Update games later

If you have permission to update the GitLab repository:
1. Update games.zip and images-webp.zip in scholaris-team/scholaris on main. Preserve matching HTML and WebP basenames. Keep both final archives in place before deploying.
2. In Vercel, Redeploy the latest correct main deployment WITHOUT the existing build cache. The build fetches the latest GitLab main commit each time it runs.
3. Wait for Ready, then check build-report.json and reload the site.

If you do not control that GitLab repository, you can still redeploy to pick up whatever its owner has published. Uploading ZIPs elsewhere will not change this build's source.

IMPORTANT: GitLab ZIP changes alone DO NOT trigger this GitHub-connected Vercel project. Manual Redeploy is required in this setup. Website commits to the connected GitHub main branch should trigger normal Vercel deployments if Git integration is enabled. A future GitLab webhook + secret Vercel Deploy Hook can automate cross-repository triggering, but is not configured here. Never put a secret hook URL into index.html or a public repository.

## Uploaded files and generated files

Upload: all files in this extracted setup folder.
Never manually upload: node_modules, dist, the source ZIP archives, or thousands of generated game assets.
Vercel installs locked dependencies and generates dist on each build. The library is served from the SAME domain as the page; public browsers do not download GitLab ZIPs.
