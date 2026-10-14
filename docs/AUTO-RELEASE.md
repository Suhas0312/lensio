# Automatic Android releases

After this one-time setup you never build or publish the app by hand again.

**You:** change anything in `mobile/` and upload it to GitHub.
**GitHub (automatically):** next version number → APK built on Expo → GitHub release with `lensio.apk`.
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

Automatic: the patch number goes up each release (2.0.2 → 2.0.3). For a bigger jump, set `"version"` in
`mobile/app.json` yourself (e.g. `3.0.0`); that version is used.

## What's new text

Taken from the commit message you type when uploading (GitHub's default "Add files via upload" is skipped),
or from the box when you run it by hand. Otherwise: "Improvements and fixes."

## Repo must stay public for downloads

Customers download the APK from this repo's releases, so it must be public. To keep the code private,
publish releases from a separate public repo instead (ask for help with that change).
