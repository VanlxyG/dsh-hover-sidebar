# dsh-hover-sidebar

Hover to reveal the DeepSeek Harness left sidebar; leave to hide it. Manually opened sidebars stay pinned.

[中文说明](README.md) · [Releases](https://github.com/VanlxyG/dsh-hover-sidebar/releases)

Zero runtime dependencies, build steps or install hooks. Uses the host's public `layout.toggleSidebar()` action. No network, conversation access, credential access or host-file patches.

## Install

In the official desktop app, open **Settings → Plugins**, choose the add-plugin action and enter:

```text
https://github.com/VanlxyG/dsh-hover-sidebar/releases/download/v0.2.0/dsh-hover-sidebar-0.2.0.tgz
```

You can also download that package from Releases and install the local file. Follow any host refresh/restart prompt. Use the installed plugin's switch to enable or disable it.

For a web profile:

```sh
dsh plugin --profile web add https://github.com/VanlxyG/dsh-hover-sidebar/releases/download/v0.2.0/dsh-hover-sidebar-0.2.0.tgz
```

Use managed installation so the package source and bundle survive dependency reinstalls. Copying only to `node_modules` is insufficient. When migrating from a manually registered version, back up the profile and remove its old `hover-sidebar` insert block before installing the bundle, to avoid duplicate entries.

## Behavior

- Hover at the left edge for 120ms to open. Native shells use a 12px zone; the web shell's whole collapsed icon rail is valid.
- Leaving the sidebar plus its 24px margin hides it after 300ms. Returning cancels closing.
- Manual opens stay pinned. Manual closes require leaving/reentering before hover can reopen.
- Editing, keyboard navigation, sidebar menus and dragging are protected. Touch does not trigger hovering.
- Escape dismisses a temporary panel. Animations respect reduced-motion preferences.

## Compatibility

The current baseline is the layout contract in official DSH `0.2.1-rc.2`. Contract tests cover 0px native and 56px web collapsed tracks. There are no version-pinned DSH peers or private-module imports. The DOM adapter accepts changing CSS hashes and reconnects after remounts; an unknown layout leaves the enhancement idle.

DSH is a developer preview with breaking changes. Compatibility with every future release cannot be guaranteed. Replacing an entire profile can still remove user-installed plugins; keep backups.

## Tuning and development

```js
__dshHoverSidebar.configure({ hotzonePx: 16, leaveDelayMs: 450 })
__dshHoverSidebar.setEnabled(false)
__dshHoverSidebar.setEnabled(true)
__dshHoverSidebar.configure({})
__dshHoverSidebar.state()
```

These browser-local overrides follow the current origin, which can change between desktop launches. Use the host plugin-manager switch for durable package enablement.

Node.js 22+, no dependency installation required:

```sh
npm test
npm run check
npm run test:browser
npm run pack:release
```

Browser tests launch an isolated headless Chrome/Edge with random loopback ports and a disposable profile; set `BROWSER_BIN` if detection fails. Passing CI on `main` creates a release for each new package version, with a package tarball and SHA-256 checksum. Existing releases are never overwritten.

Discovery in dsh-market requires separate inclusion in the [community catalog](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin). See [SECURITY.md](SECURITY.md), [CONTRIBUTING.md](CONTRIBUTING.md), and the MIT [LICENSE](LICENSE).
