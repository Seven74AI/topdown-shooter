# Sprint Change Proposal: controller on the phone (2026-11-25)

Mode: batch. Scope: **Moderate**. It adds a new epic and changes backlog text in Epics 7, 8, 10 and in the GDD and architecture doc. No built code changes. Status: **approved by the designer 2026-11-25 ("Parfait"); all §4 edits applied**.

Input: `_bmad-output/forge/controller-support/forged-idea.md` (forge session, hardened, 2026-11-25).

## 1. Issue

**Trigger:** a new requirement from the designer (no failing story). The designer wants to play a whole run on a phone with a Bluetooth Xbox or PlayStation controller, on Android and iPhone, in the mobile browser.

**Evidence:**
- The GDD listed controller support under "Not planned". The designer removed it on 2026-11-25 (`gdd.md:358`).
- `apps/client` has no controller code. Nothing calls `navigator.getGamepads`.
- `InputRouter` and `selectSource.ts` know only two devices: `"touch" | "mouse"`.
- Stories 7.3 (`:83`) and 7.6 (`:56`) say `input/menuInput.ts` does "keyboard/gamepad menu navigation". It doesn't: `menuInput.ts` holds only `neutralizeInput`, `holdBuildingInput` and `standsStill`. A dev agent building Epic 7 would rely on a feature that isn't there.
- Browser support (forge research):
  - Chrome counts a `getGamepads()` read with a button pressed more than 50 % as a user gesture, so `focus()` should open the Android keyboard. This is unconfirmed.
  - Safari/WebKit gives no user gesture for controller presses, so on iPhone the field gets focus, but one tap is needed to open the keyboard.

## 2. Impact

### Checklist

| # | Item | Status | Finding |
| --- | --- | --- | --- |
| 1.1 | Trigger | [x] | New requirement, no story |
| 1.2 | Problem type | [x] | New requirement from the designer |
| 1.3 | Evidence | [x] | See §1 |
| 2.1 | Current epic (6) | [N/A] | Epic 6 has no input or menu work left |
| 2.2 | Epic-level change | [!] | New **Epic 12: Controller on the phone** (4 stories) |
| 2.3 | Remaining epics | [!] | 7.3, 7.6, 7.10 (new screens); 8.7 (ping key); 9.7 (UI art); 10.1 (settings); 10.5 (browser smoke test); 10.9 (playtests) |
| 2.4 | Obsolete epics | [N/A] | None |
| 2.5 | Order | [!] | 12.1 and 12.2 are built right after the Network pass and before Epic 7's screen stories, so new screens ship with controller support instead of being retrofitted |
| 3.1 | GDD / FRs | [!] | Controls and Input, Platform-Specific Details; new FR95–FR98 |
| 3.2 | Architecture | [!] | Input row, input folder, Touch controls row. The wire format is unchanged: a controller sends `isMouse=false`, so aim assist stays on |
| 3.3 | UX | [!] | HUD prompts and the cancel icon (`docs/ideas/building-ux/ux-spec.md`); every Preact screen needs a focus order |
| 3.4 | Other | [!] | `docs/qa/browsers.md` (10.5) gets a controller row; no CI or deploy impact |
| 4.1 | Direct adjustment | Viable | Effort medium, risk low–medium |
| 4.2 | Rollback | Not viable | Nothing built needs undoing |
| 4.3 | MVP review | Not needed | It fits the phone-first pillar; v1 scope grows by one epic |

### Technical impact

- **Client only.** `packages/shared` and the server are untouched: the input message already carries move, aim, fire, swap, consumable and `isMouse`.
- **New module:** `apps/client/src/input/Gamepad*`, which reads the controller once per frame, with the same dead zones as the touch sticks (move 10 %, aim 30 %).
- **`InputSource` becomes `"touch" | "mouse" | "gamepad"`.**
- **Every Preact screen gets a focus order.**

### Risks

| Risk | Mitigation |
| --- | --- |
| The Android keyboard doesn't open from `focus()` | 12.2 begins with a real-phone spike. If it fails, the iPhone "tap to type" path is used on both phones |
| Placing buildings by carrying them with a stick feels too coarse | 12.4 playtest on a real phone; the 0.5 m grid steps stay the same |
| PlayStation and Xbox buttons are swapped on iOS or Android | 12.1 tests both controllers on both phones, using the browser's `standard` mapping |

