# Forged idea: controller support on the phone

**Outcome:** HARDENED · 2026-11-25

Play on a phone (mobile browser) with a Bluetooth Xbox or PlayStation controller paired to it. Not about desktop.

## Locked
- **Controller-only.** Every part of a run (waves, build phase, shop, lobby, evacuation vote, menus) can be played without touching the screen. The one exception is typing.
- **Phones:** Android and iPhone.
- **Text fields (name, room code):** the controller moves focus to the field and calls `focus()` on it. Typing is always on the phone's keyboard; there is no in-game keyboard or letter picker.
  - Android: Chrome treats a controller press as a user gesture, so the keyboard should open.
  - iPhone: Safari doesn't, so the field shows a "tap to type" hint and one tap opens the keyboard.
- **HUD while the controller is active:** the buttons show controller prompts in the right family (Xbox A/B/X/Y or PlayStation ✕/○/□/△), detected from `gamepad.id`. The touch joysticks hide. On a PlayStation pad, Place is ✕ and cancel is ○, so the on-screen cancel icon follows the controller.
- **Switching devices:** while the controller is active, taps on menus or text fields don't switch devices. Only a touch on the game area hands control back to touch.
- **Disconnect mid-run:** the in-run menu opens and all input stops, using Story 2.11's stand-still rule. Online, the survivor stands still until the controller reconnects or the player switches to touch.
- **Aim assist:** stays on for controller stick aim. It is off only for mouse aim.

## Defaults (not locked)
- **Build phase:** reuse Story 5.23's no-pointer path (carry, rotate, place, pick up, undo). The shoulder buttons cycle through the 7 build tiles.
- **Button map:**

  | Control | Action |
  | --- | --- |
  | Left stick | Move |
  | Right stick | Aim and fire |
  | Y / △ | Swap weapon |
  | X / □ | Consumable |
  | Shoulder buttons | Cycle build tiles |
  | A / ✕ | Place / confirm |
  | B / ○ | Cancel / back |
  | Start | Menu |
- **Menus:** the d-pad or left stick moves focus across the Preact screens.

## Rejected
- **Hybrid (controller in waves, touch for build, shop and menus):** rejected, because the user wants to play with the controller only.
- **Letter picker or arcade-style name entry:** rejected; the phone keyboard is enough.
- **Help screen instead of HUD prompts:** rejected.

## Open risks
- Untested on real phones:
  - Does a controller press open the keyboard on Android?
  - Does the "tap to type" fallback work on iPhone?
- Placing buildings by carrying them with a stick has only been tried with the keyboard.
- Stories 7.3 and 7.6 say `input/menuInput.ts` does keyboard and gamepad menu navigation. It has no gamepad code; fix those stories before Epic 7 is built.
