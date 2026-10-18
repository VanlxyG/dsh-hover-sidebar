# Contributing

Keep the runtime dependency-free and the host entry inert. Put changes to DOM assumptions in `findLayout()`; do not import private DSH modules, patch host bundles, or click guessed buttons. Preserve manual pinning and the ability to unload every resource.

For behavior changes, add a focused test that fails before the fix. Run `npm test`, `npm run check` and `npm run test:browser`. Browser tests use a minimal host contract fixture, so a DSH upgrade also needs a separate smoke test against the real host before declaring support for it. Do not commit that host's credentials, snapshots or logs.

Use public release tarballs for installation. Update the manifest and client diagnostic versions together. Keep the changelog and installation examples current. The release workflow does not publish to npm or need an npm token.
