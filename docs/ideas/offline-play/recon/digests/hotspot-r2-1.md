# Digest: hotspot-r2-1 (round 2 follow-up, offline phone LAN play)

Decision served: can 2–4 friends play a 20 Hz host-authoritative phone browser game with NO internet, and which route to build.
Accessed 2026-11-23. 18 tool calls. Web sources only.

## Findings

### Q1: iPhone Personal Hotspot with no cellular / data off / airplane mode
- When Cellular Data is off, Personal Hotspot is greyed out, according to Apple Community replies. Several iOS 26 threads also report it greyed out for carrier-provisioning or APN reasons, so hotspot availability depends on the carrier profile and SIM. | https://discussions.apple.com/thread/256257480 ; https://discussions.apple.com/thread/256144998 | Apple Support Communities (user replies) | 2025 (iOS 26 era) | accessed 2026-11-23 | medium | forum consensus
- Airplane Mode disables Personal Hotspot and it can't be selected (troubleshooting guides; secondary sources). | https://www.techtarget.com/enterprise-software/tip/How-to-fix-an-iPhone-Personal-Hotspot-thats-not-working | TechTarget | undated (search snippet) | accessed 2026-11-23 | medium | secondary
- Personal Hotspot can only be turned on by hand in Settings. No app API or workaround exists, and iOS has no app-created "local hotspot" equivalent to Android's. | https://developer.apple.com/forums/thread/802003 | Apple Developer Forums (DTS Engineer) | Sep 2025 | accessed 2026-11-23 | high | primary (DTS)
- I found no 2024–2026 report of a successful test turning the hotspot on with zero signal while Cellular Data stayed on. Whether it can start with Cellular Data on but no signal is unverified. | — | — | — | — | — | not found

### Q2: Can clients reach the hotspot iPhone itself on iOS 18+/26?
- DTS (Quinn) says Personal Hotspot's focus "is STA-to-Internet communication". He says he is "not aware of any specific change to isolate your app running on the iPhone from the various STAs". This is not a confirmation that a server on the hotspot phone can be reached. | https://developer.apple.com/forums/thread/773086 | Apple Developer Forums (DTS) | Jan 2025 | accessed 2026-11-23 | medium | primary (DTS, hedged)
- On iOS 18+ hotspots, clients cannot use IPv4 to talk to each other; Apple's Feedback reply says "you have to use IPv6. IPv6 link-local is perfect for this". The OP confirmed that clients could communicate over the configured IPv6 addresses. This is from Feedback Assistant, not DTS. | https://developer.apple.com/forums/thread/773086 | Apple Developer Forums (OP quoting Apple Feedback) | Feb 2025 | accessed 2026-11-23 | medium-high | primary (relayed)
- Older (iOS 14 era) reports show the iPhone at 172.20.10.1 opening SSH to a client at 172.20.10.2. That shows traffic from the hotspot phone to a client, not client to phone. | https://forum.openwrt.org/t/ios14-tethering-issues/74949/11 | OpenWrt forum | 2020 | accessed 2026-11-23 | low | forum
- Even if the hotspot phone can be reached, a browser page on iPhone cannot run a listening server: no web API accepts inbound sockets. This is my unverified belief; I did not search for it this run. | — | — | — | — | — | unverified belief
- I found no 2024–2026 report of a client reaching a server running on the hotspot iPhone at 172.20.10.1 (or another hotspot address) on iOS 18+. | — | — | — | — | — | not found

### Q3: Android hotspot with mobile data off / no signal
- Android has an official app API, LocalOnlyHotspot. With it, "applications on devices connected to the Wi-Fi hotspot can communicate with each other". The network "will not have Internet access". Apps targeting Android 13+ need the NEARBY_WIFI_DEVICES permission. This needs a native app, not a browser. | https://developer.android.com/develop/connectivity/wifi/localonlyhotspot | Android Developers | current docs | accessed 2026-11-23 | high | primary
- Secondary sources say a hotspot with no signal or data connection "can still broadcast a wireless network" without internet. Older (2014-era) Android Central posts say the stock hotspot needed an active connection. No vendor documentation confirms either way. | https://www.techtarget.com/enterprise-software/answer/Can-a-hotspot-work-without-cellular-service ; https://forums.androidcentral.com/threads/how-do-i-create-hotspot-without-cell-service.880205/latest | TechTarget; Android Central | undated / ~2014 | accessed 2026-11-23 | low-medium | secondary / old forum
- On Pixel the hotspot turns itself off after about 10 minutes with no connected devices; this can be disabled under Hotspot & tethering. Data Saver must be off to tether. | https://support.google.com/pixelphone/answer/2812516 | Google Pixel Help | current | accessed 2026-11-23 | high | primary
- On ROG Phone 7 (Android 14), a user reports LAN game traffic over the phone hotspot worked with mobile data off. Samsung community advice is to turn mobile data off for LAN games. | https://zentalk.asus.com/t5/rog-phone-7/rog-phone-7-hotspot-not-working-for-games/m-p/443686 ; https://r2.community.samsung.com/t5/Galaxy-A/Samsung-not-discoverable-on-wifi-lan/td-p/19901621 | ASUS ZenTalk; Samsung Community | ~2023–2024 | accessed 2026-11-23 | low | forum anecdote
- Isolation between clients on Android hotspots: there are anecdotal reports both ways. Some clients could not see each other (Unity forums), and in Briar's case clients could reach each other but not the hotspot phone. The AOSP Soft AP docs describe no client-isolation toggle. | https://discussions.unity.com/t/unitys-master-server-on-local-wifi-with-androids-mobile-hotspot/561289 ; https://code.briarproject.org/briar/briar/issues/1171 ; https://source.android.com/docs/core/connect/wifi-softap | Unity forums; Briar GitLab; AOSP | old (2014–2018) / current | accessed 2026-11-23 | low | forum + primary (absence)
- I found no authoritative Android 13–16 or Samsung/Pixel statement on whether the stock hotspot turns on with SIM present and data off, or on default client isolation. | — | — | — | — | — | not found

