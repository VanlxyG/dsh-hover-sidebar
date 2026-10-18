# Maintenance

This is a dependency-free DSH client bundle. The public runtime is `client.js`;
`index.js` must remain inert. Keep all host DOM assumptions in `findLayout()` and
use the public `layout.toggleSidebar()` action. Unknown layouts should stay idle.

Preserve manual pinning, intent delay, drag/focus protections, reduced motion,
single-instance replacement and complete lifecycle cleanup. Every added listener,
timer, observer, animation frame or animation needs an owned disposer.

For behavior changes, add a focused regression. Required checks:

```
npm test
npm run check
npm run test:browser
```

The browser tests use an isolated host-contract fixture. A compatibility claim
for a new DSH release additionally needs a real-host smoke test. Keep real-host
credentials, logs, boot HTML, local migration helpers and machine paths outside
the repository. The package allowlist has nine files; do not widen it casually.

For releases, keep the diagnostic version in `client.js`, `package.json`, the
installation examples and `CHANGELOG.md` consistent. CI publishes new versions
after all jobs pass; existing release assets are immutable by convention.