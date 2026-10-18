# Security

## Scope

This plugin runs inside the Harness browser renderer and has the same trust level as other client plugins. It observes pointer/focus/layout events, calls the public sidebar toggle, temporarily changes four animation style properties, and stores allowlisted appearance preferences under `dsh-hover-sidebar` in localStorage.

It does not make network requests, execute shell commands, read files or credentials, inspect conversation content, load remote scripts, or add a server endpoint. Its host entry is deliberately inert. There are no runtime dependencies or installation lifecycle hooks.

Unknown layouts stay idle. Numeric settings are bounded, easing strings validated, and teardown cancels observers, listeners, timers, animation frames and animations. Style cleanup restores values only while they are still owned by this plugin.

These boundaries and automated checks reduce risk; they are not a claim that all vulnerabilities have been ruled out. Host regressions and other installed plugins can affect the same renderer. Pin a release and check its SHA-256 when installing.

## Reporting

For a potential security issue, use the repository's private vulnerability reporting feature if enabled. Do not post credentials, cookies, full boot HTML, conversation logs or unredacted profile files in a public issue. If private reporting is unavailable, open an issue requesting a private contact channel without exploit details or sensitive data.

The latest published version is the maintained version. Fixes are delivered in a new release; previous release files are not replaced.
