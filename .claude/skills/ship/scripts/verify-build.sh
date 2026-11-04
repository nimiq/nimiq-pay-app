#!/bin/bash
# Fails unless the app on the device runs the source in <worktree>. Run right before each Before/After screenshot set.
# Usage: verify-build.sh <worktree> android [serial]
#        verify-build.sh <worktree> ios <udid>
set -uo pipefail
worktree=${1:?worktree required}
platform=${2:?android or ios required}
device=${3:-}

expected=$(cd "$worktree" && node scripts/build-stamp.mjs 2>/dev/null)
if [ -z "$expected" ] || [ "$expected" = unknown ]; then
  echo "FAIL can't compute stamp in $worktree (no scripts/build-stamp.mjs, or not a git checkout)"
  exit 1
fi

# The app logs a stamp on every page load, so the newest line describes the live JS.
last_stamp() { grep -aoE 'Build stamp [0-9a-z-]+' | tail -1 | awk '{print $3}'; }

case "$platform" in
  android)
    PKG=com.nimiq.pay.debug
    adb_cmd=(adb)
    [ -n "$device" ] && adb_cmd+=(-s "$device")
    pid=$("${adb_cmd[@]}" shell pidof $PKG | tr -d '\r')
    if [ -z "$pid" ]; then
      echo "FAIL $PKG not running"
      exit 1
    fi
    # OTA bundles from before the stamp log nothing, so an older stamp would pass while one of them runs.
    base=$("${adb_cmd[@]}" shell run-as $PKG cat shared_prefs/CapWebViewSettings.xml 2>/dev/null | grep -o 'serverBasePath">[^<]*' | sed 's/.*">//')
    # Capgo stores the literal "public" for the builtin bundle, so only versions/<id> means OTA.
    case "$base" in
      *versions/*)
        echo "FAIL Capgo OTA bundle active ($base), not $worktree. See Capgo OTA trap in device.md."
        exit 1
        ;;
    esac
    # logcat is scoped to the live process. logs.txt spans launches and flushes every ~30s, so it's only the fallback.
    running=$("${adb_cmd[@]}" logcat -d --pid="$pid" | last_stamp)
    [ -z "$running" ] && running=$("${adb_cmd[@]}" shell run-as $PKG cat cache/logs.txt 2>/dev/null | last_stamp)
    ;;
  ios)
    [ -n "$device" ] || { echo "FAIL ios needs a udid"; exit 1; }
    tmp=$(mktemp -d)
    trap 'rm -rf "$tmp"' EXIT
    xcrun devicectl device copy from --device "$device" --domain-type appDataContainer --domain-identifier com.nimiq.pay \
      --source Library/Caches/logs.txt --destination "$tmp/logs.txt" >/dev/null 2>&1
    running=$(last_stamp < "$tmp/logs.txt" 2>/dev/null)
    ;;
  *)
    echo "FAIL unknown platform $platform"
    exit 1
    ;;
esac

if [ -z "$running" ]; then
  echo "FAIL no Build stamp in logs. Expected $expected. Reload and wait 30s; if still missing, a pre-stamp build is running (Capgo OTA trap in device.md)."
  exit 1
fi
if [ "$running" != "$expected" ]; then
  echo "FAIL device runs $running, $worktree is $expected. Restart the dev server from that worktree, or rebuild, then reload the app."
  exit 1
fi
echo "OK $running"
