---
baseline_commit: 144c671
---

# Story 10.1: Settings screen

Status: done

(Written 2026-11-26 with `gds-create-story`, headless, from epics.md Story 10.1 (incl. the E7-A8 deletion AC), the readiness report of 2026-11-26 (state today, Q3), `sprint-change-proposal-2026-11-26-epic-9-photoreal.md` §4.2 and the Epic 7 / Epic 8 retros. **Built first in Epic 10**: 9.5 (gore), 9.6 (effects quality), 9.8 (3 volumes) and 10.2 (quality defaults) plug into the store this story makes. Every story decision below is **auto-accepted (designer 2026-11-26: follow recommendations)**.)

## Story

As a player,
I want to adjust quality, sound and controls, and to delete my progress,
so that the game runs and feels right on my phone, and my data goes when I ask.

## State today (read from the code, master `144c671`)

- `apps/client/src/settings/settings.ts`: `PlayerSettings` with 3 booleans (`screenShake`, `haptics`, `alwaysFullSpeed`), localStorage key `topdown-shooter.settings`, try/catch on read and write, a module cache. `saveSettings` writes the **whole** merged object (defaults included).
- Readers: `GameScene.ts` (screen shake, 4 places), `audio/haptics.ts`, `input/TouchSticks.ts` (always full speed, every frame).
- The ☰ in-run menu (`ui/InRunMenu.tsx`, `menuItems.ts`, `uiState.ts › menuStep`) has a `settings` view with one switch (Always full speed).
- No start-screen Settings. No quality, volume, gore, aim-assist or "Show performance" setting. The only quality switch is the URL flag `?fx=low` (`debug/urlOptions.ts`).
- Effects that exist and can be turned down: rain + splashes + ash flakes (`render/city/CityView.ts › update`, `RAIN_POOL` 128, level `nightAt(stage).rain`), CO2 fog-bank drifting noise (`render/fog/FogView.ts`, `lowFx` → plain haze), light glow (baked `drawGlow` layer added with `lighter` in `render/city/bakeTiles.ts`, plus additive lamp flicker and bus / barrier blinker images in `CityView`). **No film grain exists** (readiness 9.6 row). **No gore / dismemberment exists** (9.5). **No audio buses exist** (9.8): SFX on `placeholderSfx.ts › master` (gain 0.25; the boss "music" loop runs on it too), ambience on its own bus (`ambience.ts`, `AMBIENCE_GAIN` 0.16) straight to `destination`.
- Aim assist: shared `combat/aimAssist.ts`, applied in `combat/firing.ts:219` only when `!input.isMouse`. The input's `isMouse` bit is read nowhere else on the server (grep: `firing.ts`, the wire codec, input copies). The client's `NetSimHost.localAttack` mirrors the same rule.
- "Show performance" = the Story 1.11 `PerfOverlay` (`perf.overlayOn`, `?debug=1`, three-finger tap).
- Server: `progress` has **no `settings` column** (`apps/server/src/db/schema.ts`). Migrations `0000`–`0005` exist. `meta/merge.ts › MERGE_RULES` needs a rule per `progress` column (`db/mergeRules.test.ts` fails otherwise; `deviceTokensRepo.ts` fails to typecheck). `ACCOUNT_TABLE_MERGES` lists every other account-keyed table.
- FKs: `device_tokens`, `progress`, `run_rewards`, `saved_run_players` all `on delete cascade` from `accounts`; `accounts.merged_into` → `accounts.id` has **no** cascade (a retired guest merged into an account blocks deleting that account unless it is deleted first).
- Room membership: `auth/devicesInRooms.ts` (`deviceInRoom(tokenHash)`, `beginSwitch` / `endSwitch` marks, which `RunRoom.onAuth` / `onJoin` refuse).
- Account routes: `auth/accountRoutes.ts` (Origin check → 403, `no-store`, per-IP limit before the body, `{ message: AccountErrorCode }`), errors in `packages/shared/src/net/account.ts › ACCOUNT_ERRORS`.

## Acceptance Criteria

