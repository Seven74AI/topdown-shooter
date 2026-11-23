---
title: 'technical research: offline local multiplayer on phones'
type: 'technical'
topic: 'Playing topdown-shooter together with no internet (Bluetooth, local Wi-Fi, hotspot, native wrappers)'
decision: 'Can 2–4 friends play together on their phones with no internet, and which route is worth building?'
source: 'native run (bmad-deep-recon), 6 researcher digests in recon/digests/, 2 rounds'
status: complete
preset: 'standard'
validation: 'normal'
claims_verified: 8
claims_unverified: 6
created: '2026-11-23'
updated: '2026-11-23'
---

# Technical research: offline local multiplayer on phones

**Decision this research serves:** can 2–4 friends play together on their phones with no internet (a campsite with no mobile data), and which route is worth building?

Workspace: digests in `recon/digests/`, process log in `recon/.memlog.md`, code-fit notes in `recon/code-fit.md` (project context; it shapes the questions but is not cited as evidence).

## Executive summary

**Yes, it can work, but only over Wi-Fi, and only if one device runs the game for everyone and the others connect to it.** Bluetooth is out. The cheapest reliable network is an **Android phone's hotspot or a ~$30 travel router**; an **iPhone hotspot is the weak link**.

What drives that answer:

1. **Bluetooth is impossible from the browser and too slow even natively.**
   - Web Bluetooth can only connect *to* a device (central role). No browser can advertise or host [1][3].
   - iPhone Safari has no Web Bluetooth, and WebKit opposes it [1][2].
   - Natively, iOS manages roughly 50 kB/s per BLE link, shared between links [4]. A host sending 3 guests our ~25 KB/s peak each needs ~75 KB/s.
2. **iPhone hotspots are unreliable for this.**
   - Personal Hotspot is reported greyed out when Cellular Data is off [12], and only a person can switch it on in Settings [13].
   - Since iOS 18, hotspot clients can't reach each other over IPv4 or multicast [11].
   - Android hotspots generally run with mobile data off (anecdotal) [15][16], and a native Android app can make its own local-only hotspot [14].
3. **The browser can't run a server; it can only be a client.**
   - Phone-to-phone in pure web means WebRTC with QR pairing. That rests on unverified pieces: masked local addresses (mDNS) on hotspots [9][10][11], and Chrome Android mDNS, for which no current evidence was found.
   - The robust alternative is a real server on the host device, with guests opening a plain `http://` page from it and connecting by WebSocket. Safari blocks `ws://` from an `https://` page [27], so the guests' page must come from the host itself, not from the installed online game.

**Biggest caveat:** several load-bearing points (iPhone hotspot with no signal, WebRTC on a hotspot, iPadOS/iOS 26 local WebSocket bugs [28][29]) are forum-grade or untested. A **one-evening device test** with the group's real phones settles them, and should come before any build.

## 1. Bluetooth and browser radio APIs