### Q4: Safari iOS WebRTC host candidates
- WebKit (2017): "Without access to capture devices, WebKit only exposes Server Reflexive and TURN ICE candidates"; "When access is granted, WebKit will expose host ICE candidates". It also says "RTCPeerConnection and RTCDataChannel are available in any web view". | https://webkit.org/blog/7763/a-closer-look-into-webrtc | WebKit blog | 2017-07-03 | accessed 2026-11-23 | high (for 2017) | primary
- WebKit later replaced private IPs in host candidates with "{UUID}.local" mDNS names, "enabled by default in WebKit ToT … should enable Safari <-> Safari connections in networks supporting MDNS". | https://bugs.webkit.org/show_bug.cgi?id=189503 | WebKit Bugzilla | 2018 | accessed 2026-11-23 | medium | primary (search snippet)
- In iOS 15, mDNS ICE candidates are on by default and users cannot turn them off. | https://developer.apple.com/forums/thread/698156 | Apple Developer Forums | 2021–22 | accessed 2026-11-23 | medium | forum (snippet)
- WebKit bug (2022): with no media constraints, Safari emits only mDNS .local host candidates. | https://bugs.webkit.org/show_bug.cgi?id=236357 | WebKit Bugzilla | 2022 | accessed 2026-11-23 | medium | primary (snippet)
- Not found: whether granting getUserMedia still exposes raw IP host candidates on current Safari (only the 2017 statement). Not found: whether Safari iOS emits IPv6 host candidates. Not found: any report of WebRTC data channels working phone to phone over a hotspot with no internet. The iOS 18 hotspot also blocks multicast (thread 773086), which would plausibly break mDNS .local resolution between clients. That is an inference, not tested. | — | — | — | — | — | not found / inference

### Q5: Chrome Android mDNS
- 2019 discuss-webrtc PSA: the mDNS stack "is currently not built into Chrome on Android". Chrome sent plain IPs alongside mDNS candidates. | https://groups.google.com/g/discuss-webrtc/c/6stQXi72BEU | discuss-webrtc (Google) | 2019 | accessed 2026-11-23 | medium (old) | primary
- Firefox bug 2011711 (closed in 2026, shipped in Firefox 149): "Android seems to be capable of supporting our current implementation of mDNS for WebRTC". It is about Firefox only and says nothing about Chrome. | https://bugzilla.mozilla.org/show_bug.cgi?id=2011711 | Mozilla Bugzilla | ~Jan 2026 | accessed 2026-11-23 | medium | primary
- I found no 2023–2026 crbug or discuss-webrtc evidence on Chrome Android's current mDNS generation or resolution. | — | — | — | — | — | not found