1. **Settings screen, two doors.** The start screen has a **Settings** button (bottom row, beside Practice solo and Progress) that opens a Settings screen; the ☰ in-run menu's Settings view shows the same panel. In it I can: toggle **aim assist** (on by default), **screen shake**, **haptics** (where the phone can vibrate), **Always full speed**, **Show performance** (off by default); set **Rain** Full / Light / Off, **Fog detail** Full / Plain, **Light glow** Full / Low / Off; set **Effects volume** and **Ambience volume** (0–100). (FR87)
2. **No setting for blackout darkness or the 10 m fog vision limit.** Fog detail changes only the drifting fog texture; `ScreenFog` / `fogVisibility` and the darkness are untouched (F5). A test proves the fog radii and visibility are the same at Full and Plain.
3. **Stored fields for features that don't exist yet** (decision B2): `gore` ("full" | "bloodOnly", 9.5), `filmGrain` (Full / Low / Off, 9.6) and `musicVolume` (9.8) are in the shared settings schema with defaults, stored and synced like every field, and **not shown** until their story adds the row.
4. **Applies at once.** Every shown setting changes the game without a reload: next frame for rain / fog / glow / performance overlay / aim assist / screen shake, at once for volumes. Tests (or a browser check) prove each change is read live, not cached at scene create.
5. **Stored locally, safely.** Saved in localStorage under `topdown-shooter.settings` inside try/catch; storage that throws or holds junk gives the defaults; only fields the player changed are stored (B1), so 10.2 can change defaults per device class. The old 3-field value still reads.
6. **Synced to my account when logged in.** A change on a logged-in phone is sent to `POST /account/settings` (debounced); the server validates it with the shared schema and stores it in the new `progress.settings` jsonb column (migration `0006_*`, generated on top of master, never renamed). The session / login answer carries `progress.settings`; a phone with no unsent change adopts it. The merge rule keeps the account's settings unless it has none (then the guest's). E7-A5 shape owner: **this story owns `progress.settings`** and the settings schema.
7. **Delete my progress** (E7-A8). On the start screen's Settings, as a guest or logged in, "Delete my progress" opens a second screen that names what goes: Supplies, unlocks, training, look, saved runs, and the account if I have one (with a password field for an account). Confirming calls `POST /account/delete`.
8. **One transaction.** The server deletes, in one bounded transaction: my `progress` row, my saved runs (a run no other account can resume) or my seat in them (a shared run), my `run_rewards` and `device_tokens` rows, any retired guests merged into me (with their rows), and my `accounts` row with username and password hash. It logs `account_deleted` with **no personal data** (no account id, username, IP, token or hash; only kind and counts).
9. **Guards.** The endpoint needs the current session cookie (401 otherwise) and, for an account, the right password (401 `wrong_password`, counted per username like a wrong login); it is rate-limited per IP (429) and refused with 409 `in_room` while any device of the account is in a room (marked like an account switch while the transaction runs); 403 for a foreign Origin.
10. **Afterwards.** The server clears the `__Host-tdg` cookie; the client clears the guest token, stored settings, the name and the look copy and reloads; the next open is a fresh guest with 0 Supplies. Tests prove: a deleted account's username can be registered again; the old token's join ticket is refused and the old cookie gets 401 on account actions; a session call with the old token never returns the deleted account.
11. **Layout.** Lumen LF5, text ≥ 14 px, buttons ≥ 44 px, inside the safe area with no overlaps at 568×320, 640×360, 800×360 and 844×390 with the 44/21 insets (a `settingsDomLayout` check in the same pattern as `saveMenuDomLayout`); the existing hud layout and DomLayout checks still pass.

## Decision log (auto-accepted, designer 2026-11-26: follow recommendations)

