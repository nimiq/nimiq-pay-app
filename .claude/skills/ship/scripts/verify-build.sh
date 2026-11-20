#!/bin/bash
# Fails unless the app on the device runs the source in <worktree>. Run right before each Before/After screenshot set.
# Android reads the live process's logcat. iOS only has logs.txt, which spans launches, so the script relaunches the app
# (PIN screen again) and accepts only a stamp logged after that. Polls up to VERIFY_TIMEOUT seconds (default 60 Android,
# 90 iOS: logs.txt flushes after 15s of quiet, at most 60s).
# Usage: verify-build.sh <worktree> android [serial]
#        verify-build.sh <worktree> ios <udid>        (physical iPhone or booted simulator)
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
# logs.txt entries start with "[<ISO time>] <logger>:"; print the newest stamp logged at or after $1.
# Flushes append without a trailing newline, so a flush's first entry can sit on the previous line as "][<ISO time>] ...".
stamp_since() {
  awk -v since="$1" '
    match($0, /^\]*\[[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z\]/) { line = substr($0, RSTART, RLENGTH); sub(/^\]*\[/, "", line); ts = substr(line, 1, length(line) - 1) }
    match($0, /Build stamp [0-9a-z-]+/) { if (ts >= since) last = substr($0, RSTART + 12, RLENGTH - 12) }
    END { print last }'
}

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

case "$platform" in
  android)
    PKG=com.nimiq.pay.debug
    adb_cmd=(adb)
    [ -n "$device" ] && adb_cmd+=(-s "$device")
    # OTA bundles from before the stamp log nothing, so an older stamp would pass while one of them runs.
    base=$("${adb_cmd[@]}" shell run-as $PKG cat shared_prefs/CapWebViewSettings.xml 2>/dev/null | grep -o 'serverBasePath">[^<]*' | sed 's/.*">//')
    # Capgo stores the literal "public" for the builtin bundle, so only versions/<id> means OTA.
    case "$base" in
      *versions/*)
        echo "FAIL Capgo OTA bundle active ($base), not $worktree. See Capgo OTA trap in device.md."
        exit 1
        ;;
    esac
    ;;
  ios)
    [ -n "$device" ] || { echo "FAIL ios needs a udid"; exit 1; }
    # A booted simulator exposes its data container directly; a physical iPhone needs devicectl.
    sim_data=$(xcrun simctl get_app_container "$device" com.nimiq.pay data 2>/dev/null)
    # 5s margin for clock skew between the Mac and a physical iPhone.
    since=$(date -u -v-5S +%Y-%m-%dT%H:%M:%S)
    if [ -n "$sim_data" ]; then
      xcrun simctl launch --terminate-running-process "$device" com.nimiq.pay >/dev/null 2>&1
    else
      xcrun devicectl device process launch --terminate-existing --device "$device" com.nimiq.pay >/dev/null 2>&1
    fi || { echo "FAIL can't relaunch com.nimiq.pay on $device (phone locked, app not installed, or wrong udid)"; exit 1; }
    echo "Relaunched com.nimiq.pay: the PIN screen shows again. Waiting for its Build stamp..." >&2
    ;;
  *)
    echo "FAIL unknown platform $platform"
    exit 1
    ;;
esac

read_running() {
  running=""
  problem=""
  case "$platform" in
    android)
      pid=$("${adb_cmd[@]}" shell pidof $PKG | tr -d '\r')
      if [ -z "$pid" ]; then problem="$PKG not running"; return; fi
      # logcat is scoped to the live process. logs.txt spans launches and flushes every ~30s, so it's only the fallback.
      running=$("${adb_cmd[@]}" logcat -d --pid="$pid" | last_stamp)
      [ -z "$running" ] && running=$("${adb_cmd[@]}" shell run-as $PKG cat cache/logs.txt 2>/dev/null | last_stamp)
      ;;
    ios)
      if [ -n "$sim_data" ]; then
        running=$(stamp_since "$since" < "$sim_data/Library/Caches/logs.txt" 2>/dev/null)
      elif xcrun devicectl device copy from --device "$device" --domain-type appDataContainer --domain-identifier com.nimiq.pay \
        --source Library/Caches/logs.txt --destination "$tmp/logs.txt" >/dev/null 2>&1; then
        running=$(stamp_since "$since" < "$tmp/logs.txt")
      else
        problem="can't copy logs.txt from $device (phone locked, app not installed, or wrong udid)"
      fi
      ;;
  esac
}

if [ "$platform" = ios ]; then timeout=${VERIFY_TIMEOUT:-90}; else timeout=${VERIFY_TIMEOUT:-60}; fi
deadline=$((SECONDS + timeout))
while :; do
  read_running
  [ -n "$running" ] && [ "$running" = "$expected" ] && { echo "OK $running"; exit 0; }
  [ $SECONDS -ge $deadline ] && break
  sleep 5
done

if [ -n "$problem" ]; then
  echo "FAIL $problem"
elif [ -z "$running" ]; then
  echo "FAIL no new Build stamp in logs after ${timeout}s. Expected $expected. Reload the app (iOS: rerun this script); if still missing, a pre-stamp build is running (Capgo OTA trap in device.md)."
else
  echo "FAIL device runs $running, $worktree is $expected. Restart the dev server from that worktree, or rebuild, then reload the app."
fi
exit 1
