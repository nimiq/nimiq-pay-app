#!/bin/bash
# Read-only device preflight for Nimiq Pay testing. Prints what is connected and what needs fixing.
# Usage: device-preflight.sh
set -uo pipefail
PKG=com.nimiq.pay.debug

echo "== LAN IP"
ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "unknown"

echo "== :8100 owner"
lsof -nP -iTCP:8100 -sTCP:LISTEN 2>/dev/null | awk 'NR>1{print $1, $2}' | sort -u || true
pid=$(lsof -t -iTCP:8100 -sTCP:LISTEN 2>/dev/null | head -1)
[ -n "$pid" ] && echo "cwd: $(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')" || echo "free"

echo "== Android"
if command -v adb >/dev/null; then
  for s in $(adb devices | awk 'NR>1 && $2=="device"{print $1}'); do
    model=$(adb -s "$s" shell getprop ro.product.model | tr -d '\r')
    rel=$(adb -s "$s" shell getprop ro.build.version.release | tr -d '\r')
    keyguard=$(adb -s "$s" shell dumpsys window 2>/dev/null | grep -o 'isKeyguardShowing=[a-z]*' | head -1)
    app=$(adb -s "$s" shell pidof $PKG | tr -d '\r')
    ver=$(adb -s "$s" shell dumpsys package $PKG 2>/dev/null | grep -m1 versionName | tr -d ' \r')
    base=$(adb -s "$s" shell run-as $PKG cat shared_prefs/CapWebViewSettings.xml 2>/dev/null | grep -o 'serverBasePath">[^<]*' | sed 's/.*">//')
    echo "$s | $model Android $rel | ${keyguard:-keyguard?} | app pid ${app:-not running} | ${ver:-not installed}"
    if [ -n "$base" ]; then echo "  WARNING Capgo OTA bundle active ($base): JS changes won't show. See references/device.md"; fi
  done
  [ -z "$(adb devices | awk 'NR>1 && $2=="device"')" ] && echo "none"
else
  echo "adb not installed"
fi

echo "== iOS (physical)"
if command -v xcrun >/dev/null; then
  xcrun devicectl list devices 2>/dev/null | grep -w physical || echo "none"
fi