| # | Decision | Status |
| --- | --- | --- |
| 10.1-B1 | **One settings schema in shared code** (`packages/shared/src/config/playerSettings.ts`, zod, every field optional, `PLAYER_SETTINGS_DEFAULTS`). The client stores and syncs **only the fields the player changed**; defaults fill the rest at read. A `setSettingsDefaults(patch)` hook lets 10.2 lower defaults per device class without overwriting choices. Reason: 9.5 / 9.6 / 9.8 / 10.2 each add or change one field, never the shape. | auto-accepted (designer 2026-11-26: follow recommendations) |
| 10.1-B2 | **Not-built features: stored, hidden** (not shown disabled). `gore`, `filmGrain`, `musicVolume` exist in the schema with defaults; 9.5 / 9.6 / 9.8 add their row to `SETTINGS_ROWS` (`ui/settingsRows.ts`) and wire the effect. Reason: a greyed control that does nothing reads as broken; hidden costs nothing and the stored value is ready. | auto-accepted (designer 2026-11-26: follow recommendations) |
| 10.1-B3 | **Rain: Full / Light / Off = × 1 / 0.5 / 0** on the drop count, the splashes and the CO3 ash flakes (one weather pool). Default Full. | auto-accepted (designer 2026-11-26: follow recommendations) |
| 10.1-B4 | **Fog detail: Full / Plain.** Plain = the `?fx=low` haze (no drifting noise layers). The fog ring, radius and what it hides never change (AC 2). Default Full; `?fx=low` still forces Plain. | auto-accepted (designer 2026-11-26: follow recommendations) |
| 10.1-B5 | **Light glow: Full / Low / Off = × 1 / 0.5 / 0** on the baked glow layer (the overlay re-bakes once on change; the cached tile base is kept) and the additive lamp-flicker and blinker images. The fire-zone ring glow, the darkness beams and every hazard telegraph stay (readability). Default Full. | auto-accepted (designer 2026-11-26: follow recommendations) |
| 10.1-B6 | **Aim assist off rides the input's existing "no assist" bit** (`isMouse`, FR4): with the setting off, touch input is sent with that bit set. The server and the client mirror already skip assist on it: no protocol change, no `NET_PROTOCOL_VERSION` bump. Mouse aim is never assisted (unchanged). A test proves the bit is the only thing that changes in the built input. | auto-accepted (designer 2026-11-26: follow recommendations) |
| 10.1-B7 | **Show performance = the Story 1.11 overlay** (`perf.overlayOn`). The setting turns it on at start; `?debug=1` and the three-finger tap still toggle it for the session. | auto-accepted (designer 2026-11-26: follow recommendations) |
| 10.1-B8 | **Volumes: Effects and Ambience shown and applied now** (SFX master × v/100, ambience bus × v/100), 0–100 in steps of 5, default 100. **Music stored, hidden** until 9.8 adds a music bus (today the boss loop is on the SFX master). | auto-accepted (designer 2026-11-26: follow recommendations) |
| 10.1-B9 | **Sync only for logged-in accounts** (username set), as the AC says. A change made while logged in marks the settings "pending" **for that username** (localStorage; review M1: a guest's change is never marked) and is sent after 1 s without further changes; success clears the mark. One send at a time; a change during a send is sent once after it (review L2). **Across phones the last send wins** (each send replaces the account's copy). On a session / login answer: a mark for another username (guest → A, A → B) is dropped; my own mark → send mine; else server settings present → adopt them; else (account has none) send mine if this phone changed anything (the upgrade path; this also covers an A → B switch where B has no settings yet: the phone's settings go to B, accepted in re-review round 1). Logging out sends a still-pending change to the account first, then drops the mark (re-review M1 nit). Same pattern as the 7.10 look. | auto-accepted (designer 2026-11-26: follow recommendations) |
| 10.1-B10 | **`POST /account/settings` `{ settings }`**: ≤ 1 KB body (413), Origin check, per-IP and per-account limits (20 / min each), 401 without an account, the stored value is the schema-parsed one (unknown keys dropped), answers `{ ok, settings }`. | auto-accepted (designer 2026-11-26: follow recommendations) |
| 10.1-B11 | **`POST /account/delete` `{ password? }`**: per-IP limit 5 / min before the body; guest = the cookie is enough; account = password (Argon2 verify; a wrong one counts on `loginNameLimiter`); 409 `in_room` when any of the account's device hashes is in a room (re-checked after marking every hash as switching, like 7.6 L2). | auto-accepted (designer 2026-11-26: follow recommendations) |
| 10.1-B12 | **Saved runs:** a run whose only linked accounts are mine is deleted; a run another account can still resume keeps playing for them, only my `saved_run_players` link goes, and **my seat in its snapshot is scrubbed** (review L5: `accountId` null, seat key `deleted:<slot>` that no join can produce, name "Survivor", in the snapshot and the list names; a ban of my seat loses its token hash), so a stale token can't reclaim it and nothing personal stays. Retired guests merged into me are deleted first (`merged_into` has no cascade) — they are my data. | auto-accepted (designer 2026-11-26: follow recommendations) |
| 10.1-B13 | **The log line** `account_deleted { kind: "guest" \| "account", guests, savedRunsDeleted, seatsRemoved }`: no account id (pseudonymous, links to older lines), no IP, no username. | auto-accepted (designer 2026-11-26: follow recommendations) |
| 10.1-B14 | **"Old token refused"** = its device row is gone, so its join ticket fails the 7.6 L1 row check, every account action with the old cookie answers 401, and the session call never maps it back to the deleted account (it is an unknown device: a fresh empty guest). No tombstone table (it would keep data about the deleted player). | auto-accepted (designer 2026-11-26: follow recommendations) |
| 10.1-B15 | **After a delete the client resets the phone and reloads**: guest token, settings (+ pending mark), name, look copy cleared; the server already cleared the cookie (`Max-Age=0`). The reload starts the normal session call → a new guest, 0 Supplies. | auto-accepted (designer 2026-11-26: follow recommendations) |
| 10.1-B16 | **Where it lives:** start screen bottom row "Practice solo · Progress · Settings" → a full Settings screen (`UiScreen` kind `settings`, Back → start). The ☰ Settings view shows the same `SettingsPanel` without the Progress group (the server refuses a delete in a run; the panel says "Delete my progress is on the start screen"). Groups: Controls, Screen, Sound, (start screen only) Progress. | auto-accepted (designer 2026-11-26: follow recommendations) |
| 10.1-B17 | **Controls:** booleans = the existing LF5 switch; 2–3 choices = a segmented row of 44 px buttons (`aria-pressed`); volumes = a native range input styled to 44 px. Text 14–16 px. | auto-accepted (designer 2026-11-26: follow recommendations) |
| 10.1-B18 | **Haptics row only where `navigator.vibrate` exists** (iPhones can't vibrate from a web page; a dead switch there misleads). | auto-accepted (designer 2026-11-26: follow recommendations) |
| 10.1-B19 | *(build time)* **Scroll padding = the safe-area insets** on the two scrolling Settings views, so a control scrolled into view (focus, keyboard) stops above the home bar like the padding does. The in-run view's Back has no autofocus (it would open the long list scrolled to the bottom; ☰ / Esc still close). | auto-accepted (designer 2026-11-26: follow recommendations) |
| 10.1-B21 | *(review)* **A bank for a deleted account is a quiet no-op** (review M3): `banked: false`, no FK error, no `supplies_bank_failed` / hand-grant line. | auto-accepted (designer 2026-11-26: follow recommendations) |
| 10.1-B22 | *(review)* **`paid_bags`** (review L6): one row per run whose bag a deleted account was paid, written in the delete transaction; `oneBagPerRun` reads it next to the other accounts' rows. No account id, no personal data. | auto-accepted (designer 2026-11-26: follow recommendations) |
| 10.1-B23 | *(review)* **"This account was deleted or logged out on another phone"** (review L9): the phone remembers its last username; a guest answer for a phone that did not log out or delete itself shows that line on the start screen (OK closes it), and an account call answered `no_account` on a logged-in phone shows it instead of "try later". It also covers a password reset on another phone (same server answer). | auto-accepted (designer 2026-11-26: follow recommendations) |
| 10.1-B20 | *(build time)* **The session reply now always carries `progress.settings`** (null when none synced). Three older tests that compared the whole progress object were updated to include `settings: null`. | auto-accepted (designer 2026-11-26: follow recommendations) |

## Tasks / Subtasks

- [x] T1 Shared settings schema (AC 3, 5, 6; B1, B2)
  - [x] `packages/shared/src/config/playerSettings.ts`: `playerSettingsSchema` (all optional: `screenShake`, `haptics`, `alwaysFullSpeed`, `aimAssist`, `showPerformance`, `rain` "full"|"light"|"off", `fog` "full"|"plain", `glow` "full"|"low"|"off", `filmGrain` "full"|"low"|"off", `gore` "full"|"bloodOnly", `sfxVolume`/`ambienceVolume`/`musicVolume` int 0–100), defaults, `parseStoredSettings(raw)` (junk-tolerant: keeps valid fields only), `SETTINGS_MAX_BODY_BYTES` 1024, factor tables (`RAIN_K`, `GLOW_K`).
  - [x] `progressViewSchema.settings` optional nullable; request/response schemas for `/account/settings` and `/account/delete`; new error codes `wrong_password`.
- [x] T2 Client store (AC 4, 5; B1, B9)
  - [x] Extend `settings/settings.ts`: stored = explicit fields only, `getSettings()` = defaults ⊕ stored, `saveSettings(patch)`, `subscribeSettings`, `setSettingsDefaults`, `replaceStoredSettings` (adopt server), `clearSettings`, pending mark; keep the key and old fields.
  - [x] `net/settingsSync.ts`: debounce, POST, adopt-on-session; hooked from `accountSession` and `adopt` (login / recover / logout).
- [x] T3 Wire the effects (AC 1, 2, 4; B3–B8)
  - [x] Aim assist → `InputRouter.build` touch branch sets `isMouse = !aimAssist`.
  - [x] Show performance → `perf.overlayOn` follows the setting (subscribe).
  - [x] Rain / glow → `CityView.update` + `bakeTiles(glowK)`; glow level in the static key.
  - [x] Fog detail → `FogView` reads Plain live (with `?fx=low` forcing it).
  - [x] Volumes → SFX master + ambience bus follow the setting.
- [x] T4 UI (AC 1, 7, 11; B16–B18)
  - [x] `ui/settingsRows.ts` (rows data), `ui/SettingsPanel.tsx`, `ui/SettingsScreen.tsx` (start-screen screen + delete confirm), `InRunMenu` uses the panel, start-screen button, `UiScreen` kind `settings`, CSS in LF5 tokens.
- [x] T5 Server (AC 6, 8, 9, 10; B10–B14)
  - [x] `schema.ts` `settings` jsonb nullable; `npm run db:generate` → `0006_*`; merge rule `settings`; `progressRepo.saveSettings`; session/login views carry settings.
  - [x] `accountsRepo.deleteAccount` (one `boundedTransaction`); `auth/accountDelete.ts`; routes `/account/settings`, `/account/delete`; limiters.
- [x] T6 Tests (every AC; E8-A1 / E8-A3)
  - [x] Shared schema; client store (junk, throwing storage, explicit-only, defaults hook, subscribe); sync (pending / adopt / logged-out no call); input bit; rain/glow factors; fog radii unchanged at Plain; volumes; merge rule; settings route (413, 401, 429, stored shape); delete: guest + account, wrong password, in_room, every table emptied, shared saved run keeps the run, username reusable, old ticket refused, old cookie 401, session with old token ≠ deleted account, log has no id; migration on PGlite (real-PG test where the suite has one).
  - [x] `tools/checks/settingsDomLayout.test.ts` (start-screen Settings, delete confirm, in-run Settings) at the four sizes with insets.
- [x] T7 Screenshots of the Settings view at 844×390 and 568×320 (`docs/art/settings/`), gate:fast, PR, CI green.

## Dev Notes

### What must be preserved
- `alwaysFullSpeed` read every frame by `TouchSticks`, `haptics` by `audio/haptics.ts`, `screenShake` in `GameScene` — same names, same defaults.
- The ☰ menu state machine (`menuStep`): `settings` ↔ `open` via back / cancel; Esc / ☰ closes.
- `?fx=low` keeps halving fire particles and forcing the plain fog.
- Server behaviour of every existing account route; merge of the other columns; `noDbImports.test.ts` (only `db/` imports the schema).
- No per-frame allocation in `CityView.update` / `FogView` (read cached numbers; the store computes factors on change).

### Notes for the merge
- Touches (corrected after review, E8-A3): `packages/shared/src/{config/playerSettings.ts,net/account.ts,index.ts}`, `apps/server/src/{db/schema.ts,db/accountsRepo.ts,db/progressRepo.ts,db/deviceTokensRepo.ts,meta/merge.ts,auth/accountDelete.ts,auth/accountRoutes.ts,auth/unlock.ts,app.ts,net/limits.ts,net/rateLimit.ts}`, `apps/server/drizzle/0006_progress_settings.sql` (+ meta), client `settings/settings.ts`, `net/{account,accountStore,settingsSync,deleteProgress}.ts`, `ui/{InRunMenu,StartScreen,SettingsPanel,SettingsScreen,App}.tsx`, `ui/{uiState,accountModel,settingsRows,menuItems}.ts` (menuItems: two dead strings removed), `ui/overlay.css`, `input/InputRouter.ts`, `render/city/{CityView,bakeTiles,rainLook}.ts`, `render/fog/FogView.ts`, `audio/{placeholderSfx,ambience}.ts`, `debug/perfProbe.ts`.
- `0006_progress_settings.sql` now also creates `paid_bags` (review L6); it was regenerated (not renamed) on the same master before any merge.
- Does **not** touch RunRoom / vote code (8.12 is building there). No netEvents kinds, no readability-sheet numbers, no protocol bump.
- Migration `0006` must be regenerated on top of master if another story adds one first (never rename).

### Testing standards
- Vitest; client DOM checks in `tools/checks/*DomLayout.test.ts` with real Chromium (skipped where missing). Server routes through `bootTestServer()` / PGlite. Every "now does X" line in this file has a test (E8-A3).

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Story 10.1]
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-11-26.md (10.1, 9.5, 9.6, 9.8 rows; Q3)]
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-11-26-epic-9-photoreal.md §4.2]
- [Source: _bmad-output/implementation-artifacts/epic-7-retro-2026-11-26.md (E7-A5, E7-A8)]
- [Source: _bmad-output/implementation-artifacts/epic-8-retro-2026-11-26.md (E8-A1, E8-A3)]
- [Source: AGENTS.md §2–§5]

