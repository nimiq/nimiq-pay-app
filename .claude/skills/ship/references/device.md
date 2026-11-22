# Device testing

Run `scripts/device-preflight.sh` first. Lists devices, LAN IP, :8100 owner, checks Capgo OTA trap. Test wallet app PIN from env `NIMPAY_TEST_PIN`; if unset, ask user once, then type it yourself every time. Testnet only. Device wallet on mainnet: read-only or cancel-only scenarios fine; anything that signs needs testnet wallet, so ask. Never log out, clear data or switch networks on user's device unless scenario needs it and you restore after.

**Language:** Nimiq Pay must show English in every screenshot set, unless scenario tests language. Check before first set. Change in Settings → General → Language, or on Android over CDP (see "Live state"): `$pinia._s.get('app').language = 'en'`, then reload app. Value persists. Leave it English.

## Before / After builds

- **After:** issue worktree. Run `pnpm dev --host 0.0.0.0 --port 8100`. Debug app loads `http://<LAN-IP>:8100`.
- **Before:** detached `main` worktree at `<repo>/.claude/worktrees/main-baseline`. Create if missing (`git worktree add --detach … origin/main`, `ln -s <repo>/.env`, copy `android/local.properties`, submodule update, `pnpm install`). Else run `git fetch && git checkout --detach origin/main` inside it, then `git submodule update --init --recursive` and `pnpm install --frozen-lockfile` (main may have moved pin or lockfile).
- If baseline built by symlinking `node_modules` instead of `pnpm install`, also copy gitignored `public/nimiq/{launcher,lib,web}`, `public/web3-provider.js` and `web3-provider/dist/provider.js`, else app throws "Nimiq is not defined".
- Only one server may own :8100 (`lsof -iTCP:8100 -sTCP:LISTEN`). Kill own server between runs. When done, see "When done".
- Reload app after switching servers. Wait for home transaction list to load before testing: blank sheets during sync not regressions.
- Before each screenshot set, run `scripts/verify-build.sh <that worktree> android|ios [device]`. Passes only when device runs that worktree's source, uncommitted changes included. Polls for stamp, so don't add `sleep`. Works for Android, physical iPhone, iOS simulator (pass udid). On iOS it relaunches app and waits up to 90 s for stamp logged after relaunch (`logs.txt` spans launches), so enter PIN again afterwards. Editing bundled files after server start = mismatch until server restart. Doesn't cover gitignored `.env` or stale `web3-provider` build: run `pnpm build:web3-provider` after provider changes.

### Bundled build instead of the dev server

