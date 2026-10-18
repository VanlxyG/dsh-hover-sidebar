# Compatibility evidence

Verified on 2026-10-18 for plugin v0.2.0.

| Layer | Result | Scope |
| --- | --- | --- |
| Deterministic logic | 50 passed | Intent, manual pinning/dismissal, window reentry, focus, menus, dragging, configuration, failure containment, cleanup and hot replacement |
| Isolated Chromium contract | 36 passed | Real pointer input, 0px native / 56px web tracks, intermediate animation frames, reduced motion, DOM replacement and enable/disable |
| Real official DSH 0.2.1-rc.2 | 14 passed | Published managed package loaded once; web and native track geometry; hover open, leave close, manual pinning; browser enable/disable |
| GitHub CI | Passed | Windows and Linux, Node.js 22 and 24; browser checks on Node.js 24; package checks and release publication |

The real-host check used a disposable authenticated browser. No credentials,
cookies, conversation data, boot HTML or host logs are part of this repository.
The host's first-visit preview notice was acknowledged through its ordinary
Continue control before testing; auto-reveal correctly stayed suspended while
that modal was open.

Official managed installation recorded both the release URL dependency and the
bundle. Existing direct dependency versions and earlier bundle selections were
unchanged. The obsolete local insert was removed to prevent duplicate entries.

Host-version compatibility remains a capability/DOM contract, not a guarantee
for future releases. The native manager owns package enablement; the plugin's
browser-local switch owns only its current browser instance. The public package
has no version-pinned DSH peers or runtime dependencies.
