# Building and publishing the Android APK

The build is `eas build --local`. Two environment problems will stop it, and
neither error message names its own cause — both are pinned in `.envrc`, so
`direnv allow` once after cloning is usually all this page is for.

## The two traps

**`SDK location not found`** — `ANDROID_HOME` is unset. A login shell may have
it from your profile while a backgrounded build, a CI job or an editor task
does not, so this appears only sometimes and looks like a project problem.

**Five `:configureCMakeRelWithDebInfo[arm64-v8a]` tasks fail** with nothing but:

```
WARNING: A restricted method in java.lang.System has been called
```

That is a JDK version mismatch, not a warning to skip past. React Native 0.81's
CMake step needs **JDK 17**; on macOS `brew install openjdk` gives you 24, which
fails exactly this way. Check with `java -version` before believing anything
else the log says.

## Building

```bash
direnv allow                     # once per clone
npx eas build --local --platform android --profile preview \
  --non-interactive --output ./echo-$(git rev-parse --short HEAD).apk
```

Roughly 15–25 minutes from cold. `npm ci` and the JS bundle come first; Gradle
is the long tail.

Confirm the output before shipping it:

```bash
"$ANDROID_HOME"/build-tools/*/aapt2 dump badging ./echo-*.apk | head -3
```

## Publishing

Downloads are served from R2 through the worker at a **stable key**, so pages
already shared keep working:

```
https://echo-mobile.at3236129.workers.dev/media/echo-media/downloads/echo-latest.apk
```

Overwrite it and every page that links it serves the new build. Nothing needs
re-sending.

```bash
npx wrangler r2 object put echo-media/downloads/echo-latest.apk \
  --file=./echo-<sha>.apk \
  --content-type=application/vnd.android.package-archive \
  --content-disposition='attachment; filename="Echo.apk"' \
  --remote
```

Both flags are required, and the second one fails silently if you forget it:
without `content-disposition`, WhatsApp and some mail clients save the file as
`.bin` and Android then refuses to install it. R2 stores these as object
metadata, so they do **not** carry over from a previous upload to the same key.

Verify what is actually being served, rather than trusting "Upload complete":

```bash
URL=https://echo-mobile.at3236129.workers.dev/media/echo-media/downloads/echo-latest.apk
curl -sIL "$URL" | grep -i -E '^HTTP/|content-type|content-disposition'
curl -sL "$URL" | shasum -a 256          # compare against the local APK
```

## Note on what needs a build at all

JS-only changes reach devices through `eas update` and do not need this.
A build is only required for native changes — app icon, permissions, native
modules, SDK upgrades. Commit and push before publishing an update: `eas
update` bundles the working tree, so publishing from uncommitted code puts JS
on phones that exists nowhere in git.
