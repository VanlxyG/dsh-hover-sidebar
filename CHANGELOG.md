# Changelog

## Unreleased

- Keep the hover panel open while a native sidebar row drag (project or session reordering) is in flight. Chromium fires `pointercancel` and a `pointerleave` chain as soon as such a drag starts; that used to clear the drag state and close the panel mid-drag, invalidating the drop. The drag now lasts until `dragend`, adopts the drop position so the panel still closes when the pointer ends outside, and self-heals if a `dragend` is lost.

## 0.2.0 - 2026-10-18

- Standard managed DSH bundle, bilingual metadata and documentation, MIT license, GitHub CI and release packaging.
- Rearm hover intent after window exit/reentry and re-evaluate after focus, resize, drag and frame replacement.
- Protect editing and portaled sidebar menus without trapping pointer-focused buttons.
- Make enable/disable, stop, effect disposal and hot replacement clean up every owned resource.
- Restore existing animation styles, respect reduced motion, contain host toggle failures and validate settings.
- Add deterministic logic regressions, real Chromium contract tests, syntax checks and package/credential guards.

## 0.1.0

Initial local implementation with hover intent, manual pinning, desktop/web rail handling and width animations.
