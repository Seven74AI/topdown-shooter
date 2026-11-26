---
baseline_commit: 144c671
---

# Story 10.1: Settings screen

Status: review

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
| 10.1-B9 | **Sync only for logged-in accounts** (username set), as the AC says. A change marks the settings "pending" (localStorage) and is sent after 1 s without further changes; success clears the mark. On a session / login answer: pending → send mine; else server settings present → adopt them; else (account has none) send mine if I changed anything. Same pattern as the 7.10 look. | auto-accepted (designer 2026-11-26: follow recommendations) |
| 10.1-B10 | **`POST /account/settings` `{ settings }`**: ≤ 1 KB body (413), Origin check, per-IP and per-account limits (20 / min each), 401 without an account, the stored value is the schema-parsed one (unknown keys dropped), answers `{ ok, settings }`. | auto-accepted (designer 2026-11-26: follow recommendations) |
| 10.1-B11 | **`POST /account/delete` `{ password? }`**: per-IP limit 5 / min before the body; guest = the cookie is enough; account = password (Argon2 verify; a wrong one counts on `loginNameLimiter`); 409 `in_room` when any of the account's device hashes is in a room (re-checked after marking every hash as switching, like 7.6 L2). | auto-accepted (designer 2026-11-26: follow recommendations) |
| 10.1-B12 | **Saved runs:** a run whose only linked accounts are mine is deleted; a run another account can still resume keeps playing for them, and only my `saved_run_players` link goes (my seat in the snapshot stays as a seat nobody can claim). Retired guests merged into me are deleted first (`merged_into` has no cascade) — they are my data. | auto-accepted (designer 2026-11-26: follow recommendations) |
| 10.1-B13 | **The log line** `account_deleted { kind: "guest" \| "account", guests, savedRunsDeleted, seatsRemoved }`: no account id (pseudonymous, links to older lines), no IP, no username. | auto-accepted (designer 2026-11-26: follow recommendations) |
| 10.1-B14 | **"Old token refused"** = its device row is gone, so its join ticket fails the 7.6 L1 row check, every account action with the old cookie answers 401, and the session call never maps it back to the deleted account (it is an unknown device: a fresh empty guest). No tombstone table (it would keep data about the deleted player). | auto-accepted (designer 2026-11-26: follow recommendations) |
| 10.1-B15 | **After a delete the client resets the phone and reloads**: guest token, settings (+ pending mark), name, look copy cleared; the server already cleared the cookie (`Max-Age=0`). The reload starts the normal session call → a new guest, 0 Supplies. | auto-accepted (designer 2026-11-26: follow recommendations) |
| 10.1-B16 | **Where it lives:** start screen bottom row "Practice solo · Progress · Settings" → a full Settings screen (`UiScreen` kind `settings`, Back → start). The ☰ Settings view shows the same `SettingsPanel` without the Progress group (the server refuses a delete in a run; the panel says "Delete my progress is on the start screen"). Groups: Controls, Screen, Sound, (start screen only) Progress. | auto-accepted (designer 2026-11-26: follow recommendations) |
| 10.1-B17 | **Controls:** booleans = the existing LF5 switch; 2–3 choices = a segmented row of 44 px buttons (`aria-pressed`); volumes = a native range input styled to 44 px. Text 14–16 px. | auto-accepted (designer 2026-11-26: follow recommendations) |
| 10.1-B18 | **Haptics row only where `navigator.vibrate` exists** (iPhones can't vibrate from a web page; a dead switch there misleads). | auto-accepted (designer 2026-11-26: follow recommendations) |
| 10.1-B19 | *(build time)* **Scroll padding = the safe-area insets** on the two scrolling Settings views, so a control scrolled into view (focus, keyboard) stops above the home bar like the padding does. The in-run view's Back has no autofocus (it would open the long list scrolled to the bottom; ☰ / Esc still close). | auto-accepted (designer 2026-11-26: follow recommendations) |
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
  - [x] `accountsRepo.deleteAccount` (one `boundedTransaction`); `auth/deleteAccount.ts`; routes `/account/settings`, `/account/delete`; limiters.
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
- Touches: `packages/shared/src/{config/playerSettings.ts,net/account.ts,index.ts}`, `apps/server/src/{db/schema.ts,db/accountsRepo.ts,db/progressRepo.ts,meta/merge.ts,auth/*,app.ts,net/rateLimit.ts}`, `apps/server/drizzle/0006_*`, client `settings/`, `net/account.ts`, `net/settingsSync.ts`, `ui/{InRunMenu,StartScreen,SettingsPanel,SettingsScreen,App,uiState,menuItems}`, `ui/overlay.css`, `input/InputRouter.ts`, `render/city/{CityView,bakeTiles}.ts`, `render/fog/FogView.ts`, `audio/{placeholderSfx,ambience}.ts`, `debug/perfStats.ts`.
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

## Change Log

- 2026-11-26: story written (gds-create-story), built (gds-dev-story), status review.