Use bundled build when dev server can't show behavior:
- resume, reload or cold start (Vite dev server cancels app's resume reload with -999)
- performance
- prod-only behavior (`import.meta.env.DEV` checks, dev-only Demo App)
- native code or plugin changes

Steps, inside worktree:
1. Web bundle: `pnpm exec vite build`. No `pnpm build`. Avoid `pnpm build:web`: reruns `i18n:extract`, dirties `src/i18n/en.po`.
2. Android: `npx cap sync android`, then `cd android && ./gradlew :app:installDebug`. Needs `android/local.properties` (SKILL.md phase 2). After plugin version bump run `./gradlew :app:clean` first, else Gradle reports "up to date" and installs stale APK.
3. iOS: `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx cap sync ios` (pod install crashes without it), then build and install as in "iOS (physical iPhone)". To point native build at dev server instead, set `server.url` (and `cleartext: true`) after sync in gitignored `ios/App/App/capacitor.config.json` or `android/app/src/main/assets/capacitor.config.json`.
4. Before committing, revert every temporary edit (`versionCode`, `CFBundleVersion`, `Podfile.lock`, `en.po`): `git status` shows only fix.

## Capgo OTA trap

Reinstalled debug build with same build number keeps running last downloaded production OTA bundle, so JS fixes look broken.
- Android: `adb shell run-as com.nimiq.pay.debug cat shared_prefs/CapWebViewSettings.xml`. `serverBasePath` pointing at `files/versions/<id>` = OTA bundle running. Install once with temporary `versionCode` bump in `android/app/build.gradle`, revert after (never commit).
- iOS: same, temporary `CFBundleVersion` bump in `ios/App/App/Info.plist`.
- Confirm by `index-*.js` name in app logs.

## Android (adb)

- Wake and unlock: `adb shell input keyevent KEYCODE_WAKEUP; adb shell wm dismiss-keyguard`. If `dumpsys window | grep isKeyguardShowing` still true, phone's own PIN needed: ask user once.
- App PIN: tap PIN dot, then poll `adb shell dumpsys input_method | grep -o 'mInputShown=[a-z]*'` until it prints `mInputShown=true`, then `adb shell input text "$NIMPAY_TEST_PIN"`. Typing before keyboard shows drops digits.
- Password manager autofill prompt (e.g. Bitwarden "save?") can cover app after PIN entry: tap its "No" / "Not now", never save.
- Screenshot: `adb exec-out screencap -p > <state>/<scenario>-<before|after>.png`.
- Logs: `adb shell run-as com.nimiq.pay.debug cat cache/logs.txt` (flushed ~30s) and `adb logcat -d --pid=$(adb shell pidof com.nimiq.pay.debug) | grep Capacitor/Console`. Use grep table in `docs/device-debugging.md`.
- Live state: `adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>`, then CDP `Runtime.evaluate` on `document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('<store>')`.
- HTLC scenarios: htlc-lab at `http://127.0.0.1:5190` needs visible browser tab or block height freezes. Buttons need full pointer/mouse event dispatch; set inputs via form_input. Inventory can label basic account at old HTLC address "Expired · funded". Split-HTLC repro: "Two funded HTLCs", then cleanup "Return B funds" only (older A funded, newer B empty, cosigner reports B).
- Fresh DB: `adb shell pm clear com.nimiq.pay.debug` (logout requires backup quiz). Import words: tap field 01, then per word `adb shell input text <word>` + `adb shell input keyevent 62` (space), ~0.8s apart. Tapping next field hits suggestion dropdown.
- Perf measurement: serve prod build with `vite preview --host 0.0.0.0 --port 8100 --outDir <dir>`. Count native calls by wrapping `window.Capacitor.toNative` over CDP; wrapper must never throw (plugin calls pass `opts` undefined; throwing wrapper once silently broke notifications). CPU profile via CDP `Profiler.start` with `vite build --sourcemap`.

## iOS (physical iPhone)

- Ask user once, up front, to unlock phone and approve UI runner. Bundle with any other question.
- Build and install: `xcodebuild -workspace ios/App/App.xcworkspace -scheme App -destination id=<udid> -derivedDataPath <state>/DerivedData -allowProvisioningUpdates build`, then `xcrun devicectl device install app --device <udid> <state>/DerivedData/Build/Products/Debug-iphoneos/App.app` and launch with `xcrun devicectl device process launch --device <udid> com.nimiq.pay`. `cap run ios --target` doesn't see phone.
- Signing: Xcode-managed wildcard team profile (`iOS Team Provisioning Profile: *`) signs automatically; don't set provisioning profile. Xcode account login rejected, so no new profiles. Debug build uses bundle id `com.nimiq.pay`, replaces store app.
- Drive UI with agent-device: `node ~/.t3/tools/agent-device/<ver>/node_modules/agent-device/bin/agent-device.mjs <command> --session ship-<issue> --platform ios --udid <udid>` with `AGENT_DEVICE_STATE_DIR=<state>/agent-device`, `AGENT_DEVICE_IOS_TEAM_ID=ZK66THWMSR`, `AGENT_DEVICE_IOS_BUNDLE_ID=com.nimiq.agentdevice.runner`. One session name per issue, never shared: unclosed shared session blocks every later run. Re-snapshot before each press; refs shift after sheets close. First runner start can time out: retry `snapshot -i`. T3 device hub lists simulators only.
- `DEVICE_IN_USE` (device owned by another session): `agent-device device status --udid <udid>` names owner (each run has own state dir, so your `session list` can't see it). `device release --stale --udid <udid>` clears dead owner. Live owner → name it and its last activity, ask once to close all idle sessions together, never one at a time.
- Runner gotchas:
  - First runner start shows XCTest passcode prompt on phone: user enters passcode.
  - Taps fail with "lost its transport response": ask user to toggle Settings → Developer → Enable UI Automation off and on.
  - Face ID sheet on launch: `alert dismiss`, then press PIN dot and `type <PIN>`.
  - agent-device can't write clipboard on physical iPhone: `pbcopy` on Mac, paste through Universal Clipboard.
  - Side button, app switcher, Control Center can't be automated: ask user.
- Logs: `xcrun devicectl device copy from --device <udid> --domain-type appDataContainer --domain-identifier com.nimiq.pay --source Library/Caches/logs.txt --destination <state>/ios-logs.txt`.

## Mini App test pages

- Serve page on Mac (`python3 -m http.server <port>` or vite).
- `http://` Mini Apps open only in dev builds, only from `localhost` or private LAN IPs (`src/modals/mini-app-search.ts`). `nimiqpay://miniapp` deep link rejects `http` and `localhost`, so open URL from Mini Apps search field. Bundled test builds: `NODE_ENV=development pnpm exec vite build --mode development`.
- Android: `adb reverse tcp:<port> tcp:<port>`, open `http://localhost:<port>`. macOS firewall can block LAN access from phone.
- iOS: no `adb reverse`; use `http://<LAN-IP>:<port>` with dev build. `window.prompt()` doesn't work in iOS Mini App webview, so example dapp's prompt flows need another input.

## Screenshots

- Crop: `magick in.png -crop WxH+X+Y +repage out.png`. Don't use `sips -c`: crops around center, wrong offset once uploaded a balance.
- Blur balance or address: `magick in.png -region WxH+X+Y -blur 0x30 out.png`.
- PIL not installed. Open exact output file afterwards: crop that fails silently leaves original.

## When done

At end of every device phase, and before handing phone to user:
- Run `agent-device close --session ship-<issue>` (same `AGENT_DEVICE_STATE_DIR`).
- Log original wallet back in, restore network and app settings (language stays English).
- Revert temporary `versionCode`, `CFBundleVersion` and `server.url` edits.
- Remove `adb reverse` and `adb forward` rules you added (`adb reverse --remove tcp:<port>`, `adb forward --remove tcp:9333`).
- Lock Android phone: `adb shell input keyevent KEYCODE_SLEEP`.
- Shut down emulators and simulators you booted unless still needed (`agent-device close --shutdown`; T3 `device_close`). Mention booted ones you didn't boot.
- Servers: check left to user (manual test, `blockedOnUser`) → leave After worktree serving on :8100, run `verify-build.sh` once more, name running build under **Blocked on me**. Otherwise kill your servers, leave :8100 as found. Batch workflow device stages always restore main on :8100 (`references/batch.md`).
- Can't restore something (debug build replaced store app on iPhone) → list it under **Blocked on me**.

## What can't be tested

- USDT HTLC paths on testnet: testnet config keeps mainnet contract addresses. Say so in PR.
- Push notification delivery on simulator: put under **Blocked on me** as manual check.
- No device connected: test what possible on web build (`pnpm dev`, Playwright), list device check under **Blocked on me**.