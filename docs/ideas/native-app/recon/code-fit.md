# Code fit notes: wrapping the web game as an app (read 2026-11-23)

These notes are project context, not research evidence. They shaped the questions; `research.md` does not cite them as sources.

## Things in our code that an app build hits

1. **Origin check on the server** (`apps/server/src/net/origin.ts`).
   - `PUBLIC_ORIGIN` lists the allowed WebSocket origins. `toOrigin` accepts only `http:`/`https:`, and a missing or `null` origin is refused.
   - An iOS Capacitor app sends `capacitor://localhost` by default (to verify in research), so the server would refuse it.
   - Fix: either the app uses an `https` scheme, or the server accepts the app origins explicitly. This is a small server change, plus a security note: native apps can send any Origin anyway.
2. **The version must match exactly.**
   - `RunRoom` refuses a join unless `balanceVersion` and `mapVersion` both equal the server's (`balance_mismatch`, "Please refresh").
   - `balanceVersion` is a hash of all balance JSON (`packages/shared/src/config/balance.ts:156`), so **any** tuning change bumps it.
   - On the web, a refresh fixes it. A store-installed app stays on its bundled version until the player updates it, and every store update waits for review.
   - Without live updates, or loading the client remotely, **every balance deploy locks app players out until their store update lands.** This is the biggest fit issue.
3. **The server URL comes from the page's origin.** `serverUrl()` = `location.origin + /api` (`apps/client/src/net/connection.ts`). Inside an app the origin is `localhost`, so the app needs an absolute URL. The `VITE_SERVER_URL` override already exists.
4. **Share links** (`apps/client/src/ui/share.ts`) build `location.origin + /j/<code>`. Inside an app that would produce `https://localhost/j/ABCD`. They must use the public origin. The page uses the Web Share API, which works in WKWebView and the Android WebView; the native `@capacitor/share` sheet is an option (to verify).
5. **Join links** (`apps/client/src/net/route.ts`) parse `location.pathname`. In an app, a Universal Link or App Link arrives as an `appUrlOpen` event instead, so a small adapter is needed.
6. **Already web-friendly:**
   - `RotateOverlay` (portrait media query) could be replaced by a real landscape lock.
   - Audio (`audio/*`) relies on the browser's unlock-on-tap.
   - The guest token is kept in `localStorage`, which survives in the app but separately from the browser.
7. **Build:** a Vite static build with `base` from `BASE_PATH`. Capacitor's `webDir` would be `apps/client/dist`. The assets are small: `public/assets` is 216 KB today, plus art in the bundle.

## Hardware and accounts on hand (from the emberfall repo)

- The designer has a **Mac with Xcode and adb**, a **Xiaomi Mi 11i** and an **iPhone**. Hermes reaches the Mac over SSH (the "Mac bridge").
- emberfall's iOS device pass was **blocked on the Apple ID sign-in in Xcode**, so a paid or free Apple developer account isn't set up yet.
- emberfall is Godot 4 with its own iOS/Android exporter. None of that toolchain transfers to a Phaser/Capacitor build. Only the device-pass habits and the `com.seven74ai.*` bundle-id style carry over.
