# Digest: local-server route, round 2 (researcher 1)

Decision: can 2–4 phones play offline at a campsite, with one phone running the real Node/Colyseus server and the others connecting over its hotspot? Accessed 2026-11-23. Budget ~15 calls. The GitHub API was blocked in this session; GitHub release pages were read through web fetch and raw.githubusercontent.

## Key finding (read first)
The current Colyseus 0.18 packages declare `engines.node >= 22.x`. The newest nodejs-mobile is Node 18.20.4, released Oct 2024 and now end-of-life. **Embedding the existing server in an app with nodejs-mobile therefore means downgrading or back-porting Colyseus.** It is not "no rewrite". Termux ships Node 26 and Node 24 LTS, so it meets the requirement.

## Findings
- colyseus 0.18.12, @colyseus/core 0.18.29 and @colyseus/ws-transport 0.18.5 all declare engines `node >= 22.x` | https://registry.npmjs.org/@colyseus/core/latest | npm registry | live registry | accessed 2026-11-23 | high | primary
- The latest nodejs-mobile release is v18.20.4 (Node 18.20.4), released 07 Oct (2024 per the matching npm date). It has prebuilt iOS arm64 + simulator and Android armeabi-v7a/arm64-v8a/x86_64 binaries. The previous releases were 18.17.x, and before that 16.17.x. No Node 20, 22 or 24 release appears | https://github.com/nodejs-mobile/nodejs-mobile/releases | nodejs-mobile (GitHub) | 2024-10-07 (latest) | accessed 2026-11-23 | high | primary
- The nodejs-mobile-react-native npm package was last published 2024-10-07 (18.20.4), with 4 releases in 2024. nodejs-mobile-cordova was last published 2021-08-16 (0.4.3). Release cadence has stalled for about 2 years | https://registry.npmjs.org/nodejs-mobile-react-native | npm registry | 2024-10-07 | accessed 2026-11-23 | high | primary
- The Capacitor plugin hampoelz/Capacitor-NodeJS v1.0.0-beta.10 (pre-release) bundles nodejs-mobile 18.20.4 with a 16 KB page fix and supports Capacitor 8. Its notes say the plugin is "no longer recommended for new projects", recommend migrating to Tauri, and state that the bundled Node 18.20 is EOL. Its release notes do not mention iOS | https://github.com/hampoelz/Capacitor-NodeJS/releases | hampoelz (GitHub) | beta.10, 26 May (year not shown; probably 2025 or 2026) | accessed 2026-11-23 | high | primary
- npm `capacitor-nodejs` has one version only (0.0.1, 2022-09-21). `nodejs-mobile-capacitor` does not exist on npm | https://registry.npmjs.org/capacitor-nodejs | npm registry | 2022-09-21 | accessed 2026-11-23 | high | primary
- The nodejs-mobile FAQ says `child_process` spawn/fork hits permission issues, Apple App Store guidelines do not allow `process.exit()`, the runtime runs single-instance on its own thread, and it cannot run inside a WebView | https://raw.githubusercontent.com/nodejs-mobile/nodejs-mobile/main/doc_mobile/FAQ.md | nodejs-mobile | undated | accessed 2026-11-23 | high | primary
- iOS apps cannot use JIT. JIT-less V8 is reported as about 3.6x slower (2020 blog measurement; not nodejs-mobile-specific) | https://dev.to/alastaircoote/to-jsc-or-not-to-jsc-running-javascript-on-ios-in-2020-44ba | DEV Community (A. Coote) | 2020 | accessed 2026-11-23 | medium | secondary
- Termux packages: `nodejs` is 26.13.1 and `nodejs-lts` is 24.22.3 (build.sh on master) | https://raw.githubusercontent.com/termux/termux-packages/master/packages/nodejs/build.sh | termux-packages (GitHub) | live master | accessed 2026-11-23 | high | primary
- F-Droid lists com.termux 0.118.3 as the suggested version, with 0.119.0-beta.2/beta.3 also available | https://f-droid.org/api/v1/packages/com.termux | F-Droid | live | accessed 2026-11-23 | high | primary
- The Termux README says the Google Play build is "Experimental", for Android 11+, "has missing functionality and bugs", and recommends F-Droid or GitHub builds. Play and F-Droid installs cannot update each other because sharedUserId was removed | https://raw.githubusercontent.com/termux/termux-app/master/README.md | Termux | live master | accessed 2026-11-23 | high | primary
- `termux-wake-lock` / `termux-wake-unlock` take a wakelock "which causes Android not to go into deep sleep" | https://wiki.termux.com/wiki/Termux-wake-lock | Termux Wiki | rev 5736, undated | accessed 2026-11-23 | high | primary
- The Android hotspot gateway was traditionally 192.168.43.1. On Android 10/11+, users report a random 192.168.x.x or /16 that changes when the hotspot is re-enabled. Samsung One UI 4+ reportedly uses 192.168.227.1 | https://b4x.com/android/forum/posts/798697 ; https://www.github.com/nebkat/esp32-xbee/issues/46 ; https://speedtesthq.com/guides/network/192-168-43-1 | B4X forum / GitHub issue / SpeedtestHQ | various | accessed 2026-11-23 | medium | secondary (forum)
- On Android 11+ the soft-AP IP can be set programmatically; a prefix conflict otherwise triggers a random IP (SoftApHelper notes) | https://github.com/zimq/SoftApHelper | zimq (GitHub) | undated | accessed 2026-11-23 | low-medium | secondary
- Java-WebSocket, the pure-Java WS server and client usable on Android, has latest version 1.6.0 on Maven Central, last updated 2024-12-15. Its README covers Android wss notes | https://repo1.maven.org/maven2/org/java-websocket/Java-WebSocket/maven-metadata.xml | Maven Central | 2024-12-15 | accessed 2026-11-23 | high | primary
- iOS Network.framework supports a WebSocket server: put `NWProtocolWebSocket.Options` in front of the TCP stack on an `NWListener`. Developers report it works, with gaps such as reading the request path. There is no official Apple server sample | https://developer.apple.com/forums/thread/693799 ; https://developer.apple.com/documentation/network/nwprotocolwebsocket | Apple Developer Forums / Docs | undated | accessed 2026-11-23 | medium | primary (docs) + forum
- The GL.iNet Mango GL-MT300N-V2 travel router costs about USD 27.90–29.99 new ($17.99 refurbished). It is powered by microUSB 5V/2A, under 2.75 W, so a phone power bank can run it | https://store-us.gl-inet.com/ ; https://www.gl-inet.com/products/gl-mt300n-v2/ | GL.iNet | live | accessed 2026-11-23 | medium (prices from search snippets) | primary
- iOS probes Apple endpoints (captive.apple.com) to decide whether a Wi-Fi network is online. A pfSense issue reports that iOS login hangs when the router has no WAN | https://support.apple.com/guide/platform-support/supc4380e13e/web ; https://redmine.pfsense.org/issues/13465 | Apple / pfSense | undated | accessed 2026-11-23 | medium | primary + issue tracker