## 3. Recommended approach

**Direct adjustment: add a new Epic 12 and change existing story text.**
- **12.1 and 12.2** are built after the Network pass and before 7.3, 7.6 and 7.10.
- **12.3 and 12.4** can be built any time after 12.1.
- **Effort:** about 4 stories of Epic 5 size (12.2 and 12.4 are the largest).
- **Timeline:** Epic 7's screen stories move back by 2 stories.

## 4. Detailed change proposals

### 4.1 Epics (`planning-artifacts/epics.md`)

**Epic List** (`:323`)

OLD:
> Order: 1 → 2 → 3 → 4 (Milestone 1) → 5 → 6 → **Network pass** (…) → 7 → rest of 8 → 10 (v1) → **11 Random city (…)**.

NEW:
> Order: 1 → 2 → 3 → 4 (Milestone 1) → 5 → 6 → **Network pass** (…) → **12.1–12.2 Controller base (sprint change proposal 2026-11-25 controller)** → 7 → rest of 8 → 12.3–12.4 → 10 (v1) → **11 Random city (…)**.

Rationale: Epic 7's new screens are built after the menu focus system exists.

**New entry after Epic 11 in the list:**
> ### Epic 12: Controller on the phone
> A player can play a whole run with a Bluetooth Xbox or PlayStation controller paired to an Android phone or an iPhone, in the mobile browser: the fight, the build phase, the shop, the lobby, the vote and every menu. Typing stays on the phone keyboard. The HUD shows that controller's buttons.
> **FRs covered:** FR95, FR96, FR97, FR98

**New FRs** (after FR94):
> - FR95: A Bluetooth Xbox or PlayStation controller drives the survivor on Android Chrome and iOS Safari:
>   - Left stick moves; right stick aims, and aiming fires automatically.
>   - Swap, consumable, ping and menu each have a button.
>   - Aim assist stays on.
>   - While the controller is active, taps on UI don't switch to touch; only touching the game area does.
>   - If the controller disconnects mid-run, the in-run menu opens and the survivor stands still.
> - FR96: Every menu screen can be used with the controller. The d-pad or left stick moves focus, A/✕ confirms, and B/○ goes back. Selecting a text field focuses it. On Android the phone keyboard opens; on iPhone the field shows "tap to type". There is no in-game keyboard.
> - FR97: While the controller is active, HUD buttons show that controller's prompts (Xbox A/B/X/Y or PlayStation ✕/○/□/△, from `gamepad.id`). The touch sticks hide, and the cancel icon follows the controller family.
> - FR98: The build phase can be played with the controller:
>   - The shoulder buttons cycle the build tiles.
>   - The ghost is carried in front of the survivor (Story 5.15).
>   - There are buttons for rotate, place, pick up and undo, and the repair and sell actions are reachable.

**New stories** (new section `## Epic 12: Controller on the phone`, after Epic 11):

> ### Story 12.1: Controller in the fight
> As a player with a controller paired to my phone, I want to move, aim, fire, swap, use consumables and open the menu with it, so that I can fight without touching the glass.
>
> **Given** a standard-mapping Xbox or PlayStation controller on Android Chrome or iOS Safari
> **When** I press any button or push a stick
> **Then**:
> - the controller becomes the active device;
> - the left stick moves (10 % dead zone) and the right stick aims (30 % dead zone, fires while aiming);
> - Y/△ swaps, X/□ uses the consumable, and Start opens the in-run menu;
> - `isMouse` is false, so aim assist applies;
> - the touch sticks hide.
>
> **Given** the controller is active
> **When** I tap a menu, button or text field
> **Then** the controller stays the active device; only a touch on the game area hands control back to touch.
>
> **Given** a run, online or solo
> **When** the controller disconnects
> **Then** the in-run menu opens and my input is neutral, using Story 2.11's stand-still rule: the survivor stands still until the controller reconnects or I use touch.
>
> **Given** an Xbox controller and a DualSense
> **When** each is tested on an Android phone and an iPhone
> **Then** every mapping above works, and the results are recorded in `docs/qa/browsers.md`.

