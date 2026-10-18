import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../client.js", import.meta.url), "utf8");

class Clock {
  time = 0; id = 0; tasks = new Map();
  set = (fn, ms = 0) => { const id = ++this.id; this.tasks.set(id, { fn, time: this.time + Math.max(0, ms) }); return id; };
  clear = (id) => this.tasks.delete(id);
  tick(ms) {
    const end = this.time + ms;
    let runs = 0;
    while (true) {
      const next = [...this.tasks].sort((a, b) => a[1].time - b[1].time || a[0] - b[0])[0];
      if (!next || next[1].time > end) break;
      if (++runs > 10000) throw new Error("Timer/observer loop");
      this.tasks.delete(next[0]); this.time = next[1].time; next[1].fn();
    }
    this.time = end;
  }
}
class Events {
  listeners = new Map();
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  fire(type, values = {}) { const e = { type, target: this, ...values }; for (const fn of [...(this.listeners.get(type) || [])]) fn(e); }
  count() { return [...this.listeners.values()].reduce((n, set) => n + set.size, 0); }
}

export function harness(opts = {}) {
  const clock = new Clock(), doc = new Events(), root = new Events(), win = new Events();
  const media = Object.assign(new Events(), { matches: !!opts.reducedMotion });
  const observers = new Set(), sizes = new Set(), values = new Map();
  if (opts.stored !== undefined) values.set("dsh-hover-sidebar", opts.stored);
  const host = {
    collapsed: opts.collapsed ?? true, rail: opts.rail ?? 0, top: 32, left: 0,
    available: opts.available ?? true, toggleCalls: 0, visualWidth: null,
    storageBlocked: false, modal: false, popup: false, failStyle: null, animationRuns: [],
  };
  function notify(target, type) {
    for (const o of observers) {
      if (o.target !== target || (type === "attributes" && !o.options.attributes)) continue;
      if (o.pending) continue;
      o.pending = true;
      clock.set(() => { o.pending = false; if (observers.has(o)) o.cb([]); });
    }
  }
  function node(kind, onChange = () => {}) {
    const e = Object.assign(new Events(), {
      nodeType: 1, isConnected: true, parentElement: null, kind, classList: [],
      attrs: new Set(), children: [], offsetWidth: 1400,
      hasAttribute(k) { return this.attrs.has(k); },
      setAttribute(k) { this.attrs.add(k); notify(this, "attributes"); },
      removeAttribute(k) { this.attrs.delete(k); notify(this, "attributes"); },
      contains(child) { return child === this || this.children.some((c) => c.contains(child)); },
      matches() { return this.kind === "input"; },
      getBoundingClientRect() { return { left: 0, top: 0, width: 1400, height: 900, right: 1400, bottom: 900 }; },
    });
    const props = new Map(), priorities = new Map();
    e.style = {
      setProperty(k, v, priority = "") {
        if (host.failStyle === k) throw new Error("style failure");
        const old = props.get(k); props.set(k, String(v)); priorities.set(k, priority);
        if (old !== String(v)) onChange();
      },
      removeProperty(k) { const had = props.delete(k); priorities.delete(k); if (had) onChange(); },
      getPropertyValue(k) { return props.get(k) || ""; },
      getPropertyPriority(k) { return priorities.get(k) || ""; },
      get gridTemplateColumns() { return props.get("grid-template-columns") || ""; },
      set gridTemplateColumns(v) { this.setProperty("grid-template-columns", v); },
      all() { return Object.fromEntries(props); },
    };
    return e;
  }
  function makeLayout() {
    const f = node("frame", () => notify(f, "attributes")), c = node("sidebar");
    c.classList = ["NewHash_sidebarCol"]; c.parentElement = f; f.children.push(c);
    const button = node("button"), input = node("input");
    button.parentElement = input.parentElement = c; c.children.push(button, input);
    c.getBoundingClientRect = () => {
      const width = host.visualWidth ?? (host.collapsed ? host.rail : 280);
      return { left: host.left, top: host.top, width, height: 900 - host.top, right: host.left + width, bottom: 900 };
    };
    f.animate = (keyframes, timing) => {
      const a = { keyframes, timing, onfinish: null, oncancel: null, cancelled: false,
        cancel() { this.cancelled = true; clock.clear(timer); this.oncancel?.(); } };
      const timer = clock.set(() => a.onfinish?.(), timing.duration);
      host.animationRuns.push(a); return a;
    };
    return { frame: f, col: c, button, input };
  }
  Object.assign(host, makeLayout());
  function render() {
    if (host.collapsed) host.frame.attrs.add("data-sidebar-collapsed"); else host.frame.attrs.delete("data-sidebar-collapsed");
    host.frame.style.gridTemplateColumns = `${host.collapsed ? host.rail : 280}px minmax(0px, 1fr) minmax(0px, 0px)`;
    notify(host.frame, "attributes");
  }
  render();
  Object.assign(doc, {
    documentElement: root, activeElement: null, visibilityState: "visible",
    querySelectorAll() { return host.available ? [host.col] : []; },
    querySelector(s) { return s.includes("aria-modal") ? (host.modal ? {} : null) : (host.popup ? {} : null); },
  });
  const storage = {
    getItem(k) { if (host.storageBlocked) throw new Error("storage unavailable"); return values.get(k) ?? null; },
    setItem(k, v) { if (host.storageBlocked) throw new Error("storage unavailable"); values.set(k, v); },
    removeItem(k) { if (host.storageBlocked) throw new Error("storage unavailable"); values.delete(k); },
  };
  let module;
  Object.assign(win, {
    __ModuleLoader__: { load(m) { module = m.factory(); } },
    setTimeout: clock.set, clearTimeout: clock.clear,
    requestAnimationFrame: (fn) => clock.set(fn, 16), cancelAnimationFrame: clock.clear,
    getComputedStyle: (e) => ({ display: "grid", gridTemplateColumns: e.style.gridTemplateColumns }),
    matchMedia: () => media, localStorage: storage,
  });
  class Mutation {
    constructor(cb) { this.cb = cb; }
    observe(target, options) { this.target = target; this.options = options; observers.add(this); }
    disconnect() { observers.delete(this); }
  }
  class Resize { constructor(cb) { this.cb = cb; } observe() { sizes.add(this); } disconnect() { sizes.delete(this); } }
  const sandbox = { window: win, document: doc, MutationObserver: Mutation, ResizeObserver: Resize,
    console: { warn() {} }, };
  vm.runInNewContext(source, sandbox, { filename: "client.js" });
  const effects = [];
  const ctx = {
    layout: opts.noApi ? {} : { toggleSidebar() {
      host.toggleCalls++;
      if (opts.throwToggle) throw new Error("host changed");
      if (opts.silentToggle) return;
      host.collapsed = !host.collapsed; render();
    } },
    effect(fn) { const off = fn(); effects.push(off); if (opts.throwEffect) throw new Error("effect rejected"); },
    on(_name, fn) { effects.push(fn); },
  };
  if (opts.noEffect) delete ctx.effect;
  if (opts.noLifecycle) { delete ctx.effect; delete ctx.on; }
  function mount() { module.apply(ctx, opts.config); }
  mount();
  const h = {
    host, win, doc, root, media, values, effects, clock, module, ctx,
    get api() { return win.__dshHoverSidebar; },
    tick: (ms = 500) => clock.tick(ms),
    move(x, y = 400, extra = {}) { doc.fire("pointermove", { clientX: x, clientY: y, pointerType: "mouse", ...extra }); },
    leave() { root.fire("pointerleave"); },
    manual() { host.collapsed = !host.collapsed; render(); clock.tick(20); },
    focus(target) { doc.activeElement = target; doc.fire("focusout"); doc.fire("focusin"); },
    tree() { notify(root, "childList"); },
    remount: mount,
    replace() {
      host.frame.isConnected = host.col.isConnected = false;
      Object.assign(host, makeLayout()); render(); h.tree(); clock.tick(32);
    },
    drag(value) { if (value) host.frame.setAttribute("data-dragging"); else host.frame.removeAttribute("data-dragging"); clock.tick(20); },
    resize() { for (const o of sizes) o.cb(); clock.tick(20); },
    listeners() { return doc.count() + root.count() + win.count() + media.count() + host.frame.count(); },
    observerCount: () => observers.size + sizes.size,
  };
  return h;
}