## Dev Agent Record

### Agent Model Used

Claude (Claude Code, cloud session; builder for Story 10.1).

### Debug Log References

- First `gate:fast` run: typecheck 0, lint 0; 3 unit failures, all expected shape changes (the session / repo progress object now has `settings: null`: `lookSession.test.ts`, `unlockRoute.test.ts`, `db.test.ts`). Fixed (B20), re-run green; `release:check` green.
- First `settingsDomLayout` run: the in-run list and the account delete card at 568×320 put controls under the simulated bottom inset when scrolled into view → B19 (scroll-padding), 16/16 green.

### Completion Notes List

Ultimate context engine analysis completed - comprehensive developer guide created.

- AC 1 / 4: `SettingsPanel` (start screen + ☰) with aim assist, full speed, vibration, screen shake, rain, fog detail, light glow, show performance, effects and ambience volume; every change via `changeSettings` → `saveSettings` → subscribers (tests: `settings.test.ts`, `settingsRows.test.ts`, `showPerformance.test.ts`, `ambience.test.ts`, `settingsEffects.test.ts`, `aimAssistSetting.test.ts`).
- AC 2: `fogNoiseOn` is the only fog switch; `screenFog.ts` / `darknessPlan.ts` import no settings (source check in `settingsEffects.test.ts`).
- AC 3: gore / filmGrain / musicVolume stored, not shown (`playerSettings.test.ts`, `settingsRows.test.ts`).
- AC 5: explicit-only storage, junk-tolerant read, throwing storage (`settings.test.ts`).
- AC 6: migration `0006_progress_settings.sql` (generated on master `144c671`), `progressRepo.saveSettings`, `POST /account/settings`, merge rule, sync client (`accountDelete.test.ts` settings block, `mergeSettings.test.ts`, `settingsSync.test.ts`, `mergeRules.test.ts`).
- AC 7–10: `accountsRepo.deleteAccount` (one bounded transaction), `auth/accountDelete.ts`, `POST /account/delete`, `resetPhoneAfterDelete` (`accountDelete.test.ts`: guest + account, merged guest, solo vs shared saved run, wrong password, in_room incl. the re-check after marking, rate limit, Origin 403, username reusable, old ticket refused, old cookie 401, session with old token ≠ deleted account, log line has no id / name / token / IP; `deleteProgress.test.ts`).
- AC 11: `tools/checks/settingsDomLayout.test.ts` (4 screens × 4 sizes, insets); `saveMenuDomLayout` / `playersMenuDomLayout` and the wiring checks still green. Screenshots: `docs/art/settings/{settings,inrun-settings,delete}-{844x390,568x320}.png`.
- Not verified: a real phone (parked by the designer), real PostgreSQL (the real-PG suites run in CI only), audio levels by ear (the gains are unit-tested only).

