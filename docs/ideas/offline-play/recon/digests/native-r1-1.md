# Digest: native wrappers giving the web game local radios (native-r1-1)

Track: Capacitor and TWA wrappers; iPhone-to-Android local links; permissions; store friction. Accessed 2026-11-23.

## Findings

### Capacitor and plugin health
- Capacitor is at major version 8. `@capacitor/core` latest is 8.6.2, published 2026-11-12. The project is actively released. | https://registry.npmjs.org/@capacitor/core | npm registry | 2026-11-12 | accessed 2026-11-23 | confidence high | compat
- `@capacitor-community/bluetooth-le` 8.4.0 was published 2026-11-18, so it is maintained. It is central role only. Its README says: "the plugin only supports the central role of the Bluetooth Low Energy protocol". For peripheral role it points to the Cordova plugins `cordova-plugin-bluetoothle` and `cordova-plugin-ble-peripheral`. This plugin alone cannot make a phone act as a GATT host. | https://github.com/capacitor-community/bluetooth-le | capacitor-community (GitHub) | 2026-11-18 (release) | accessed 2026-11-23 | confidence high | compat
- Capacitor plugins wrapping Nearby Connections and Multipeer are small, single-maintainer packages with uneven health:
  - `@squareetlabs/capacitor-nearby-multipeer` 1.1.30 (2025-07-08)
  - `@blackgersain/capacitor-nearby-multipeer` 1.0.0, one version only (2025-10-30)
  - `@picsa/capacitor-offline-transfer` 8.2.0 (2026-03-26). It targets file transfer and uses Nearby P2P_CLUSTER on Android and Multipeer on iOS.
  - `@capacitor-trancee/nearby-connections` 0.2.6 (2025-03-09)
  - `@capacitor-trancee/nearby` 4.1.0 (2025-04-01)
  - `capacitor-nearby-plugin` 1.0.0 (2025-05-03)

  None is an official Capacitor or Google plugin. | https://registry.npmjs.org/ (per-package metadata) | npm registry | various | accessed 2026-11-23 | confidence high | compat
- The "nearby-multipeer" plugins pair Nearby Connections on Android with Multipeer on iOS. These are different protocols, so these plugins are unlikely to connect an iPhone to an Android phone. This is an inference from the protocol split, not tested. | https://www.pkgstats.com/pkg:@squareetlabs/capacitor-nearby-multipeer | pkgstats/npm listing | 2025-07 | accessed 2026-11-23 | confidence medium | compat
- Local sockets and servers:
  - `capacitor-tcp-socket` 8.0.0 (2026-11-01) is maintained.
  - `capacitor-websocket-server` 0.0.1 has a single release (2026-03-03).
  - The UDP plugins `capacitor-udp` (2020) and `@frontall/capacitor-udp` (2021) are abandoned.
  - `capacitor-zeroconf` (mDNS) 4.0.0 is from 2025-05-09.
  - `@capgo/capacitor-wifi` 8.5.12 (2026-11-12) handles Wi-Fi management. It is not peer-to-peer.

  | https://registry.npmjs.org/ (per-package metadata) | npm registry | various | accessed 2026-11-23 | confidence high | compat
- No Capacitor plugin for Wi-Fi Aware (NAN) was found. A React Native library, `react-native-wifi-aware`, exists. | https://developer.apple.com/forums/thread/845528 | Apple Developer Forums | 2026-09 | accessed 2026-11-23 | confidence medium | compat
- Capacitor serves the bundled `webDir` from a local scheme, so the game works offline by default:
  - `server.hostname` defaults to `localhost`.
  - `server.iosScheme` defaults to `capacitor`.
  - `server.androidScheme` defaults to `https`.
  - `server.url` (load a remote URL) "is not intended for use in production."

  | https://capacitorjs.com/docs/config | Ionic/Capacitor docs | undated | accessed 2026-11-23 | confidence high | spec
- `npx cap sync` copies the built web bundle into the Android and iOS projects. | https://capacitorjs.com/docs/basics/workflow | Capacitor docs | undated | accessed 2026-11-23 | confidence high | spec

