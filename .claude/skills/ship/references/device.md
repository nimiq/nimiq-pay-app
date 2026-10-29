# Device testing

Run `scripts/device-preflight.sh` first. Lists devices, LAN IP, :8100 owner, checks Capgo OTA trap. Test wallet app PIN comes from env `NIMPAY_TEST_PIN`; if unset, ask once and reuse it: enter yourself, don't ask. Testnet only. Never log out, clear data or switch networks on user's device unless scenario needs it and you restore after.

## Before / After builds

- **After:** issue worktree. Run `pnpm dev --host 0.0.0.0 --port 8100`. Debug app loads `http://<LAN-IP>:8100`.
- **Before:** detached `main` worktree at `<repo>/.claude/worktrees/main-baseline`. Create if missing (`git worktree add --detach … origin/main`, copy `.env`, submodule update, `pnpm install`). Else `git fetch && git checkout --detach origin/main` inside it.
- If baseline built by symlinking `node_modules` instead of `pnpm install`, also copy gitignored `public/nimiq/{launcher,lib,web}`, `public/web3-provider.js` and `web3-provider/dist/provider.js`, else app throws "Nimiq is not defined".
- Only one server may own :8100 (`lsof -iTCP:8100 -sTCP:LISTEN`). Kill own server between runs. When done, leave baseline server running in background as found.
- Reload app after switching servers. Wait for home transaction list to load before testing: blank sheets during sync not regressions.

## Capgo OTA trap

Reinstalled debug build with same build number keeps running last downloaded production OTA bundle, so JS fixes look broken.
- Android: `adb shell run-as com.nimiq.pay.debug cat shared_prefs/CapWebViewSettings.xml`. `serverBasePath` pointing at `files/versions/<id>` = OTA bundle running. Install once with temporary `versionCode` bump in `android/app/build.gradle`, revert after (never commit).
- iOS: same, temporary `CFBundleVersion` bump in `ios/App/App/Info.plist`.
- Confirm by `index-*.js` name in app logs.

## Android (adb)

- Wake and unlock: `adb shell input keyevent KEYCODE_WAKEUP; adb shell wm dismiss-keyguard`. If `dumpsys window | grep isKeyguardShowing` still true, phone's own PIN needed: ask user once.
- App PIN: tap PIN field, `adb shell input text "$NIMPAY_TEST_PIN"`.
- Screenshot: `adb exec-out screencap -p > /tmp/ship/<ISSUE>/<scenario>-<before|after>.png`.
- Logs: `adb shell run-as com.nimiq.pay.debug cat cache/logs.txt` (flushed ~30s) and `adb logcat -d --pid=$(adb shell pidof com.nimiq.pay.debug) | grep Capacitor/Console`. Use grep table in repo CLAUDE.md.
- Live state: `adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>`, then CDP `Runtime.evaluate` on `document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('<store>')`.
- HTLC scenarios: htlc-lab at `http://127.0.0.1:5190` needs visible browser tab or block height freezes. Buttons need full pointer/mouse event dispatch; set inputs via form_input. Inventory can label basic account at old HTLC address as "Expired · funded". Split-HTLC repro: "Two funded HTLCs", then cleanup "Return B funds" only (older A funded, newer B empty, cosigner reports B).
- Fresh DB: `adb shell pm clear com.nimiq.pay.debug` (logout requires backup quiz). Import words: tap field 01, then per word `adb shell input text <word>` + `adb shell input keyevent 62` (space), ~0.8s apart. Tapping next field hits suggestion dropdown.
- Perf measurement: serve prod build with `vite preview --host 0.0.0.0 --port 8100 --outDir <dir>`. Count native calls by wrapping `window.Capacitor.toNative` over CDP; wrapper must never throw (plugin calls pass `opts` undefined; throwing wrapper once silently broke notifications). CPU profile via CDP `Profiler.start` with `vite build --sourcemap`.

## iOS (physical iPhone)

- Ask user once, up front, to unlock phone and approve UI runner. Bundle with any other question.
- Build and install: `xcodebuild -workspace ios/App/App.xcworkspace -scheme App -destination id=<udid> -allowProvisioningUpdates build`, then `xcrun devicectl device install app --device <udid> <App.app>`. `cap run ios --target` doesn't see phone.
- Signing: Xcode-managed wildcard team profile (`iOS Team Provisioning Profile: *`) signs automatically; don't set provisioning profile. Xcode account login was rejected, so no new profiles. Debug build uses bundle id `com.nimiq.pay`, replaces store app.
- Drive UI with agent-device: `node ~/.t3/tools/agent-device/<ver>/node_modules/agent-device/bin/agent-device.mjs … --session ship` with `AGENT_DEVICE_STATE_DIR=<fresh dir>`, `AGENT_DEVICE_IOS_TEAM_ID=ZK66THWMSR`, `AGENT_DEVICE_IOS_BUNDLE_ID=com.nimiq.agentdevice.runner`. Re-snapshot before each press; refs shift after sheets close. First runner start can time out: retry `snapshot -i`. T3 device hub lists simulators only.
- Logs: `xcrun devicectl device copy from --device <udid> --domain-type appDataContainer --domain-identifier com.nimiq.pay --source Library/Caches/logs.txt --destination /tmp/ship/<ISSUE>/ios-logs.txt`.

## What can't be tested

- USDT HTLC paths on testnet: testnet config keeps mainnet contract addresses. Say so in PR.
- Push notification delivery on simulator: put under **Blocked on me** as manual check.
- No device connected: test what possible on web build (`pnpm dev`, Playwright), list device check under **Blocked on me**.