### File List

- `packages/shared/src/config/playerSettings.ts` (new), `playerSettings.test.ts` (new); `packages/shared/src/net/account.ts`, `packages/shared/src/index.ts`
- `apps/server/drizzle/0006_progress_settings.sql` (new), `apps/server/drizzle/meta/0006_snapshot.json` (new), `_journal.json`
- `apps/server/src/db/{schema,accountsRepo,progressRepo,deviceTokensRepo,testQueries}.ts`, `apps/server/src/meta/merge.ts`, `meta/mergeSettings.test.ts` (new)
- `apps/server/src/auth/accountDelete.ts` (new), `accountDelete.test.ts` (new), `accountRoutes.ts`, `unlock.ts`, `guestSession.test.ts`, `lookSession.test.ts`, `unlockRoute.test.ts`; `apps/server/src/db/db.test.ts`
- `apps/server/src/app.ts`, `apps/server/src/net/{limits,rateLimit}.ts`
- `apps/client/src/settings/settings.ts`, `settings.test.ts`
- `apps/client/src/net/settingsSync.ts` (new) + test, `net/deleteProgress.ts` (new) + test, `net/account.ts`
- `apps/client/src/ui/{SettingsPanel,SettingsScreen}.tsx` (new), `ui/settingsRows.ts` (new) + test, `ui/{InRunMenu,StartScreen,App}.tsx`, `ui/{uiState,accountModel}.ts`, `ui/overlay.css`
- `apps/client/src/input/InputRouter.ts`, `input/aimAssistSetting.test.ts` (new)
- `apps/client/src/render/city/{CityView,bakeTiles,rainLook}.ts`, `render/fog/FogView.ts`, `render/settingsEffects.test.ts` (new)
- `apps/client/src/audio/{placeholderSfx,ambience}.ts`, `ambience.test.ts`
- `apps/client/src/debug/perfProbe.ts`, `debug/showPerformance.test.ts` (new)
- `tools/checks/settingsDomLayout.test.ts` (new), `tools/checks/{accountUpgradeWiring,survivorEditorWiring}.test.ts`
- `docs/art/settings/*.png` (new)

