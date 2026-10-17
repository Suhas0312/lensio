# Automatic Android releases

After this one-time setup you never build or publish the app by hand again.

**You:** when you want a new app version, raise `"version"` in `mobile/app.json` (e.g. 3.3.0 → 3.4.0) and upload it.
**GitHub (automatically):** APK built on Expo → GitHub release with `lensio.apk`.

Uploads that don't raise the version are just saved: no new app version is published (small fixes can wait for the next release).
**Lensio server (automatically, within ~5 minutes):** `/download`, `/download/lensio.apk` and the in-app
"Update available" window switch to the new version. No admin step.

## One-time setup (10 minutes)

1. **Expo token**: expo.dev → log in → your avatar → **Account settings → Access tokens → Create token**
   (name: `github`). Copy it.
2. **Give it to GitHub**: github.com/Suhas0312/lensio → **Settings → Secrets and variables → Actions →
   New repository secret** → Name `EXPO_TOKEN`, Secret: paste → **Add secret**.
3. **Allow releases**: same repo → **Settings → Actions → General → Workflow permissions →
   Read and write permissions → Save**.
4. **Tell Lensio where releases are**: admin → **Settings → Android app download → GitHub repo with your app
   releases** → `Suhas0312/lensio` → **Save**.
5. Delete `.github/workflows/deno.yml` if it is still there (it is for a different kind of project).

## Watching a release

GitHub repo → **Actions** tab → **Android app release**. A yellow dot means building (10–40 minutes),
a green tick means published. The summary shows the version and download link.

## Release by hand (without changing files)

Actions tab → **Android app release** → **Run workflow** → optionally type What's new → **Run workflow**.

## Version numbers

You decide: a release happens only when `"version"` in `mobile/app.json` is higher than the newest release.
Use 3.4.0 for a feature release, 3.3.1 for a fix release. To publish without changing the file, use
Actions → Android app release → Run workflow → tick “Release even if…” (uses the next patch number).

## Keeping the server awake

`.github/workflows/keep-awake.yml` visits the server every 10 minutes so Render's free plan doesn't put it
to sleep (customers would otherwise see Render's “Application loading” page). Nothing to set up.

## What's new text

Taken from the commit message you type when uploading (GitHub's default "Add files via upload" is skipped),
or from the box when you run it by hand. Otherwise: "Improvements and fixes."

## Repo must stay public for downloads

Customers download the APK from this repo's releases, so it must be public. To keep the code private,
publish releases from a separate public repo instead (ask for help with that change).

## Where the app is built

The APK is built **on GitHub's own machine** (free and unlimited for public repositories), so Expo's monthly
free-build limit doesn't stop releases. Expo is only used for the app's signing key and version number
(that's why the `EXPO_TOKEN` secret is still needed). A build takes about 15-30 minutes.

To build on Expo's servers instead (uses Expo's monthly free builds): Actions → Android app release →
Run workflow → tick "Build on Expo's servers".
