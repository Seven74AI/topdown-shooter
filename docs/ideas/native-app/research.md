---
title: 'technical research: turning topdown-shooter into iOS and Android apps'
type: 'technical'
topic: 'Shipping the Phaser 4 web game as real iOS and Android apps'
decision: 'How to ship the web game as real iOS and Android apps, and what it costs'
source: 'native run (bmad-deep-recon), 3 researcher digests in recon/digests/, 1 round'
status: complete
preset: 'standard'
validation: 'normal'
claims_verified: 6
claims_unverified: 3
claims_disputed: 1
created: '2026-11-23'
updated: '2026-11-23'
---

# Technical research: turning topdown-shooter into iOS and Android apps

**Decision this research serves:** how to ship the web game as real iOS and Android apps, and what that costs.

The workspace holds digests in `recon/digests/`, the process log in `recon/.memlog.md`, and code-fit notes in `recon/code-fit.md`. The code-fit notes are project context; they shaped the questions and are not cited as evidence.

## Executive summary

**Wrap the existing game with Capacitor 8.** Keep the web version as it is: both use the same build, server and share links. No rewrite is needed. Phaser publishes an official Capacitor tutorial for Phaser 4 [1], and Capacitor is the healthiest wrapper today [2][3].

What drives this:

1. **The game ships inside the app and runs in the same engine as the browser.**
   - On iOS, WKWebView gets the JIT that Safari has [11].
   - Android System WebView uses Chrome's engine and is updated through Play [13].
   - Expect similar frame rates to today's browser numbers. No current benchmark exists, so a device check on the iPhone and the Mi 11i is required.
2. **The real work is fitting our online rules to an installed app, not the wrapper.**
   - The server refuses any client whose balance hash differs (code-fit), and store updates take 1–2 days of review [24] plus however long players wait to update.
   - Without live updates, or a change to how balance reaches the client, **every balance deploy locks app players out**.
   - Live-update services (Capgo, about $12–14 a month) fix JS-only changes [9][31]. Apple's guideline 2.5.2 forbids downloaded code that "introduces or changes features", so live updates are safest when limited to fixes and tuning [21].
3. **Apple's "not just a website" rule (4.2) is the main review risk** [21][23].
   - The app should earn its keep: offline solo practice built in, landscape lock, haptics, the native share sheet, and no browser chrome.

**Costs:**
- Apple: US$99 a year [22], needed for TestFlight and the App Store.
- Google Play: US$25 once (believed; not verified this run).
- Live updates: about $12–14 a month (optional) [9].
- Cloud iOS builds: free within 500 macOS minutes a month on Codemagic [17], or build on the designer's Mac.

**Biggest caveat:** none of the sources measured a Phaser game inside WKWebView or Android WebView, so speed and thermals must be checked on the phones. Apple's line between allowed and forbidden live updates is also not crisp [21][34].

## 1. Which wrapper

- **Capacitor 8** (Ionic) is the pick.
  - Released 2025-12-08 [2], with 8.5 out on 2026-07-31 [3]. It requires Node 22+, Xcode 26+ and iOS 15+ [2].
  - Ionic stopped selling its commercial products in 2025 but keeps maintaining open-source Capacitor [4].
  - Phaser's official tutorial covers `cap init`, `webDir: dist`, adding iOS and Android, `cap copy` after each build, safe-area padding and `Capacitor.isNativePlatform()` [1].
  - Capacitor's games guide calls it "a great platform" for WebGL games [5]. Phaser also publishes a Capacitor starter template [6].
- **Cordova** is maintained but slow. cordova-ios 8.0 took "nearly 2 years" [7]. It offers no advantage over Capacitor.
- **Tauri 2 mobile** went stable in 2024. Its own team said mobile was not yet "first class", and no source says the gaps have closed [8]. No Phaser games were found shipping on it.
- **TWA/Bubblewrap** (Android) runs the game in the user's Chrome. **PWABuilder's iOS package** is "experimental" [10]. Neither gives one path for both stores.
- **A native rewrite** (Godot/Unity) was not researched. emberfall shows the designer can build Godot apps, but this game's netcode, prediction and sim are TypeScript, so a rewrite would throw away Epics 1–5.