> ### Story 12.2: Menus with the controller
> As a player with a controller, I want to use every screen with it, so that I never need to touch the phone except to type.
>
> **Given** the start screen, lobby, shop, in-run menu, results and evacuation vote
> **When** a controller is active
> **Then** one element has a visible focus ring; the d-pad or left stick moves focus in a fixed order; A/✕ presses; and B/○ goes back or closes, like the screen's own back or close.
>
> **Given** the name or room-code field
> **When** I press A/✕ on it
> **Then** the field gets `focus()` during the same frame the controller is read. On Android the phone keyboard opens. On iPhone the field shows "tap to type", and one tap opens the keyboard.
>
> **First task (spike):** on a real Android phone and a real iPhone, confirm whether `focus()` from a controller press opens the keyboard. If Android fails too, both phones use "tap to type".
>
> **And** this story replaces the claim in 7.3 and 7.6 that `menuInput.ts` already handles gamepad navigation. The focus system lives in a new module (`ui/focusNav.ts` or similar), and later screens use it.

> ### Story 12.3: Controller prompts on the HUD
> As a player, I want the HUD to show my controller's buttons, so that I press the right one in a fight.
>
> **Given** an active controller
> **When** the HUD draws the swap, consumable, ping, build, rotate, place, cancel and undo buttons
> **Then** each shows its controller prompt in that controller's family: Xbox A/B/X/Y or PlayStation ✕/○/□/△, detected from `gamepad.id`, with Xbox as the default for unknown controllers.
>
> **And** on a PlayStation controller, Place is ✕ and cancel is ○: the on-screen ✕ cancel icon changes to match.
>
> **And** the prompts return to touch icons when touch takes over.

> ### Story 12.4: Build phase with the controller
> As a player with a controller, I want to pick, carry, rotate and place buildings with it, so that the build phase doesn't need the screen.
>
> **Given** a build phase with the controller active
> **When** I press the shoulder buttons
> **Then** the build bar's focus cycles through the 7 tiles, and A/✕ picks one up. This is the same path as the desktop digits in Story 5.23.
>
> **Given** I hold a building
> **When** I walk
> **Then** the ghost is carried in front of my survivor (5.15).
> - The rotate button turns it.
> - A/✕ places it (5.18 chain kept).
> - B/○ cancels.
> - The undo, pick-up, repair and sell actions each have a button or a focusable action-bar entry (5.20, 5.21, 3.7).
>
> **And** a real-phone playtest confirms that carrying with a stick can hit a 0.5 m grid spot. If not, the right stick nudges the ghost one grid step at a time.

**Story 8.7 Pings** (`epics.md` AC 1)

OLD: `…on desktop the F key opens it; downed players can ping`

NEW: `…on desktop the F key opens it; with a controller, the ping button (FR95) opens it and the right stick picks a ping; downed players can ping`

**Story 10.1 Settings screen** — add an AC:
> **And** the Settings screen can be used with the controller (FR96), and aim assist's toggle applies to controller aim too.

**Story 10.5 Home-screen install and every supported browser** (last AC)

OLD: `When a smoke test (lobby, one wave, shop, build) runs on each`

NEW: `When a smoke test (lobby, one wave, shop, build) runs on each, and once more on iOS Safari and Android Chrome with a controller only (FR95–FR98)`

**Story 10.9 Friend-group playtests** — add a note: at least one playtest session with a controller on a phone.

**Story 9.7 UI art** — add a note: controller prompt icons for Xbox and PlayStation, drawn in code like the other UI art.

### 4.2 Story files (`implementation-artifacts/`)

**7.3 Unlock screen** (`7-3-unlock-screen.md:83`)

OLD:
> …screens hiding themselves; `menuInput` keyboard/gamepad navigation in menus (`input/menuInput.ts`) for the new buttons.

NEW:
> …screens hiding themselves; the new buttons join Story 12.2's controller focus order (`menuInput.ts` has no menu navigation: it only neutralizes input).