### iPhone-to-Android local links
- Google Nearby Connections has an official Swift/iOS guide, installed via Swift Package Manager from `google/nearby`. The iOS guide lists BLE, Wi-Fi LAN and Wi-Fi Hotspot (as a high-speed upgrade) as mediums. It needs Bluetooth and local network access. | https://developers.google.com/nearby/connections/swift/get-started | Google for Developers | undated | accessed 2026-11-23 | confidence high | spec
- Google's Nearby overview says Nearby Connections is available for Android and iOS and enables communication between the two platforms. | https://developers.google.com/nearby | Google for Developers | undated | accessed 2026-11-23 | confidence medium | compat
- Cross-platform Nearby is shaky in practice. In GitHub discussion #2447, a maintainer reportedly said BLE between Android and iOS is "very limited", which is why it is "still flagged off". Other users report iOS-to-Android failures where iOS-to-iOS works. I saw this only through a search summary on a mirror host; the primary thread was not opened. | https://github.com/google/nearby/discussions/2447 | google/nearby (GitHub) | undated | accessed 2026-11-23 | confidence low | compat
- The `google/nearby` README says "This is not an officially supported Google product." The repo shows no GitHub releases. | https://github.com/google/nearby | Google (GitHub) | undated | accessed 2026-11-23 | confidence high | policy
- Apple's Wi-Fi Aware framework is available from iOS/iPadOS 26.0:
  - Supported devices: iPhone 12 and later, plus some iPads.
  - Pairing is required, via AccessorySetupKit or DeviceDiscoveryUI.
  - It needs the `com.apple.developer.wifi-aware` entitlement and a `WiFiAwareServices` Info.plist key.
  - Apple's docs promise "high-bandwidth and low-latency" links and multiple simultaneous peers.
  - Apple's framing is connecting to "Wi-Fi Aware certified accessories", not to Android phones.

  | https://developer.apple.com/documentation/wifiaware | Apple | 2026 | accessed 2026-11-23 | confidence high | spec
- Wi-Fi Aware between iOS 26 and Android phones is unproven:
  - In the first forum thread (June 2025), an iPhone could not discover a service published by an Android phone.
  - Apple DTS only pointed to the Wi-Fi Aware chapter of the Accessory Design Guidelines, saying it is "rare to find hardware and software combinations that follow all of those guidelines."
  - A September 2026 post seeking testers calls iOS-to-Android interop "the biggest unknown". It has 0 replies.

  | https://developer.apple.com/forums/thread/790195 ; https://developer.apple.com/forums/thread/845528 | Apple Developer Forums | 2025-06 / 2026-09 | accessed 2026-11-23 | confidence medium | compat
- Apple added Wi-Fi Aware because of EU interoperability requirements (Wi-Fi Aware 4.0 in iOS 26). This comes from a heise headline and a search summary; the article was not opened. | https://heise.de/-10446649 | heise | 2025-06 | accessed 2026-11-23 | confidence medium | policy
- Multipeer Connectivity uses Bonjour internally and is Apple-only. It has no Android counterpart. | https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy | Apple | rev. 2026-10-06 | accessed 2026-11-23 | confidence medium | compat
- Plain sockets over a phone hotspot or LAN are the protocol-neutral path, since any OS can run TCP or WebSocket. Apple's local network privacy rules spell out which socket operations need permission (see the permissions section). | https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy | Apple | rev. 2026-10-06 | accessed 2026-11-23 | confidence high | spec

### Throughput and latency
- The Nearby Connections strategies page gives only relative bandwidth, no numbers:
  - Cluster (M-to-N) has "lower bandwidth" and is recommended for multiplayer gaming.
  - Star (1-to-N) has higher bandwidth.
  - Point-to-Point has the "highest possible throughput".
  - Range is about 100 m.
  - It makes no latency statement.

  | https://developers.google.com/nearby/connections/strategies | Google for Developers | undated | accessed 2026-11-23 | confidence high | performance
- Apple's Wi-Fi Aware API exposes `WAPerformanceMode`, `WAAccessCategory` (QoS), `WAPerformanceReport` and `WAPerformanceForecast`, but the docs publish no numbers. | https://developer.apple.com/documentation/wifiaware | Apple | 2026 | accessed 2026-11-23 | confidence high | performance

### TWA
- TWA content is "rendered by the user's browser" (Chrome). The host app "doesn't have direct access to web content" and talks to it through URLs and intents. The docs list no extra native APIs, so a TWA adds no local networking beyond what Chrome has. | https://developer.chrome.com/docs/android/trusted-web-activity | Chrome for Developers | undated | accessed 2026-11-23 | confidence high | spec
- A TWA can run offline only through a service worker. On the very first launch, "the service worker won't yet be available", so Google recommends a native offline fallback launcher. | https://developer.chrome.com/docs/android/trusted-web-activity/offline-first | Chrome for Developers | undated | accessed 2026-11-23 | confidence high | spec

