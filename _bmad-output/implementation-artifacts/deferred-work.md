
## From spec-always-full-speed-setting (2026-11-25 review)

- **In-run menu sub-views don't move keyboard focus** (`apps/client/src/ui/InRunMenu.tsx`, Players and Settings views): `autofocus` on Back only works for the first focus in the page, so opening a sub-view leaves focus on `<body>` (outside the `aria-modal` dialog). Fix once for every view: focus the first control from a ref on mount. Existing pattern; not caused by the Settings view.