## Senior Developer Review (AI)

**Review 1 (fresh agent, 2026-11-26, relayed by the main session): no high; 3 medium, 9 low, nits.** All fixed in the review-fix commit; a narrow re-review of the medium fixes follows.

| # | Finding | Fix (file) | Test |
| --- | --- | --- | --- |
| M1 | Guest changes overwrote the account's settings at login (pending marked for guests and pushed) | Pending mark = the username; set only by a logged-in change; a mark for another username dropped at a session answer (`settings/settings.ts › setSettingsPending/settingsPendingFor`, `net/settingsSync.ts › changeSettings, acceptSessionSettings`) | `settingsSync.test.ts`: "guest changes, then a login to an account WITH settings…", "A's unsent change, then the phone switches to B…", "the upgrade path is kept…", "a guest never calls and its change is NOT marked" |
| M2 + L3 | A device logging in during a delete was never marked or room-checked; lock order | Inside the transaction, after the account row lock, every device row of the account is locked and re-read; a hash outside the checked set → `new_device` → 409 in_room (`db/accountsRepo.ts › deleteAccount`, `auth/accountDelete.ts`) | `accountDelete.test.ts` "M2: a login that lands after the room check…"; real PG `realPostgresDelete.test.ts` "M2 / L3 / L4 … ×20" |
| M3 | A deleted account's seat kept banking → FK 23503 → hand-grant line on every retry | Missing account row = quiet no-op (`db/progressRepo.ts › addSupplies`) | `accountDelete.test.ts` "M3: a bank for a deleted account's seat is a quiet no-op"; `runRewards.test.ts` (updated); real PG "M3: a bank racing the delete … ×20" |
| L1 | `/account/settings` accepted guests | 401 for `username === null` (`auth/accountDelete.ts › saveSettings`) | "L1: a guest's /account/settings → 401" |
| L2 | Concurrent pushes could land out of order | One send in flight; a re-send after it if changed; B9 says last writer wins across phones (`net/settingsSync.ts › pushSettings`) | "review L2: one send at a time…" |
| L4 | A login racing a delete answered 503 | Missing target account → `stale_credentials` → 401 (`db/deviceTokensRepo.ts › logIn`) | "L4: a login whose account was deleted after the password check answers stale (401)"; real PG M2/L3/L4 race |
| L5 | Shared saved-run snapshots kept my seat (account id, name; reclaimable) | `scrubSeats` in the delete transaction (`db/accountsRepo.ts`); B12 updated | "L5: in a shared saved run my seat is scrubbed…", "L5 (pure): scrubSeats…" |
| L6 | Deleting my run_rewards re-opened "bag already paid" | `paid_bags` marker (migration 0006) written in the delete; read by `oneBagPerRun` (`db/progressRepo.ts`) | "L6: deleting the account that found a run's bag never lets another account … a second bag"; real PG "L6"; `db.test.ts` tables list |
| L7 | AC 2 test was a source grep | Behavioural: ScreenFog radii + visibility() sweep equal at Full and Plain | `render/fog/fog.test.ts` "Story 10.1 review L7 (AC 2)…" |
| L8 | Screenshots missed most of the panel | Scrolled shots of the Rain / Fog / Glow rows and the sliders + Delete | `docs/art/settings/{settings,inrun-settings}-{screen,sound}-{844x390,568x320}.png` |
| L9 | A deleted account's other phones got "try later" | Remembered last username → "This account was deleted or logged out on another phone" (start screen + account calls) (`net/accountStore.ts`, `net/account.ts`, `ui/StartScreen.tsx`) | `net/accountGone.test.ts` (3 tests); DOM case "start screen, account gone" |
| nits | delete without password → 400 before Argon2; `settings_saved` at debug without id; incoming settings parsed field by field (`incomingSettingsSchema`); wrong_password shows the password field; placeholderSfx keeps its unsubscribe; dead `alwaysFullSpeed` strings removed; import order; readable disabled Delete; story-file record errors (Notes for the merge, T5 file name) | as listed | "nit: an account's delete with no password → 400…"; `playerSettings.test.ts` "settings from a newer server…"; DOM case "Delete confirm after wrong_password" |