- **Web Bluetooth (Android Chrome):** shipped as a GATT *client* only. Scanning and advertisement watching are still behind flags [1].
  - Peripheral or advertising support (issue #231) has been open since 2016. A maintainer called it "a long way off", and nothing has been linked since 2022 [3].
  - MDN lists no interface for a page to host a GATT server [1][3].
  - **Phone-to-phone over Web Bluetooth is impossible today** (high confidence).
- **iPhone:** no Web Bluetooth in Safari or any iOS browser (all use WebKit).
  - A Google engineer wrote in 2024 that "the WebKit project continues to be opposed" [2].
  - Only third-party wrapper browsers such as Bluefy exist, and they are client role only [1].
- **Native BLE throughput:**
  - The minimum connection interval is 15 ms on iOS and 7.5 ms on Android. iOS uses about half of each interval, so roughly 50 kB/s each way. Multiple links share airtime [4].
  - Our horde stream peaks at ~25 KB/s per guest (code-fit). One host to 3 guests is beyond practical BLE unless packets shrink ~5× (medium confidence).
  - The main Capacitor BLE plugin is central role only [30].
- **Other browser APIs:**
  - **Direct Sockets** (raw TCP/UDP) works only in ChromeOS Isolated Web Apps, not Android [5].
  - **Web NFC** is Android-only [8]. At most it could pass a pairing code between Android phones.
  - **Wi-Fi Direct / Wi-Fi Aware:** no web API exists or is proposed (absence of evidence).
- **Chrome Local Network Access** (142+, Oct 2025):
  - An `https://` page that talks to a 192.168.x.x device gets a one-time permission prompt, not a hard block. After that, `ws://` to a private IP is exempt from mixed-content blocking [6][7].
  - A page served from the LAN host itself shouldn't prompt. That is an inference from the rule [7].

## 2. Local Wi-Fi, hotspots and peer-to-peer WebRTC

**Hotspots with no mobile data**
- **iPhone Personal Hotspot:**
  - Apple describes it as sharing the cellular connection. Community replies say it is greyed out when Cellular Data is off, and some iOS 26 threads tie it to carrier provisioning [12].
  - It can only be switched on by hand in Settings; there is no app API [13].
  - No 2024–2026 test was found of "Cellular Data on, but no signal" (open question).
- **iOS 18+ hotspot behaviour:**
  - Every client gets 192.0.0.2, IPv4 client-to-client traffic and multicast fail, and Apple says to use IPv6 link-local instead [11] (high confidence).
  - Whether clients can still reach a server *on the hotspot iPhone itself* is unknown. Apple DTS is "not aware of any specific change to isolate your app running on the iPhone" [11] (low confidence).
- **Android hotspot:**
  - A SIM-less or data-off hotspot works on many devices and is refused on some carrier-locked ones [15].
  - A ROG Phone 7 user had LAN games working with data off. Samsung advice is to turn data off for LAN games [16].
  - Pixel switches the hotspot off after ~10 min with no clients, and Data Saver blocks tethering [17].
  - Android 11+ hotspots pick a random 192.168.x.x address that can change each time [42]. Guests therefore need the address from a QR code, not a fixed URL.
- **Android LocalOnlyHotspot:** native apps only. It needs `NEARBY_WIFI_DEVICES` when targeting Android 13+ [14].
- **A travel router** (GL.iNet Mango, ~$28–30) runs on a power bank at under 2.75 W [41]. It gives a normal LAN, but can't run our server itself.
- **iOS on a network without internet:** it shows a captive sheet. "Use Without Internet" keeps the phone on the network [18].

**WebRTC without STUN/TURN**
- **mDNS masking:** same-LAN peers can connect using host candidates only. Browsers replace the local IP with a random `.local` name, which the other side resolves by multicast [9].
  - When multicast is blocked, the connection fails silently [9].
  - That is exactly what the iPhone hotspot does [11].
- **Chrome:** real IPs appear only after camera or microphone permission is granted [10].
  - In 2019, Chrome Android had no mDNS stack [10].
  - No 2023–2026 evidence on Chrome Android was found (open question, low confidence).
- **Safari:** host candidates are exposed only after camera or mic permission (2017) [19]. It replaces local IPs with `.local` names by default [20].
- **Workaround:** ask for microphone permission once to reveal real IPs. That is an odd prompt for a shooter, and Safari's current behaviour is unverified (low confidence).
- **Pairing by QR:**
  - A full audio-call offer was 2,847 characters and needed 4 QR codes; the author called the result "rough" [21].
  - The QWBP draft squeezes pairing into ~41–110 bytes, one QR each way (so 2 scans per guest). It is self-published and has no interop evidence [22].
  - `BarcodeDetector` works in Chrome Android but is off by default in iOS Safari, so a JS decoder is needed there [23].
- **Unreliable channels:** `maxRetransmits` and `ordered:false` data channels are supported in Safari [24].
- **Libraries:** none supports offline signalling. PeerJS needs its server, and Trystero uses internet relays [25][26].
- **Measured phone-to-phone latency and battery:** no figures found for data-channel RTT on a hotspot, or for hotspot battery drain.

**WebSocket to a local server (the non-WebRTC route)**
- **Safari:** blocks `ws://` from an `https://` page as mixed content, and has no permission exemption [27].
- **A plain `http://` page** keeps WebSocket. It loses service workers, Wake Lock and Web Crypto (all secure-context only) [31].
  - Our client uses only `crypto.getRandomValues` (code-fit). Believed not to need a secure context; unverified.
- **Recent Safari regressions to watch:**
  - iPadOS 26.2: `ws://` from a plain-http web app closes about 1 s after connecting. It is filed as FB21416603, with a proxy-setting workaround [28].
  - Safari 26.3: `ws://` to a LAN *IP* hangs after the page returns from the background; using a hostname avoids it [29].

## 3. Offline caching and a phone browser as host

**Caching the game for offline play**
- Since Safari 17, an origin may use up to 60 % of disk, so a 5–15 MB game is far below quota. Home Screen web apps get the same quotas [32].
- `navigator.storage.persist()` exists. WebKit grants it by heuristics such as the site being a Home Screen app [32].
- Safari's 7-days-without-use rule deletes service-worker caches for sites used in Safari [33].
  - Home Screen web apps "have their own counter", and WebKit does not expect their first-party data to be deleted [33] (medium confidence).
  - That rule is from 2020, and no newer numbers were found.
- **Practical rule:** offline play from a cached site needs the game *installed to the Home Screen while online*, and opened since. Whether the Home Screen app shares Safari's cache is unverified.
- **Secure context:** this follows the URL scheme, not network state. A cached `https://` page should stay secure while offline [34] (medium; inferred).
- **EU:** Apple reversed its 2024 plan to remove Home Screen web apps [35].

**A phone browser as the authoritative host**
- **Chrome background throttling:**
  - Background pages get no `requestAnimationFrame`, and timers run at most once per second [36].
  - Since Chrome 139, Android freezes background pages *and their workers* after 1 minute [37].
  - A Web Worker doesn't escape this [37].
- **iOS:** reports say Safari suspends WebRTC once the screen locks or Safari is backgrounded [38] (medium; forum-grade).
- **Screen Wake Lock:**
  - Chrome Android 84+. iOS 16.4+ in tabs, and fixed for Home Screen apps only in iOS 18.4 [39].
  - It stops auto-lock only. If the host switches app or presses power, everyone's game freezes.
- **Host leaving:** host-based browser engines such as Construct don't migrate the host; the advice is to end the match [40] (low).
- **Thermal:** profile at least 10 minutes of play, because short tests miss throttling [43] (medium).
  - No battery numbers for long browser-game sessions were found.

## 4. Native wrappers (Capacitor, TWA) and native radios

- **Capacitor 8** is active (`@capacitor/core` 8.6.2, 2026-11-12) [44].
  - It serves the bundled game from a local scheme, so the game is offline by default [45].
- **Mixed iPhone and Android groups are unproven on every native radio:**
  - **Nearby Connections:** has an iOS SDK [46]. But the repo says "not an officially supported Google product" [47], and a maintainer reportedly called Android↔iOS BLE "very limited" (low; seen via a mirror) [48].
  - **Wi-Fi Aware on iOS 26:** needs an iPhone 12+, an entitlement and pairing. Apple frames it around certified accessories. iPhone↔Android interop is "the biggest unknown", with no working report [49][50].
  - **Multipeer:** Apple-only [51].
  - The Capacitor Nearby/Multipeer plugins are small single-maintainer packages that pair the two different protocols [44].
- **The cross-platform native path is plain sockets over a hotspot or LAN.**
  - Pure-Java WebSocket servers exist on Android (Java-WebSocket 1.6.0, 2024-12) [52]. iOS `NWListener` can serve WebSocket, though with gaps such as not being able to read the request path [53].
- **iOS local network privacy:**
  - Native outgoing TCP needs the Local Network prompt; accepting incoming TCP doesn't [51].
  - WKWebView and Safari traffic is exempt from the prompt [51].
- **Running our real Node server on a phone:**
  - Colyseus 0.18 requires Node ≥ 22 [54].
  - nodejs-mobile is stuck on Node 18.20.4 (2024-10, end-of-life) [55]. Its only Capacitor plugin calls itself "no longer recommended for new projects" [56]. **Not workable.**
  - **Termux** (F-Droid build recommended) ships Node 26 and 24 LTS and has a wake lock [57][58]. It can run our server unchanged on an Android phone, but setup is developer-style.
- **TWA:** adds no local networking beyond Chrome. Offline only via a service worker, and not on first launch [59].
- **Distribution:**
  - Android: sideloading an APK is free. Google's developer verification starts globally in 2027, with a free limited-distribution account covering up to 20 devices [60]. Google Play costs $25 once [61].
  - iPhone: TestFlight needs the paid Apple program, and the first external build needs App Review. Builds last 90 days [62].
  - A free Apple account installs to 3 devices for 7 days [63].
  - The Apple program fee ($99/yr) is believed, not verified.

## Cross-dimension insights

- **The network decides the architecture, not the other way round.** An iPhone hotspot blocks client-to-client traffic and multicast [11], which is what browser-to-browser WebRTC with mDNS needs [9]. A *star* (every guest talks only to the host) is the only shape with a chance on any hotspot. That matches our server-authoritative design.
- **"Guests load the game from the host" removes two problems at once.**
  - Nobody needs the game pre-cached, which also avoids the Home Screen and 7-day cache questions.
  - Safari's mixed-content block disappears, because the page and the socket share one plain-http origin [27].
  - It needs a device that can listen on a port, which a browser can't do. So the host must be a native app, Termux, or a laptop or Pi.
- **Our code fits a star host well.**
  - The client talks to the server through a small `NetRoomLike` interface.
  - `RunController` is free of Colyseus and Node.
  - Measured phone tick costs (0.56–0.91 ms with 150 zombies) leave the host phone over 90 % of its 50 ms tick budget (code-fit). That's an estimate until measured with 4 players.
- **Android can be the host; iPhone mostly can't.** Android allows sideloading, a local-only hotspot [14], a hotspot with data off [16], and Termux [57]. An iPhone host is blocked on every one of those.
- **iPhones work fine as guests.** They join the Android host's Wi-Fi and open a page in Safari.

## Recommendations

1. **Run a 1-evening device test before choosing** (feeds the proposal's spike story). Test the group's real phones on (a) an Android hotspot with data off and (b) an iPhone hotspot with data off. In each case, open a plain-http page and a `ws://` socket from a laptop or Termux host, log WebRTC candidates, and measure RTT and battery drain over 30 min. This settles the low-confidence points: iPhone hotspot availability, star reachability, mDNS, and the Safari 26 WebSocket regressions.
2. **Prefer a star over WebSocket, with the host on Android, and guests loading the game from the host.** This rests on high-confidence primary sources for the blockers [1][3][11][27][37] and medium-confidence ones for the Android hotspot [15][16].
3. **Treat pure-browser WebRTC (no install for anyone) as a stretch goal.** Its key enablers (mDNS on hotspots, Chrome Android mDNS, QR pairing UX) are low-confidence or unverified [10][21][22].
4. **Don't pursue Bluetooth, Nearby, Multipeer or Wi-Fi Aware for mixed groups** (high confidence for Bluetooth; medium for the native radios, from the interop evidence).
5. **Keep the hosting logic in one place.** A browser or app host must not drift from `RunRoom` (architecture constraint; see `recon/code-fit.md`).

## Open questions

| Question | How to answer |
| --- | --- |
| Can an iPhone hotspot be switched on with no signal, and can clients reach a server on that iPhone (iOS 18/26)? | Device test, 15 min |
| Does Chrome Android emit and resolve `.local` candidates today, and does WebRTC host-only connect on an Android hotspot? | Device test with a candidate-logging page |
| Does Safari still unmask host IPs after microphone permission? | Device test |
| Do the iOS/iPadOS 26.x `ws://` regressions [28][29] hit a Safari tab on a hotspot? | Device test; watch FB21416603 and WebKit 308073 |
| Hotspot RTT phone-to-phone, and host battery per hour (hotspot + host + render) | Device test, 30 min run with our bots or 4 phones |
| Does an iPhone Home Screen app share Safari's cache? | Device test (only matters for the pure-web option) |
| Apple Developer Program fee today | Apple's site, when it matters |

## Source appendix

| # | Supports | Publisher | Pub date | Accessed | Confidence |
| --- | --- | --- | --- | --- | --- |
| [1] | Web Bluetooth status per browser; client role only; iOS none | [Web Bluetooth CG](https://github.com/WebBluetoothCG/web-bluetooth/blob/main/implementation-status.md) | living doc | 2026-11-23 | medium |
| [2] | WebKit opposed to Web Bluetooth | [W3C public-web-bluetooth list](https://lists.w3.org/Archives/Public/public-web-bluetooth/2024Sep/0002.html) | 2024-09-13 | 2026-11-23 | high |
| [3] | No peripheral/advertising role | [Web Bluetooth CG issue #231](https://github.com/WebBluetoothCG/web-bluetooth/issues/231) | 2016–2022 | 2026-11-23 | high |
| [4] | BLE intervals and throughput on iOS/Android | [Punch Through](https://punchthrough.com/ble-connection-interval-throughput/) | 2026-05-11 | 2026-11-23 | medium |
| [5] | Direct Sockets only in ChromeOS IWAs | [Chromium blink-dev](https://groups.google.com/a/chromium.org/g/blink-dev/c/5cSZjgnJelk/m/ah5cM9gPAwAJ) | 2026-06-10 | 2026-11-23 | high |
| [6] | Chrome Local Network Access prompt | [Chrome for Developers](https://developer.chrome.com/blog/local-network-access) | 2025-06-09 | 2026-11-23 | high |
| [7] | LNA details: ws:// to private IP exempt after grant | [Chrome for Developers](https://developer.chrome.com/docs/modern-web-guidance/guides/security/local-network-access) | undated | 2026-11-23 | medium |
| [8] | Web NFC Android only | [caniuse](https://caniuse.com/webnfc) | 2026-10 | 2026-11-23 | high |
| [9] | mDNS candidates; silent failure without multicast | [BlogGeek.me](https://bloggeek.me/psa-mdns-and-local-ice-candidates-are-coming/) | 2019 | 2026-11-23 | medium |
| [10] | Chrome mDNS masking; Android had no mDNS stack | [discuss-webrtc](https://groups.google.com/g/discuss-webrtc/c/6stQXi72BEU) | 2019-08 | 2026-11-23 | medium (old) |
| [11] | iOS 18 hotspot blocks IPv4 client-to-client and multicast | [Apple Developer Forums 773086](https://developer.apple.com/forums/thread/773086) | 2025-01 | 2026-11-23 | high |
| [12] | iPhone hotspot greyed out with Cellular Data off | [Apple Community](https://discussions.apple.com/thread/256257480) | 2025–26 | 2026-11-23 | medium |
| [13] | Hotspot switched on only in Settings, no API | [Apple Developer Forums 802003](https://developer.apple.com/forums/thread/802003) | 2025-09 | 2026-11-23 | high |
| [14] | Android LocalOnlyHotspot, app-only | [Android Developers](https://developer.android.com/develop/connectivity/wifi/localonlyhotspot) | current | 2026-11-23 | high |
| [15] | SIM-less Android hotspot works on some devices | [Briar project](https://code.briarproject.org/briar/briar/issues/1646) | undated | 2026-11-23 | low |
| [16] | LAN games over Android hotspot with data off | [ASUS ZenTalk](https://zentalk.asus.com/t5/rog-phone-7/rog-phone-7-hotspot-not-working-for-games/m-p/443686) | ~2024 | 2026-11-23 | low |
| [17] | Pixel hotspot auto-off, Data Saver | [Google Pixel Help](https://support.google.com/pixelphone/answer/2812516) | current | 2026-11-23 | high |
| [18] | iOS "Use Without Internet" | [Apple Support](https://support.apple.com/102554) | current | 2026-11-23 | high |
| [19] | Safari exposes host candidates only with media permission | [WebKit blog](https://webkit.org/blog/7763/a-closer-look-into-webrtc) | 2017 | 2026-11-23 | medium (old) |
| [20] | Safari mDNS .local candidates by default | [WebKit bug 236357](https://bugs.webkit.org/show_bug.cgi?id=236357) | 2022 | 2026-11-23 | medium |
| [21] | SDP size 2,847 chars, 4 QR codes | [lilting.ch](https://lilting.ch/en/articles/webrtc-qr-signaling) | 2026-01-11 | 2026-11-23 | medium |
| [22] | QWBP: 41–110-byte QR pairing | [QWBP draft](https://magarcia.github.io/qwbp/spec.html) | 2026-01-19 | 2026-11-23 | medium |
| [23] | BarcodeDetector off in iOS Safari | [caniuse](https://caniuse.com/mdn-api_barcodedetector) | current | 2026-11-23 | high |
| [24] | Safari supports maxRetransmits | [caniuse](https://caniuse.com/mdn-api_rtcdatachannel_maxretransmits) | current | 2026-11-23 | medium |
| [25] | PeerJS needs a PeerServer | [PeerJS](https://peerjs.com/) | current | 2026-11-23 | medium |
| [26] | Trystero uses internet relays | [Trystero](https://github.com/dmotz/trystero) | current | 2026-11-23 | medium |
| [27] | Safari blocks ws:// from https pages | [Apple Developer Forums 120869](https://developer.apple.com/forums/thread/120869) | undated | 2026-11-23 | medium |
| [28] | iPadOS 26.2 ws:// closes after ~1 s | [Apple Developer Forums 811063](https://developer.apple.com/forums/thread/811063) | 2026 | 2026-11-23 | medium |
| [29] | Safari 26.3 ws:// to LAN IP hangs after background | [WebKit bug 308073](https://bugs.webkit.org/show_bug.cgi?id=308073) | 2026 | 2026-11-23 | medium |
| [30] | Capacitor BLE plugin central only | [capacitor-community/bluetooth-le](https://github.com/capacitor-community/bluetooth-le) | 2026-11-18 | 2026-11-23 | high |
| [31] | Features restricted to secure contexts | [MDN](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts/features_restricted_to_secure_contexts) | current | 2026-11-23 | high |
| [32] | Safari 17 storage quotas, persist() | [WebKit blog](https://webkit.org/blog/14403/updates-to-storage-policy/) | 2023-08-10 | 2026-11-23 | high |
| [33] | 7-day cap; Home Screen apps have their own counter | [WebKit blog](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/) | 2020-03-24 | 2026-11-23 | medium (old) |
| [34] | Secure context follows the URL | [MDN](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts) | current | 2026-11-23 | medium |
| [35] | EU Home Screen apps kept | [MacRumors](https://www.macrumors.com/2024/03/01/apple-walks-back-decision-to-disable-eu-web-apps/) | 2024-03-01 | 2026-11-23 | medium |
| [36] | Chrome background timer throttling | [Chrome for Developers](https://developer.chrome.com/blog/background_tabs) | ~2017 | 2026-11-23 | high |
| [37] | Chrome 139 freezes background pages and workers after 1 min | [Chrome 139 release notes](https://developer.chrome.com/release-notes/139) | 2025 | 2026-11-23 | high |
| [38] | iOS suspends WebRTC when locked/backgrounded | [Apple Developer Forums 774239](https://developer.apple.com/forums/thread/774239) | 2025 | 2026-11-23 | medium |
| [39] | Wake Lock: iOS 18.4 fix for Home Screen apps | [Safari 18.4 release notes](https://developer.apple.com/documentation/safari-release-notes/safari-18_4-release-notes) | 2025-03-31 | 2026-11-23 | high |
| [40] | No host migration in Construct 3 | [Bugnet](https://bugnet.io/blog/fix-construct3-multiplayer-host-migration-crash) | undated | 2026-11-23 | low |
| [41] | GL.iNet Mango price and power | [GL.iNet](https://www.gl-inet.com/products/gl-mt300n-v2/) | current | 2026-11-23 | medium |
| [42] | Android 11+ hotspot random IP | [esp32-xbee issue 46](https://www.github.com/nebkat/esp32-xbee/issues/46) | undated | 2026-11-23 | medium |
| [43] | Profile ≥ 10 min for thermal throttling | [Qualcomm](https://www.qualcomm.com/developer/blog/2025/08/optimize-performance-and-graphics-for-adreno-gpu-low-power-gaming) | 2025-08 | 2026-11-23 | medium |
| [44] | Capacitor 8.6.2; plugin versions | [npm registry](https://registry.npmjs.org/@capacitor/core) | 2026-11-12 | 2026-11-23 | high |
| [45] | Capacitor serves bundled files locally | [Capacitor docs](https://capacitorjs.com/docs/config) | undated | 2026-11-23 | high |
| [46] | Nearby Connections iOS SDK | [Google for Developers](https://developers.google.com/nearby/connections/swift/get-started) | undated | 2026-11-23 | high |
| [47] | google/nearby "not officially supported" | [google/nearby](https://github.com/google/nearby) | undated | 2026-11-23 | high |
| [48] | Android↔iOS Nearby BLE "very limited" | [google/nearby discussion 2447](https://github.com/google/nearby/discussions/2447) | undated | 2026-11-23 | low |
| [49] | Wi-Fi Aware on iOS 26: requirements | [Apple](https://developer.apple.com/documentation/wifiaware) | 2026 | 2026-11-23 | high |
| [50] | iPhone↔Android Wi-Fi Aware unproven | [Apple Developer Forums 790195](https://developer.apple.com/forums/thread/790195) | 2025-06 | 2026-11-23 | medium |
| [51] | iOS local network privacy; WKWebView exempt; Multipeer Apple-only | [Apple TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy) | 2026-10-06 | 2026-11-23 | high |
| [52] | Java-WebSocket 1.6.0 | [Maven Central](https://repo1.maven.org/maven2/org/java-websocket/Java-WebSocket/maven-metadata.xml) | 2024-12-15 | 2026-11-23 | high |
| [53] | NWListener WebSocket server | [Apple Developer Forums 693799](https://developer.apple.com/forums/thread/693799) | undated | 2026-11-23 | medium |
| [54] | Colyseus 0.18 needs Node ≥ 22 | [npm registry](https://registry.npmjs.org/@colyseus/core/latest) | live | 2026-11-23 | high |
| [55] | nodejs-mobile latest 18.20.4 | [nodejs-mobile releases](https://github.com/nodejs-mobile/nodejs-mobile/releases) | 2024-10-07 | 2026-11-23 | high |
| [56] | Capacitor-NodeJS not recommended | [hampoelz/Capacitor-NodeJS](https://github.com/hampoelz/Capacitor-NodeJS/releases) | undated | 2026-11-23 | high |
| [57] | Termux ships Node 26 / 24 LTS | [termux-packages](https://raw.githubusercontent.com/termux/termux-packages/master/packages/nodejs/build.sh) | live | 2026-11-23 | high |
| [58] | Termux: F-Droid recommended | [Termux README](https://raw.githubusercontent.com/termux/termux-app/master/README.md) | live | 2026-11-23 | high |
| [59] | TWA adds no APIs; offline via service worker | [Chrome for Developers](https://developer.chrome.com/docs/android/trusted-web-activity) | undated | 2026-11-23 | high |
| [60] | Android developer verification 2026–27 | [Android Developers Blog](https://android-developers.googleblog.com/2026/03/android-developer-verification.html) | 2026-03-19 | 2026-11-23 | medium |
| [61] | Google Play $25 fee | [Play Console Help](https://support.google.com/googleplay/android-developer/answer/6112435) | undated | 2026-11-23 | high |
| [62] | TestFlight limits | [Apple](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview) | undated | 2026-11-23 | high |
| [63] | Free Apple account limits | [Apple](https://developer.apple.com/support/compare-memberships/) | undated | 2026-11-23 | high |

## Staleness map

The fastest-ageing claims (technical pack windows: versions 1 month, ecosystem 6 months, landscape 12 months):

- **Re-check by 2026-12-23** (version and compatibility): Safari 26.x WebSocket regressions [28][29], Chrome Local Network Access on Android [6][7], Capacitor and plugin versions [44], Termux Node [57].
- **Re-check by 2027-05**: nodejs-mobile status [55], Android developer verification rollout [60], Wi-Fi Aware interop [50].
- **Re-check by 2027-11**: Web Bluetooth peripheral role [3], WebKit position [2], iOS hotspot behaviour [11].

The earliest is **2026-12-23**. If this idea is built after that date, re-check those claims with a Refresh run.
