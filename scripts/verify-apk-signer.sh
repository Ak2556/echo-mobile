#!/usr/bin/env bash
#
# Refuse an APK signed with Expo's shared Android debug key.
#
# Usage: scripts/verify-apk-signer.sh <path-to-apk>
#
# React Native's template hardcodes `release { signingConfig signingConfigs.debug }`,
# and `expo prebuild` regenerates build.gradle from that template on every CI
# run. plugins/withAndroidReleaseSigning.js overrides it, but configuration is
# exactly the sort of thing that regresses silently — a renamed property, a
# template change, a missing secret. So the durable check is on the finished
# artifact, and it runs before anything is published.
#
# fac61745… is the SHA-256 of android/app/debug.keystore, which Expo vendors
# into every prebuild (password `android`, DN `CN=Android Debug`, valid
# 2014–2052). Every Expo developer on earth holds that private key, and Android
# accepts an update signed with the same key as the installed app — so an APK
# carrying it can be replaced by anyone's build, inheriting Echo's data and
# permissions.
#
# apksigner's output format is not stable across build-tools versions:
#   newer: "V2 Signer: certificate SHA-256 digest: <hex>"
#   older: "Signer #1 certificate SHA-256: <hex>"
# Rather than parse either shape, this scans every 64-hex token in the output,
# which covers both and any V1/V3/V4 signer blocks as well.

set -euo pipefail

APK="${1:-}"
SHARED_DEBUG_SHA=fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c

if [ -z "$APK" ]; then
  echo "usage: $0 <path-to-apk>" >&2
  exit 2
fi
if [ ! -f "$APK" ]; then
  echo "error: no APK at $APK" >&2
  exit 1
fi

SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Library/Android/sdk}}"
APKSIGNER="${APKSIGNER:-$(find "$SDK/build-tools" -name apksigner -type f 2>/dev/null | sort -V | tail -1)}"
if [ -z "$APKSIGNER" ]; then
  echo "error: apksigner not found under $SDK/build-tools" >&2
  exit 1
fi

# apksigner exits 0 even when it throws on a malformed archive, so the output is
# what has to be judged, not the status.
CERTS=$("$APKSIGNER" verify --print-certs "$APK" 2>&1 || true)
echo "$CERTS"

if printf '%s' "$CERTS" | grep -qi 'ApkFormatException\|not a ZIP archive'; then
  echo "error: $APK is not a valid APK" >&2
  exit 1
fi

DIGESTS=$(printf '%s' "$CERTS" | grep -ioE '[0-9a-f]{64}' | tr 'A-F' 'a-f' | sort -u || true)
if [ -z "$DIGESTS" ]; then
  echo "error: could not read any signer certificate from $APK" >&2
  exit 1
fi

if printf '%s\n' "$DIGESTS" | grep -qx "$SHARED_DEBUG_SHA"; then
  echo "error: this APK is signed with Expo's SHARED debug key ($SHARED_DEBUG_SHA)." >&2
  echo "       Anyone holding a stock Expo checkout could ship an update over it." >&2
  exit 1
fi

if printf '%s' "$CERTS" | grep -qi 'CN=Android Debug'; then
  echo "error: this APK is signed with an Android debug certificate." >&2
  exit 1
fi

echo
echo "OK — not debug-signed. Signer SHA-256:"
printf '%s\n' "$DIGESTS"
echo
echo "The App-signing fingerprint for ANDROID_CERT_SHA256 on Netlify must match the"
echo "key that finally signs what users install. For Play App Signing that is the"
echo "key Google holds (Play Console > Setup > App signing), NOT the upload key above."