## 2. Speed inside the app

- **iOS:** WKWebView runs JavaScript with JIT; only plain in-process JavaScriptCore lacks it [11]. Feature support should match Safari (forum answer) [11].
  - One developer saw low frame rates and heat in the first minutes of WebGL games in WKWebView (low confidence; ~2022) [12].
- **Android:** System WebView "shares the same rendering engine as Chrome for Android" and updates separately through Play [13].
  - WebViews older than version 140 break safe-area values [14].
- **Phaser** has a mobile render pipeline since 3.60. In Phaser's own tests, iOS dropped below 60 fps first as texture count grew [15]. Phaser 4 inheriting this is unverified.
- **No 2025–2026 benchmark** of WebGL games in WKWebView or Android WebView was found. Our browser numbers are the best proxy: iPhone 15 Pro 60 fps, Honor 10 58 fps (`docs/perf/epic-1-stress.md`).

## 3. Making it feel like an app

All of these come from official Capacitor plugins unless marked otherwise [16]:

- **Landscape lock:** Screen Orientation plugin. It replaces our "rotate your phone" overlay.
- **Status and gesture bars:** System Bars (new in 8.0, part of core) has `hide()`/`show()` for the status bar and the Android navigation bar or iOS gesture bar. Safe-area CSS variables are injected [14].
  - Hiding the iPhone home indicator wasn't covered by the docs (open question).
  - Full Android immersive mode may need a community plugin [16].
- **Keep the screen awake:** community plugins only (`@capacitor-community/keep-awake`, Capawesome, Capgo) [16].
- **Haptics, Splash Screen, App (back button, pause/resume), Share, Preferences:** official [16].
- **iOS silent switch:** Web Audio is muted by the ringer switch by default. `navigator.audioSession.type = "playback"` fixes it in Safari, per a WebKit engineer [18]. Whether that works in WKWebView is unverified, and old threads say WKWebView ignores the app's own audio session [19].

## 4. Online play inside the app

- **Origins:** the app loads from `capacitor://localhost` on iOS and `https://localhost` on Android. Both are configurable within limits; iOS can't use http or https [20].
  - The WebSocket always goes through the WebView and sends that origin. The CapacitorHttp plugin only covers fetch and XHR [25].
  - **Our server's origin allowlist must add both** (code-fit: `origin.ts` accepts only http(s) today, so `capacitor://` needs a code change, not just config).
  - Don't rely on cookies over the WebSocket; we already pass a guest token in join options [26].
- **Invite links:** iOS Universal Links (an `apple-app-site-association` file) and Android App Links (`assetlinks.json` with `autoVerify`) can open `https://hordes.sevend.io/j/ABCD` in the app [27]. The app's `appUrlOpen` handler routes it [28]. If the app isn't installed, the link opens the website.
  - In-app browsers (Instagram, Facebook, TikTok, Gmail) often don't hand the link over [29]. So `/j/<code>` must keep working as a web join page, ideally with an "Open in app" button.
- **Background and resume:**
  - iOS drops WebView WebSockets as soon as the app is backgrounded [30].
  - On iOS 26.3, a new socket after resume can get stuck "connecting". Closing the socket on background avoided a similar bug in 2021 [32].
  - Android WebView background behaviour is unreliable (vendor sources) [33].
  - **Plan:** close on `pause`, rejoin on `resume`. The app gives no networking advantage over a browser tab (unverified belief).
- **Sharing:** `@capacitor/share` opens the native sheet and falls back to Web Share on the web [35]. That's a small change to `ui/share.ts`, whose links must use the public origin, not `localhost`.
- **Push notifications** (invite pings): need Apple Push and Firebase setup, two kinds of device token and a backend sender [36]. That's moderate effort. For a friend group, a link sent in their chat covers most of it (judgment).