**Re-review round 1 (narrow, fix commits only): M2 not fixed (deadlock), 3 lows, 1 nit.** All fixed:

| # | Finding | Fix (file) | Test |
| --- | --- | --- | --- |
| M2 (round 2) | Delete locked D → account → other devices; log in / reset lock old device → account: opposite orders deadlock (40P01 → 503). Reviewer probe on PG16: delete vs E re-login 29/40 errored, delete vs delete 32/40 | ONE lock order everywhere: the device rows sorted by `token_hash` (`ORDER BY … FOR UPDATE`), then the account row. `deleteAccount` reads D's account unlocked, locks ALL its device rows in order (D included, re-checks D), then the account, then re-reads the devices unlocked → `new_device`. `deviceTokensRepo.logIn` locks the device's row and, for a reset, every device row of the account in the same sorted statement before the account row. Audit: logOut locks only its device row; the merge locks accounts after the devices; the bank and saves take no device rows | `realPostgresDelete.test.ts` ×20 each: "a delete from D and a re-login of the account's OTHER phone E", "two deletes of one account from its phones D and E", "(lock-order audit) a delete and a forgotten-password reset". On the old code: the re-login test errored, delete-vs-delete 18/20 errored, reset-vs-delete 15/20 errored. Fixed, 3 runs: 0 errors, 0 deadlocks. Tallies of one run: re-login: new_device + login ok 15, deleted + login stale 5; two deletes: deleted + gone 20; reset: gone + reset ok 19, deleted + reset stale 1 |
| L5-live | A live room's next autosave wrote the deleted account's id, `acct:` key and real name back | The save path scrubs seats whose account no longer exists with the same helper (`db/scrubSeats.ts`, used by `deleteAccount` and `savedRunsRepo` put) | `accountDelete.test.ts` "L5-live: a live room remembers my seat; I delete; its next autosave keeps my seat scrubbed" |
| M3-log | The no-op read as `already: true` | `addSupplies` logs `supplies_bank_no_account { runId }` and answers `noAccount: true`; `banking.ts` skips its `supplies_banked` line then | "M3-log: … logs supplies_bank_no_account { runId } once and answers noAccount"; `runRewards.test.ts` updated |
| L5-bans | Bans matching a scrubbed guest seat key / token hash kept the hash | `scrubSeats` also clears bans by the scrubbed seats' original keys and guest token hashes | "L5-bans: a ban matching a scrubbed seat's guest key or token hash loses its hash too" |
| M1 nit | A pending mark survived a log-out | `logOutAccount` sends a pending change first, then drops the mark (`net/account.ts`); B9 states the A → B fallback | `settingsSync.test.ts` "re-review M1 nit: logging out drops this account's pending mark" |