## Synthesis (one sentence each)
- **nodejs-mobile / Capacitor:** stalled at Node 18 (EOL), and the only Capacitor plugin's own author discourages it. It conflicts with Colyseus 0.18 needing Node 22+. Not viable without pinning an older Colyseus.
- **Termux (Android host only):** Node 24/26 available, wake lock available, F-Droid is the recommended install. This is the most direct "no rewrite" path for an Android host phone, but it is a dev-ish setup for players. Listening on 0.0.0.0 is standard Node behaviour; this run did not test it on a hotspot interface.
- **Small hardware:** a USB-powered GL.iNet Mango (~$30, under 2.75 W) gives a stable LAN, but it cannot run Node itself. The server must still run on a phone, laptop or Pi on that LAN.
- **Native WS in Capacitor:** feasible on both platforms (Java-WebSocket on Android, NWListener + NWProtocolWebSocket on iOS), but it means reimplementing the Colyseus server protocol and room logic. That is effectively a rewrite of the server.

## Leads
- Pin an older Colyseus whose engines allow Node 18. Check whether 0.15 or 0.16 declares a Node 18-compatible range, and whether the 0.18 `>=22` is a hard requirement or advisory (e.g. use of `node:` built-ins or newer APIs).
- Tauri mobile (recommended by the Capacitor-NodeJS author) with a Rust WebSocket server: still a server rewrite.
- Check whether Termux:Boot or a Termux:Widget shortcut can give players a one-tap "start server" button.
- Test whether Android clients on a phone hotspot without internet keep sending LAN traffic and do not fall back to mobile data. Android's "no internet, stay connected?" prompt needs evidence; none was found this run.
- Check whether iOS Safari needs any "Local Network" permission to reach a private IP. It is believed not to (that permission applies to apps), but this was not verified.
- GL.iNet routers run OpenWrt. A Node package for MIPS/ARM routers is a possible on-router server for higher-end models (e.g. GL-MT3000 with ARM64 and more RAM); not checked.

## Looked for but could not find
- Any nodejs-mobile release newer than 18.20.4, or a roadmap to Node 20/22.
- Explicit App Store acceptance statements or iOS performance benchmarks for nodejs-mobile itself.
- An official Apple sample of a WebSocket server on NWListener.
- An evidence-backed description of how Android or iOS behave as clients on a no-WAN hotspot or router (whether they stay connected, route LAN traffic, or show a captive sheet). Only indirect sources were found.
- Android "local web server" apps that serve static files to hotspot clients (not searched due to budget). Raspberry Pi or laptop prices and battery examples (not searched due to budget).
- Client isolation on Android hotspots (whether clients can reach each other or only the host): no source found. Clients only need to reach the host here.