## 5. Updates and version skew

- **Ionic Appflow** stopped taking new customers in February 2025 and shuts down on 2027-12-31 [4]. Don't adopt it.
- **Capgo:**
  - Price: Solo $12/mo (yearly) or $14 monthly; Maker $33–39 [9].
  - Channels can refuse a JS bundle that doesn't match the installed native build, and the app can switch channel itself [31].
- **Capawesome Cloud** is the other live-update service; its pricing wasn't checked [9].
- **Forced store updates:** the Capawesome app-update plugin can force an update on Android through Play In-App Updates. On iOS it can only see the store version and open the App Store [37][38].
- **Loading the game from our website inside the app** (`server.url`) would dodge version skew, but Capacitor says it is "not intended for use in production". The app would also not work when the server is down, and it raises the 4.2 "repackaged website" risk [39].
- **Apple 2.5.2:** forbids downloaded code that "introduces or changes features or functionality" [21]. Live updates for bug fixes and balance are commonly treated as fine, but the exact license clause wasn't retrieved [34] (medium confidence).
- **Design option** (inference, not research): our balance and map versions are *data*. If the server sent its balance JSON to the client at join, app builds would only go stale on real code changes, not on tuning, and no downloaded code would be involved.

## 6. Stores, testing and costs

**Apple**
- **Programme:** $99 a year [22].
- **Review:** 50 % of submissions reviewed in under 24 h, 90 % under 48 h [24].
- **Privacy manifest:** required since May 2024 for apps using "required reason" APIs [40].
- **Export compliance:** HTTPS-only encryption is "typically exempt", so set `ITSAppUsesNonExemptEncryption=NO` (WSS assumed the same) [41].
- **Age ratings:** the tiers are now 4+/9+/13+/16+/18+, with a new questionnaire that asks about violent themes [42]. Our rating is not yet known (probably 13+; unverified).
- **Account deletion:** required only if the app creates accounts, so guest play is exempt [43].
- **EU trader status:** must be declared. A trader's address, phone and email are shown publicly on EU store pages; a non-trader shows none. TestFlight-only distribution isn't acting as a trader [44]. Which applies to a free hobby game is the designer's call.
- **TestFlight:** 100 internal testers (who must be App Store Connect users) and 10,000 external testers by link. The first external build is reviewed, and builds last 90 days [45].
- **Free Apple account:** installs from Xcode onto at most 3 devices, and the app expires after 7 days (from the offline-play research).

**Google**
- **Internal testing:** up to 100 testers, builds live in minutes, "might not be subject to standard" reviews, and no Data safety form needed [46].
- **Going public on a personal account** (created after 2023-11-13) needs 12 testers opted in for 14 days in a closed test [47].
- **Target API:** new apps and updates must target API 36 since 2026-08-31 [48].
- **WebView apps:** the spam policy only bans wrapping *someone else's* site [49].
- **Sideloaded APKs:** Google's developer verification starts globally in 2027. A free limited-distribution account is meant for family and friends; its device cap is 20 or 50, depending on which Google page you read [50].
- **Content rating:** zombies with mild gore are probably PEGI 12 ("slightly more graphic" violence towards fantasy characters) [51] (medium; inference).

**Builds**
- Build on the designer's Mac, which has Xcode and adb (code-fit), or in the cloud.
- Codemagic gives 500 free macOS minutes a month, then $0.095 a minute [17].
- GitHub Actions macOS runners cost $0.062 a minute on private repos [52].

## Cross-dimension insights

- **Version skew is where tech, store rules and our code collide.**
  - Our strict balance hash (code), 1–2-day reviews plus slow user updates (stores) [24], and Apple's 2.5.2 limit on downloaded code [21] together mean live updates are needed but must stay within "fixes and tuning".
  - Sending balance as data from the server would shrink that problem the most. It's an architecture choice for the main session.