### Permissions
- iOS local network privacy (iOS 14+):
  - Needs `NSLocalNetworkUsageDescription`, plus `NSBonjourServices` for Bonjour and Multipeer (format `_service._tcp`).
  - Multicast or broadcast needs the `com.apple.developer.networking.multicast` entitlement.
  - Outgoing TCP and sending UDP unicast need permission. Accepting incoming TCP and receiving incoming UDP unicast do not.
  - The first operation may be denied before the user answers the prompt, so the app needs retry or wait-for-connectivity logic.
  - Background attempts are denied silently.
  - App Clips cannot use the local network at all.

  | https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy | Apple | rev. 2026-10-06 | accessed 2026-11-23 | confidence high | policy
- Traffic from WKWebView, SFSafariViewController and Safari does not require local network access (no prompt). So a Capacitor WKWebView doing a plain WebSocket to a LAN or hotspot IP skips the prompt, while native socket plugins trigger it. | https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy | Apple | rev. 2026-10-06 | accessed 2026-11-23 | confidence high | policy
- Android permissions for Nearby Connections:
  - API 31+: BLUETOOTH_SCAN, BLUETOOTH_ADVERTISE, BLUETOOTH_CONNECT.
  - API 33+: NEARBY_WIFI_DEVICES (neverForLocation).
  - API 29–32: ACCESS_FINE_LOCATION.
  - New: ACCESS_LOCAL_NETWORK, a runtime permission on Android 17 (apps targeting SDK 37+ that use WIFI_LAN).
  - If any is missing, advertising and discovery won't start.

  | https://developers.google.com/nearby/connections/android/get-started | Google for Developers | undated | accessed 2026-11-23 | confidence high | policy

### Cost and distribution friction
- Google Play has a one-time US$25 registration fee. Personal accounts created after 2023-11-13 must meet testing requirements before publishing; the exact tester count was not retrieved. | https://support.google.com/googleplay/android-developer/answer/6112435 | Google Play Help | undated | accessed 2026-11-23 | confidence high | cost
- Android developer verification:
  - Enforcement starts 2026-09-30 in Brazil, Indonesia, Singapore and Thailand, and goes global for certified devices in 2027.
  - A free "limited distribution" account can share an app with up to 20 devices without ID or a fee.
  - An "advanced flow" lets users allow unverified installs.
  - ADB installs are unchanged.

  | https://android-developers.googleblog.com/2026/03/android-developer-verification.html ; https://support.google.com/android-developer-console/answer/16561738 | Google | 2026-03-19 | accessed 2026-11-23 | confidence medium (search summary of the primary sources) | policy
- TestFlight:
  - Up to 100 internal and 10,000 external testers.
  - Builds last up to 90 days.
  - The first build sent to external testers needs App Review.
  - Public invite links are available.

  | https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview | Apple | undated | accessed 2026-11-23 | confidence high | cost
- A free Apple "Personal Team" allows on-device installs from Xcode, limited to 3 devices and 3 apps per device, with profiles expiring after 7 days. Distribution and TestFlight need the paid Program. | https://developer.apple.com/support/compare-memberships/ | Apple | undated | accessed 2026-11-23 | confidence high | cost

## Leads worth chasing
- Read google/nearby discussion #2447 and the iOS issues directly, to confirm whether iOS-to-Android over Wi-Fi LAN or Hotspot works when BLE is flagged off. Also check whether any Capacitor plugin uses the Nearby Swift SDK on iOS (none found).
- Hotspot plus WebSocket inside a Capacitor WebView. TN3179 exempts WKWebView traffic from the prompt, so an iPhone client could join an Android host's hotspot and open a WebSocket to the host's IP. That only needs a WebSocket server plugin on the host phone, and `capacitor-websocket-server` is immature. The open question is whether iOS can host a server that an Android phone reaches over the iPhone's Personal Hotspot.
- Whether WKWebView from the `capacitor://localhost` origin can open `ws://` (insecure) to a LAN IP without mixed-content blocking. On Android the default `https` scheme likely blocks `ws://` as mixed content.
- The Accessory Design Guidelines Wi-Fi Aware chapter, and any successful Pixel/Samsung-to-iPhone Wi-Fi Aware report from 2026.
- Measured throughput and latency for Multipeer, Nearby (Cluster vs Star) and BLE GATT notify on phones.
- Play's testing requirement for new personal accounts (the tester count and duration).

## Looked for but could not find
- The Apple Developer Program annual fee on Apple pages (fetched pages omitted it). Believed to be US$99/yr; not verified.
- Any official or maintained Capacitor plugin for Wi-Fi Aware, BLE peripheral role, or a cross-platform (single protocol on both OSes) Nearby link.
- Any confirmed working iOS 26 to Android Wi-Fi Aware data path.
- Numeric throughput or latency figures in Google or Apple docs for Nearby, Multipeer, Wi-Fi Aware or BLE.
- App Review guidance specific to local peer-to-peer games (not searched due to budget).