### Q6: Mixed content and secure context
- Chrome LNA: "ws:// connections initiated from an https:// page are exempted from Mixed Content blocking" when the host is a private or loopback IP literal, localhost, or a .local name. This is "gated behind the local-network or loopback-network permission prompt". fetch() needs `targetAddressSpace: 'local'`. Use wss:// for non-.local hostnames. The page says nothing specific about Android. | https://developer.chrome.com/docs/modern-web-guidance/guides/security/local-network-access | Chrome for Developers | current (2025–26) | accessed 2026-11-23 | high | primary
- Chrome LNA prompt launched in Chrome 142. Blink-dev / third-party sources say WebSocket LNA was a developer trial on desktop in 142, with shipping planned for desktop 147. The exact Android WebSocket timeline is unconfirmed. | https://developer.chrome.com/blog/local-network-access ; https://groups.google.com/a/chromium.org/g/blink-dev/c/4gx2y5jPGbU | Chrome blog; blink-dev | 2025-06-09 onward | accessed 2026-11-23 | medium | primary
- Safari: ws:// from an https:// page is blocked as mixed content, and a self-signed certificate on the local server did not help (Apple dev forum). WebKit does not treat localhost as exempt (bug 173161, and the Safari 18 regression bug 279249). I found no LNA-style permission exemption in Safari. | https://developer.apple.com/forums/thread/120869 ; https://bugs.webkit.org/show_bug.cgi?id=173161 ; https://bugs.webkit.org/show_bug.cgi?id=279249 | Apple Dev Forums; WebKit Bugzilla | 2019–2024 | accessed 2026-11-23 | medium-high | primary
- A plain http:// local PWA opening a ws:// WebSocket works through iPadOS 18. On iPadOS 26.2 the iPad closes the socket about one second after connecting. Workaround: set Wi-Fi HTTP Proxy to "Auto". DTS assigned it to WebKit (FB21416603), and it is open as of Jan 2026. | https://developer.apple.com/forums/thread/811063 | Apple Developer Forums (DTS) | Dec 2025–Jan 2026 | accessed 2026-11-23 | high | primary
- WebKit bug 308073 (Safari 26.3): a ws:// connection to a LAN IP hangs after the page resumes from background. Mapping the IP to a hostname works around it. | https://bugs.webkit.org/show_bug.cgi?id=308073 | WebKit Bugzilla | 2026 | accessed 2026-11-23 | medium | primary (snippet)
- MDN lists Screen Wake Lock, Service Workers, Web Crypto API and Gamepad as restricted to secure contexts; WebSocket is not listed. The list does not say whether getRandomValues itself is gated, so it is unverified this run; my belief is that only crypto.subtle and randomUUID are gated. MDN's list page also does not say whether private-IP http origins count as secure; my belief is that they do not, and only localhost does. | https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts/features_restricted_to_secure_contexts | MDN | current | accessed 2026-11-23 | high (listed items) / unverified (rest) | primary

### Q7: Captive portal and no-internet behaviour
- On iOS, the captive Welcome sheet has a "Cancel > Use Other Network / Use Without Internet" path. Apple says this "keeps your device associated with the network and allows you to use the network in other ways" and turns off Auto-Login. | https://support.apple.com/102554 | Apple Support | current | accessed 2026-11-23 | high | primary
- Some iPhones drop Wi-Fi associations that fail their internet probe (older models, and Auto-Login on known networks). The portal can take about 50 seconds to appear (iOS 16.5 report). | https://developer.apple.com/forums/thread/71629 ; https://discussions.apple.com/thread/6713676 ; https://discussions-cn-prz.apple.com/thread/254901135 | Apple forums | 2014–2023 | accessed 2026-11-23 | low-medium | forum
- Android "no internet, stay connected?" behaviour: not checked this run (budget). | — | — | — | — | — | not found

## Leads
- Run a hands-on test. It is the only way to settle Q1/Q2. Setup: an iPhone on iOS 18 or 26 with Cellular Data on and no signal (or a SIM in a Faraday pouch), toggle Personal Hotspot, then try reaching a client over IPv6 link-local or the hotspot phone itself.
- Android LocalOnlyHotspot plus a native or TWA wrapper is the documented no-internet LAN path on Android.
- Chrome LNA guide: `ws://<private IP>` from an https PWA is allowed after a prompt. Verify on Chrome Android 142+.
- Safari: serve the game page over plain http:// from a LAN host instead of https PWA, and watch the iPadOS 26 WebSocket teardown bug (FB21416603) and WebKit 308073.
- pion/offline-browser-communication: a browser can connect over WebRTC with no signaling server, using mDNS and preset ICE credentials. https://github.com/pion/offline-browser-communication
- Hostname vs IP: WebKit 308073 suggests a hostname works around the issue. A .local name may be needed on Chrome too.

## Looked for but could not find
- A 2024–2026 test of turning on iPhone Personal Hotspot with no signal while Cellular Data stays on.
- Any report of a client reaching a server on the hotspot iPhone on iOS 18+.
- Android 13–16 or Samsung/Pixel documentation on the stock hotspot with data off, or on default client isolation.
- Whether current Safari exposes raw host IPs after getUserMedia, and whether Safari iOS emits IPv6 candidates.
- Any phone-to-phone WebRTC data channel success over an offline hotspot.
- Chrome Android mDNS status for 2023–2026.
- A Safari equivalent of Local Network Access, or an exemption for ws:// to private IPs from https pages.
- Whether getRandomValues is gated by secure context (MDN API page not fetched).
- Android's no-internet "stay connected" prompt.