- **Apple's 4.2 rule and our offline solo mode work together.** Solo practice already runs fully in the browser (`LocalSimHost`). Bundled in the app, it works with no network, which is the strongest "more than a website" argument [23] (inference).
- **The web version stays the safety net.** Invite links fall back to the website when the app isn't installed or an in-app browser swallows the link [27][29]. So the app can ship to friends first with nothing breaking for anyone else.
- **Friends-only first is cheap and fast.**
  - Android: Play internal testing (minutes, no review) [46], or a sideloaded APK.
  - iPhone: TestFlight (one review, 90-day builds) [45].
  - A public launch adds the 12-tester, 14-day closed test on Google [47] and a full App Review.

## Recommendations

1. **Capacitor 8, one codebase, web kept as is** (high confidence) [1][2][5]. *Feeds architecture:* a `platform` module (native vs web) for server URL, share origin, deep links, orientation and haptics.
2. **Before the first store build:**
   - Make the server tell app players they need an update, instead of refusing them, and decide between live updates (Capgo) and server-sent balance (medium confidence) [9][21][31].
   - Add the app origins to the allowlist [20].
   - Rejoin on resume [30][32].
3. **Make the app more than a website:** offline solo practice, landscape lock, haptics, native share, keep-awake, hidden system bars (medium confidence; Apple's review is judgment-based) [21][23].
4. **Ship to the friend group first:** Play internal testing plus TestFlight. Go public only if the group wants it (high confidence for process facts) [45][46][47].
5. **Device check on the iPhone and the Mi 11i before anything else:** frame rate over 10 minutes, the silent switch, background and resume, the home indicator (fills the unmeasured gaps).

## Open questions

| Question | How to answer |
| --- | --- |
| Frame rate and heat of our game inside WKWebView and Android WebView | Device check, 10–15 min run on the iPhone and the Mi 11i |
| Does `navigator.audioSession` work in WKWebView (silent switch)? | Device check |
| Hide the iPhone home indicator from Capacitor? | Try System Bars, else a tiny native tweak in the Xcode project |
| Exactly which live updates Apple allows (license 3.3.x) | Read the Apple Developer Program License Agreement |
| Our Apple age rating | Fill in Apple's questionnaire |
| Google Play fee ($25) and the limited-distribution device cap (20 or 50) | Check the Play Console when signing up |
| EU trader or non-trader for a free hobby game | Designer's decision |

## Source appendix

| # | Supports | Publisher | Pub date | Accessed | Confidence |
| --- | --- | --- | --- | --- | --- |
| [1] | Official Phaser 4 + Capacitor tutorial | [Phaser Studio](https://phaser.io/tutorials/bring-your-phaser-game-to-ios-and-android-with-capacitor) | © 2026 | 2026-11-23 | high |
| [2] | Capacitor 8 release and requirements | [Ionic](https://ionic.io/blog/announcing-capacitor-8) | 2025-12-08 | 2026-11-23 | high |
| [3] | Capacitor 8.5 release | [Ionic](https://ionic.io/blog/capacitor-8-5-released) | 2026-07-31 | 2026-11-23 | medium |
| [4] | Ionic stops commercial sales; Appflow sunset | [Ionic](https://ionic.io/blog/?p=6282) | 2025-02-11 | 2026-11-23 | high |
| [5] | Capacitor games guide | [Capacitor](https://capacitorjs.com/docs/guides/games) | current | 2026-11-23 | high |
| [6] | Phaser Editor Capacitor template | [ecosyste.ms listing](https://awesome.ecosyste.ms/projects/github.com%2Fphaserjs%2Feditor-starter-template-capacitorjs) | n/a | 2026-11-23 | medium |
| [7] | Cordova iOS 8 after ~2 years | [Apache Cordova](https://cordova.apache.org/announcements/2025/11/23/cordova-ios-8.0.0.html) | 2025-11-23 | 2026-11-23 | high |
| [8] | Tauri mobile not first class | [Tauri](https://v2.tauri.app/blog/tauri-2-0-0-release-candidate/) | 2024 | 2026-11-23 | medium |
| [9] | Capgo pricing | [Capgo](https://capgo.app/pricing/) | 2026 | 2026-11-23 | medium |
| [10] | PWABuilder iOS experimental | [PWABuilder](https://www.github.com/pwa-builder/pwabuilder-ios) | n/a | 2026-11-23 | medium |
| [11] | WKWebView has JIT | [Apple Developer Forums 728165](https://developer.apple.com/forums/thread/728165) | ~2023 | 2026-11-23 | medium |
| [12] | WebGL slow first minutes in WKWebView | [Apple Developer Forums 721315](https://developer.apple.com/forums/thread/721315) | ~2022 | 2026-11-23 | low |
| [13] | Android WebView = Chrome engine, Play-updated | [Chrome for Developers](https://developer.chrome.com/docs/webview) | 2024-12-18 | 2026-11-23 | high |
| [14] | System Bars; WebView < 140 safe-area bug | [Capacitor](https://capacitorjs.com/docs/apis/system-bars) | v8 docs | 2026-11-23 | high |
| [15] | Phaser mobile pipeline; iOS texture limits | [Phaser changelog](https://unpkg.com/phaser@4.2.1/changelog/v3/3.60/MobilePerformance.md) | 2023 | 2026-11-23 | medium |
| [16] | Official plugin list; keep-awake community | [Capacitor](https://capacitorjs.com/docs/apis) | v8 docs | 2026-11-23 | high |
| [17] | Codemagic free minutes and prices | [Codemagic](https://docs.codemagic.io/billing/pricing/) | current | 2026-11-23 | high |
| [18] | `navigator.audioSession` silent-switch fix | [WebKit bug 237322](https://bugs.webkit.org/show_bug.cgi?id=237322) | 2022–24 | 2026-11-23 | medium |
| [19] | WKWebView ignores app audio session | [Apple Developer Forums 24464](https://developer.apple.com/forums/thread/24464) | ~2015 | 2026-11-23 | low |
| [20] | App origins and scheme limits | [Capacitor config](https://capacitorjs.com/docs/config) | v8 docs | 2026-11-23 | high |
| [21] | Guidelines 2.5.2, 4.2, 4.7 | [Apple](https://developer.apple.com/app-store/review/guidelines/) | current | 2026-11-23 | high |
| [22] | Apple Developer Program $99/yr | [Apple](https://developer.apple.com/programs/) | current | 2026-11-23 | medium (search summary) |
| [23] | Capacitor apps rejected under 4.2 | [Apple Developer Forums 812889](https://developer.apple.com/forums/thread/812889) | 2024–26 | 2026-11-23 | medium |
| [24] | Review times | [Apple](https://developer.apple.com/distribute/app-review/) | current | 2026-11-23 | high |
| [25] | CapacitorHttp covers fetch/XHR only | [Capacitor](https://capacitorjs.com/docs/apis/http) | current | 2026-11-23 | high |
| [26] | Cookies not sent on WebSocket upgrade | [Traccar forum](https://www.traccar.org/forums/topic/websocket-issue/) | undated | 2026-11-23 | low |
| [27] | Universal Links and App Links in Capacitor | [Capacitor](https://capacitorjs.com/docs/guides/deep-links) | current | 2026-11-23 | high |
| [28] | `appUrlOpen`, pause/resume events | [Capacitor](https://capacitorjs.com/docs/apis/app) | current | 2026-11-23 | high |
| [29] | In-app browsers break deep links | [Branch](https://www.branch.io/resources/blog/why-deep-links-break-in-production-and-what-to-do-about-it/) | undated | 2026-11-23 | medium |
| [30] | iOS drops WebView WebSockets in background | [Apple Developer Forums 681892](https://developer.apple.com/forums/thread/681892) | ~2021 | 2026-11-23 | medium |
| [31] | Capgo channels and native-version guard | [Capgo](https://capgo.app/docs/live-updates/channels/) | current | 2026-11-23 | high |
| [32] | iOS 26.3 WebSocket stuck after resume | [WebKit bug 308073](https://bugs.webkit.org/show_bug.cgi?id=308073) | 2026-02 | 2026-11-23 | medium |
| [33] | Android WebView background unreliable | [Capgo blog](https://capgo.app/blog/how-background-tasks-work-in-capacitor/) | undated | 2026-11-23 | low |
| [34] | Live updates "commonly" OK for fixes; clause not retrieved | [Apple](https://developer.apple.com/app-store/review/guidelines/) | current | 2026-11-23 | medium |
| [35] | Share plugin | [Capacitor](https://capacitorjs.com/docs/apis/share) | current | 2026-11-23 | high |
| [36] | Push notifications setup | [Capacitor](https://capacitorjs.com/docs/apis/push-notifications) | v8 docs | 2026-11-23 | high |
| [37] | App-update plugin (Android forced, iOS store link) | [Capawesome](https://capawesome.io/plugins/app-update/) | current | 2026-11-23 | high |
| [38] | Play In-App Updates | [Android Developers](https://developer.android.com/guide/playcore/in-app-updates) | current | 2026-11-23 | high |
| [39] | `server.url` not for production | [Capacitor](https://capacitorjs.com/docs/v5/config) | n/a | 2026-11-23 | high |
| [40] | Privacy manifest required since May 2024 | [Apple](https://developer.apple.com/news/?id=pvszzano) | 2024 | 2026-11-23 | high |
| [41] | Export compliance exemption | [Apple](https://developer.apple.com/documentation/security/complying-with-encryption-export-regulations) | current | 2026-11-23 | high |
| [42] | New age-rating tiers and questionnaire | [Apple](https://developer.apple.com/news/) | 2025 | 2026-11-23 | medium |
| [43] | Account deletion only with account creation | [Apple Review Guidelines 5.1.1(v)](https://developer.apple.com/app-store/review/guidelines/) | current | 2026-11-23 | high |
| [44] | EU trader status | [Apple](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements) | current | 2026-11-23 | high |
| [45] | TestFlight limits | [Apple](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview) | current | 2026-11-23 | high |
| [46] | Play internal testing | [Play Console Help](https://support.google.com/googleplay/android-developer/answer/9845334) | current | 2026-11-23 | high |
| [47] | 12 testers for 14 days | [Play Console Help](https://support.google.com/googleplay/android-developer/answer/14151465) | current | 2026-11-23 | high |
| [48] | Target API 36 | [Android Developers](https://developer.android.com/google/play/requirements/target-sdk) | 2026 | 2026-11-23 | high |
| [49] | Webview spam policy | [Play Policy Center](https://support.google.com/googleplay/android-developer/answer/9899034) | current | 2026-11-23 | high |
| [50] | Developer verification and limited distribution | [Android Developers Blog](https://android-developers.googleblog.com/2026/03/android-developer-verification.html) | 2026-03-19 | 2026-11-23 | medium |
| [51] | PEGI 12 definition | [PEGI](https://pegi.info/what-do-the-labels-mean) | current | 2026-11-23 | medium |
| [52] | GitHub Actions macOS price | [GitHub Docs](https://docs.github.com/en/billing/reference/actions-runner-pricing) | 2026-11 | 2026-11-23 | medium |

## Staleness map

- **Re-check by 2026-12-23** (versions, 1 month): Capacitor and plugin versions [2][3], Capgo pricing [9], the iOS 26 WebSocket bug [32], Google's target API [48].
- **Re-check by 2027-05** (ecosystem, 6 months): Appflow shutdown [4], Android developer verification [50], Tauri mobile [8].
- **Re-check by 2027-11** (landscape, 12 months): Apple guidelines 2.5.2 and 4.2 [21], age ratings [42].

The earliest is **2026-12-23**. If building starts after that, re-check the version claims first.