**7.6 Upgrade to an account** (`7-6-upgrade-to-an-account.md:56`)

OLD:
> …Practice solo (`:161-168`); keyboard/gamepad menu navigation (`input/menuInput.ts`).

NEW:
> …Practice solo (`:161-168`). The account forms join Story 12.2's focus order, and the username and password fields focus the same way as the name field (FR96).

**7.10 Survivor editor** (`7-10-survivor-editor.md:53`) — add one line under the colour picker task:
> With a controller, focus moves over the 12 swatches; the native `<input type="color">` stays touch-only. The tabs and part tiles join Story 12.2's focus order. The preview's auto-turn covers the drag-to-turn.

### 4.3 GDD (`gdds/gdd-topdown-shooter-2026-11-21/gdd.md`)

**Controls and Input** — add after the "Desktop (bonus)" line (`:87`):
> - **Controller on the phone:** a Bluetooth Xbox or PlayStation controller paired to the phone plays the whole run.
>   - Left stick moves; right stick aims and fires automatically.
>   - Y/△ swaps, X/□ uses the consumable, Start opens the menu.
>   - The shoulder buttons cycle the build bar; A/✕ places or confirms, B/○ cancels or goes back.
>   - Aim assist stays on.
>   - The HUD shows that controller's buttons.
>   - Typing is on the phone keyboard.

**Platform-Specific Details** (`:312`)

OLD:
> - **Mobile browsers (primary):** Safari on iOS 16+, Chrome on Android 10+. Landscape only; respects notches and safe areas; can be added to the home screen.

NEW:
> - **Mobile browsers (primary):** Safari on iOS 16+, Chrome on Android 10+. Landscape only; respects notches and safe areas; can be added to the home screen. Works with touch only or with a Bluetooth Xbox or PlayStation controller only.

**GDD epics** (`gdds/.../epics.md`) — add `## Epic 12 — Controller on the phone` with the same one-paragraph summary.

### 4.4 Architecture (`planning-artifacts/game-architecture.md`)

| Line | OLD | NEW |
| --- | --- | --- |
| `:51` | `Touch twin-stick input + desktop fallback` | `Touch twin-stick input + desktop fallback + controller on the phone (Gamepad API)` |
| `:124` | `Phaser input manager (multi-touch pointers, keyboard, mouse)` | `Phaser input manager (multi-touch pointers, keyboard, mouse) + browser Gamepad API read once per frame (not Phaser's gamepad plugin)` |
| `:328` | `# touch twin-stick, keyboard/mouse, input sampler` | `# touch twin-stick, keyboard/mouse, controller, input sampler` |
| `:401` | `Touch controls \| apps/client/src/input \| Floating twin-sticks, aim assist input` | `Touch and controller \| apps/client/src/input \| Floating twin-sticks, controller, aim assist input` |

Add to the Client input bullet (`:188`):
> A controller sends the same message with `isMouse=false`; the wire format doesn't change.

### 4.5 Sprint status (`implementation-artifacts/sprint-status.yaml`)

Add:
```yaml
  epic-12: backlog  # controller on the phone (sprint change proposal 2026-11-25 controller); 12.1-12.2 before Epic 7's screen stories
  12-1-controller-in-the-fight: backlog
  12-2-menus-with-the-controller: backlog
  12-3-controller-prompts-on-the-hud: backlog
  12-4-build-phase-with-the-controller: backlog
  epic-12-retrospective: optional
```

## 5. Implementation handoff

- **Scope:** Moderate: a new epic and backlog edits. No built code is rolled back.
- **Owners:**
  - The developer agent applies the §4 text edits.
  - `gds-create-story` writes the 12.1 and 12.2 story files from the real code before they're built.
  - 12.3 and 12.4 get their story files later.
- **Designer:** approves this proposal, and runs the real-phone checks: the 12.1 mapping test, the 12.2 keyboard spike, the 12.4 carry playtest.
- **Success criteria:**
  - One full solo run and one online run are played on an Android phone and on an iPhone with a controller only, touching the glass only to type.
  - 7.3 and 7.6 no longer claim gamepad code that doesn't exist.
