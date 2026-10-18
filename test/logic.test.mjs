import test from "node:test";
import assert from "node:assert/strict";
import { harness } from "./harness.mjs";

function opened(h) { assert.equal(h.host.collapsed, false); assert.equal(h.api.state().hoverOpened, true); }
function hover(h) { h.move(3); h.tick(160); opened(h); }

test("desktop edge opens once after intent delay", () => {
  const h = harness(); h.move(3); h.tick(100); assert.equal(h.host.toggleCalls, 0);
  h.tick(100); opened(h); h.tick(2000); assert.equal(h.host.toggleCalls, 1);
});
test("web icon rail is the summon zone", () => { const h = harness({ rail: 56 }); h.move(40); h.tick(); opened(h); });
test("desktop does not summon from where a web icon rail would be", () => { const h = harness(); h.move(30); h.tick(); assert.equal(h.host.collapsed, true); });
test("native titlebar and negative coordinates are excluded", () => {
  const h = harness(); h.move(3, 10); h.tick(); h.move(-1); h.tick(); assert.equal(h.host.toggleCalls, 0);
});
test("crossing the edge does not open", () => {
  const h = harness(); h.move(3); h.tick(40); h.move(900); h.tick(); assert.equal(h.host.toggleCalls, 0);
});
test("leaving during intent and reentering at the same coordinates rearms", () => {
  const h = harness(); h.move(3); h.tick(50); h.leave(); h.tick(); assert.equal(h.host.toggleCalls, 0);
  h.move(3); h.tick(); opened(h);
});
test("moving out closes and a new visit opens", () => {
  const h = harness(); hover(h); h.move(900); h.tick(); assert.equal(h.host.collapsed, true);
  hover(h); assert.equal(h.host.toggleCalls, 3);
});
test("leaving the window discards stale inside coordinates", () => {
  const h = harness(); hover(h); h.leave(); h.tick(); assert.equal(h.host.collapsed, true);
  h.move(3); h.tick(); opened(h);
});
test("manual opens stay pinned across movement and blur", () => {
  const h = harness(); h.manual(); assert.equal(h.api.state().pinned, true);
  h.move(1000); h.leave(); h.tick(2000); assert.equal(h.host.collapsed, false);
});
test("manual collapse on the edge requires exit and reentry", () => {
  const h = harness(); hover(h); h.manual(); h.tick(1000); assert.equal(h.host.collapsed, true);
  h.move(600); h.tick(20); hover(h);
});
test("click-focused buttons do not keep a hover panel stuck open", () => {
  const h = harness(); hover(h); h.focus(h.host.button); h.move(900); h.tick(); assert.equal(h.host.collapsed, true);
});
test("text input focus is protected, then focusout closes without pointer movement", () => {
  const h = harness(); hover(h); h.focus(h.host.input); h.move(900); h.tick(1000); opened(h);
  h.focus(null); h.tick(); assert.equal(h.host.collapsed, true);
});
test("keyboard navigation is protected, then focusout closes", () => {
  const h = harness(); hover(h); h.doc.fire("keydown", { key: "Tab" }); h.focus(h.host.button);
  h.move(900); h.tick(1000); opened(h); h.focus(null); h.tick(); assert.equal(h.host.collapsed, true);
});
test("held mouse buttons inhibit hover, release rearms it", () => {
  const h = harness(); h.move(3, 400, { buttons: 1 }); h.tick(); assert.equal(h.host.toggleCalls, 0);
  h.doc.fire("pointerup", { clientX: 3, clientY: 400, buttons: 0 }); h.tick(); opened(h);
});
test("touch input never summons", () => {
  const h = harness(); h.move(3, 400, { pointerType: "touch" }); h.tick(); assert.equal(h.host.toggleCalls, 0);
});
test("dragging suspends collapse and releases its animation", () => {
  const h = harness(); hover(h); assert.equal(h.api.anim().on, true); h.drag(true);
  assert.equal(h.api.anim().on, false); h.move(900); h.tick(1000); opened(h);
  h.drag(false); h.tick(); assert.equal(h.host.collapsed, true);
});
test("disabled at startup still has a working reenable control", () => {
  const h = harness({ stored: '{"enabled":false}' }); assert.equal(h.api.state().running, false);
  assert.equal(h.listeners(), 0); h.api.setEnabled(true); hover(h);
});
test("disabling cancels pending work and removes every listener/observer", () => {
  const h = harness(); h.move(3); h.tick(40); h.api.setEnabled(false);
  assert.equal(h.listeners(), 0); assert.equal(h.observerCount(), 0);
  h.tick(3000); h.move(3); h.tick(); assert.equal(h.host.toggleCalls, 0);
});
test("disabled plugin does not animate host actions", () => {
  const h = harness(); h.api.setEnabled(false); h.manual(); assert.equal(h.host.animationRuns.length, 0);
});
test("repeated enable/disable creates one live instance", () => {
  const h = harness(); const count = h.listeners();
  for (let i = 0; i < 5; i++) { h.api.setEnabled(false); h.api.setEnabled(true); }
  assert.equal(h.listeners(), count); assert.equal(h.win.__dshHoverSidebarLive, 1); hover(h); assert.equal(h.host.toggleCalls, 1);
});
test("stop and effect disposal are idempotent and cancel rAF", () => {
  const h = harness(); const api = h.api; h.move(3); api.stop(); api.stop(); h.effects[0](); h.tick(3000);
  assert.equal(h.host.toggleCalls, 0); assert.equal(h.listeners(), 0); assert.equal(h.observerCount(), 0);
  assert.equal(h.api, undefined); assert.equal(h.win.__dshHoverSidebarLive, 0);
});
test("failed effect registration cleans a partially mounted instance", () => {
  const h = harness({ throwEffect: true }); h.move(3); h.tick(); assert.equal(h.listeners(), 0); assert.equal(h.api, undefined);
});
test("fallback lifecycle disposes correctly", () => {
  const h = harness({ noEffect: true }); hover(h); h.effects[0](); assert.equal(h.listeners(), 0);
});
test("unknown lifecycle installs no listeners", () => { const h = harness({ noLifecycle: true }); assert.equal(h.listeners(), 0); });
test("hot replacement disposes its predecessor; late old cleanup cannot stop the new one", () => {
  const h = harness(); const old = h.api; h.remount(); assert.equal(old.state().running, false);
  h.effects[0](); assert.equal(h.win.__dshHoverSidebarLive, 1); hover(h); assert.equal(h.host.toggleCalls, 1);
});
test("missing host toggle fails closed with no guessed button click", () => {
  const h = harness({ noApi: true }); assert.equal(h.api.state().status, "unsupported-layout-api"); assert.equal(h.listeners(), 0);
});
test("missing layout waits, then discovers a late mount", () => {
  const h = harness({ available: false }); assert.equal(h.api.state().status, "waiting-for-layout");
  h.move(3); h.tick(); assert.equal(h.host.toggleCalls, 0); h.host.available = true; h.tree(); h.tick(); opened(h);
});
test("frame replacement reconnects observation and retains manual-open safety", () => {
  const h = harness(); h.replace(); hover(h); h.replace(); h.move(900); h.tick(); assert.equal(h.host.collapsed, false);
  assert.equal(h.api.state().pinned, true);
});
test("own animation restores previous inline styles and priorities", () => {
  const h = harness(); h.host.frame.style.setProperty("will-change", "opacity", "important");
  hover(h); h.tick(); assert.equal(h.host.frame.style.getPropertyValue("will-change"), "opacity");
  assert.equal(h.host.frame.style.getPropertyPriority("will-change"), "important");
  assert.equal(h.host.frame.style.getPropertyValue("transition-property"), "");
});
test("cleanup preserves a new inline value written by the host", () => {
  const h = harness(); hover(h); h.host.frame.style.setProperty("will-change", "transform"); h.tick();
  assert.equal(h.host.frame.style.getPropertyValue("will-change"), "transform");
});
test("partial style failure is cleaned up and does not block the toggle", () => {
  const h = harness(); h.host.failStyle = "transition-duration"; hover(h);
  assert.equal(h.host.frame.style.getPropertyValue("transition-property"), "");
});
test("host toggle uses WAAPI and dragging cancels it", () => {
  const h = harness(); h.manual(); assert.equal(h.api.anim().waapi, true); assert.equal(h.api.anim().last.via, "waapi");
  h.drag(true); assert.equal(h.api.anim().waapi, false); assert.equal(h.host.animationRuns[0].cancelled, true);
});
test("reduced-motion suppresses both animation paths", () => {
  const h = harness({ reducedMotion: true }); hover(h); assert.equal(h.api.anim().on, false);
  h.manual(); assert.equal(h.host.animationRuns.length, 0);
});
test("changing reduced-motion cancels an in-flight animation", () => {
  const h = harness(); hover(h); h.media.matches = true; h.media.fire("change"); assert.equal(h.api.anim().on, false);
});
test("settings are bounded, allowlisted, and reject invalid types/easing", () => {
  const h = harness(); const o = h.api.configure({ hotzonePx: 9999, leaveDelayMs: -10, enabled: "false", smooth: 0,
    animMs: Infinity, easing: "cubic-bezier(2,0,1,1)", unknown: "ignored", __proto__: { polluted: true } });
  assert.equal(o.hotzonePx, 48); assert.equal(o.leaveDelayMs, 0); assert.equal(o.enabled, true); assert.equal(o.smooth, true);
  assert.equal(o.animMs, 260); assert.equal(o.easing, "cubic-bezier(.22,1,.36,1)"); assert.equal(o.unknown, undefined);
  assert.equal({}.polluted, undefined); assert.equal(h.values.get("dsh-hover-sidebar").includes("unknown"), false);
});
test("malformed and oversized saved settings are ignored", () => {
  for (const stored of ["{bad", "[]", "null", '"bad"', " ".repeat(5000)]) assert.equal(harness({ stored }).api.options().enabled, true);
});
test("blocked storage still applies settings in memory and resets", () => {
  const h = harness(); h.host.storageBlocked = true;
  h.api.configure({ hotzonePx: 30 }); assert.equal(h.api.options().hotzonePx, 30);
  h.api.configure({}); assert.equal(h.api.options().hotzonePx, 12);
});
test("zero leave delay is respected", () => {
  const h = harness(); h.api.configure({ leaveDelayMs: 0 }); hover(h); h.move(900); h.tick(20); assert.equal(h.host.collapsed, true);
});
test("unconfirmed host toggle times out instead of staying stuck", () => {
  const h = harness({ silentToggle: true }); h.move(3); h.tick(1800);
  assert.equal(h.api.state().expected, null); assert.equal(h.api.state().status, "toggle-unconfirmed"); assert.equal(h.host.toggleCalls, 1);
});
test("throwing host toggle is contained", () => {
  const h = harness({ throwToggle: true }); h.move(3); h.tick(1800);
  assert.equal(h.api.state().status, "toggle-failed"); assert.equal(h.api.state().expected, null); assert.equal(h.host.toggleCalls, 1);
});
test("leaving during opening closes after commit without another mouse move", () => {
  const h = harness(); h.move(3); h.tick(140); h.host.visualWidth = 0; h.move(900); h.tick(1000); assert.equal(h.host.collapsed, true);
});
test("Escape dismisses hover panels without reopening under the resting cursor", () => {
  const h = harness(); hover(h); h.doc.fire("keydown", { key: "Escape" }); h.tick(1000); assert.equal(h.host.collapsed, true);
  h.move(600); h.tick(20); hover(h);
});
test("hidden document closes even with an input focused", () => {
  const h = harness(); hover(h); h.focus(h.host.input); h.doc.visibilityState = "hidden"; h.doc.fire("visibilitychange");
  h.tick(1000); assert.equal(h.host.collapsed, true);
});
test("portaled sidebar menu is protected until it closes", () => {
  const h = harness(); hover(h); h.doc.fire("pointerdown", { clientX: 100, clientY: 400, target: h.host.button, buttons: 1 });
  h.host.popup = true; h.move(900); h.tick(1000); opened(h);
  h.host.popup = false; h.tree(); h.tick(); assert.equal(h.host.collapsed, true);
});
test("modal blocks hover opening and dismissal rearms a resting pointer", () => {
  const h = harness(); h.host.modal = true; h.move(3); h.tick(); assert.equal(h.host.toggleCalls, 0);
  h.host.modal = false; h.tree(); h.tick(); opened(h);
});
test("resize re-evaluates the pointer without mouse movement", () => {
  const h = harness(); hover(h); h.move(250); h.tick(30); h.host.left = 500; h.resize(); h.tick(); assert.equal(h.host.collapsed, true);
});
test("debug manual toggle behaves as an explicit pinned open", () => {
  const h = harness(); h.api.toggle(); h.tick(50); h.move(1000); h.tick(1000); assert.equal(h.api.state().pinned, true);
  assert.equal(h.host.collapsed, false);
});