**Re-review round 2 (the last; the cap is reached, the main session checks these): M2 holds for login, reset, delete, merge, upgrade; 2 more lock-order paths + 1 test nit.** All fixed:

| # | Finding | Fix (file) | Test (real PG 16, `realPostgresDelete.test.ts`) |
| --- | --- | --- | --- |
| R2-1 (medium) | Delete (A devices → A FOR UPDATE → saved_runs) vs an autosave of a shared run linking A (upsert run → link insert → FK key share on A) deadlocked; a delete committing between `knownAccounts` and the link insert gave 23503 | `savedRunsRepo` put: `knownAccounts` locks the linked account rows `ORDER BY id FOR KEY SHARE` BEFORE the run row (accounts → saved_runs, like delete and merge); a deleted account reads as gone (scrubbed, not linked). Line 143 unchanged; the delete's order unchanged | "re-review round 2 #1 (deterministic)": a third transaction holds the run row, the autosave queues on it, the delete starts, the row is freed — old code 1/1 40P01, fixed 0. "re-review round 2 #1 (race) ×20": old code 19/20 40P01, fixed 0 in 4 runs (save-race: deleted 20/20) |
| R2-2 (low) | Bank for a merged guest's seat (guest row FOR NO KEY UPDATE → insert progress(A) → key share A) vs the delete of A (holds A, deletes the guest rows) | `progressRepo.addSupplies`: `mergedInto` read unlocked, the payee account row locked first (FOR NO KEY UPDATE), then the seat row, `mergedInto` re-checked (a merge that landed in between locks its payee then) | "re-review round 2 #2 ×20" with progress(A) missing: old code 6/20 40P01, fixed 0 in 4 runs (bank banked 13–20 / noAccount 0–7) |
| R2-nit | `isDeadlockOr503` always returned true | Replaced by `countErrors` (every rejected result counts) with codes tallied from the `db_error` log line, which now carries the PostgreSQL SQLSTATE (`code`, `boundedTx.ts › pgCode`) | the tallies above (40P01 counts on the old code) |
| docs | One lock order, written once | LOCK ORDER block at the top of `db/accountsRepo.ts` (device rows by token_hash → accounts (account, then merged guests; several in id order) → guest rows → saved_runs); `deleteAccount`, `deviceTokensRepo.logIn`, `savedRunsRepo` put, `progressRepo.addSupplies` point at it | — |

Mutation check (E8-A1/E8-A3): each round-1 fix was removed and its test re-run. All fail without the fix and pass with it.

E8-A1: no red test was labelled flaky. Real PostgreSQL 16 (local, `TEST_DATABASE_URL`): `realPg`, `realPostgres`, `realPostgresAccounts`, `realPostgresSaves`, `realPostgresDelete` all green, one file at a time.

## Change Log

- 2026-11-26: story written (gds-create-story), built (gds-dev-story), status review.
- 2026-11-26: review 1 fixes (M1–M3, L1–L9, nits), B9 / B12 updated, B21–B23 added; status review (narrow re-review of the medium fixes next).
- 2026-11-26: re-review round 1 fixes (M2 lock order, L5-live, M3-log, L5-bans, M1 nit); B9 updated; status review (re-review round 2 next).
- 2026-11-26: re-review round 2 fixes (save and merged-guest bank lock order, test nit, LOCK ORDER note); the re-review cap is reached: the main session checks these.

## Main session close-out (2026-11-26)
- Review: fresh 3-layer review (M1–M3, L1–L9) → round 1 (M2 still deadlocked, plus 3 lows) → round 2 (save vs delete deadlock, merged-guest bank order, plus 1 nit) → cap reached.
- Main-session check of 43f0b56:
  - knownAccounts takes KEY SHARE in id order before the run row upsert.
  - addSupplies locks the payee account before the guest seat row.
  - Both follow the LOCK ORDER note.
  - The builder's real-PG races show 0 errors over 4 runs (old code: 19/20 and 6/20 40P01).
  - CI green. Merged as c5273e15 (PR #30).
- Accepted residual (logged in deferred-work): addSupplies, when a merge lands between the unlocked mergedInto read and the seat lock, locks the new payee after the seat row. A deadlock then needs a merge and a delete of that same new account inside that window.
