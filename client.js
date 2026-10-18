/* dsh-hover-sidebar - MIT. No network, filesystem or runtime dependencies. */
(() => {
  const loader = globalThis.window?.__ModuleLoader__;
  if (typeof loader?.load !== "function") return;
  loader.load({
    id: "dsh-hover-sidebar",
    factory() {
      const inject = ["layout"];
      const SETTINGS_KEY = "dsh-hover-sidebar";
      const DEFAULTS = Object.freeze({
        enabled: true, hotzonePx: 12, keepOpenMarginPx: 24,
        openDelayMs: 120, leaveDelayMs: 300, railMaxPx: 100,
        animMs: 260, closeAnimMs: 200,
        easing: "cubic-bezier(.22,1,.36,1)",
        closeEasing: "cubic-bezier(.4,0,.2,1)", smooth: true,
      });
      const LIMITS = {
        hotzonePx: [1, 48], keepOpenMarginPx: [0, 80],
        openDelayMs: [0, 2000], leaveDelayMs: [0, 5000],
        railMaxPx: [48, 160], animMs: [0, 1200], closeAnimMs: [0, 1200],
      };
      const element = (v) => v?.nodeType === 1 && typeof v.getBoundingClientRect === "function";
      const record = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

      function validEasing(v) {
        if (typeof v !== "string" || v.length > 100) return false;
        if (/^(linear|ease|ease-in|ease-out|ease-in-out)$/.test(v)) return true;
        const m = /^cubic-bezier\(\s*(-?(?:\d+\.?\d*|\.\d+))\s*,\s*(-?(?:\d+\.?\d*|\.\d+))\s*,\s*(-?(?:\d+\.?\d*|\.\d+))\s*,\s*(-?(?:\d+\.?\d*|\.\d+))\s*\)$/.exec(v);
        return !!m && Number(m[1]) >= 0 && Number(m[1]) <= 1 && Number(m[3]) >= 0 && Number(m[3]) <= 1;
      }

      function sanitize(input) {
        const out = {};
        if (!record(input)) return out;
        for (const key of Object.keys(DEFAULTS)) {
          if (!Object.hasOwn(input, key)) continue;
          const value = input[key];
          if (LIMITS[key] && typeof value === "number" && Number.isFinite(value)) {
            const [min, max] = LIMITS[key];
            out[key] = Math.min(max, Math.max(min, value));
          } else if ((key === "enabled" || key === "smooth") && typeof value === "boolean") out[key] = value;
          else if ((key === "easing" || key === "closeEasing") && validEasing(value)) out[key] = value;
        }
        return out;
      }

      function storedSettings() {
        try {
          const raw = window.localStorage.getItem(SETTINGS_KEY);
          return raw && raw.length <= 4096 ? sanitize(JSON.parse(raw)) : {};
        } catch { return {}; }
      }

      function apply(ctx, config) {
        const previous = window.__dshHoverSidebar;
        if (typeof previous?.stop === "function") previous.stop();
        const base = sanitize(config);
        let overrides = storedSettings();
        let options = { ...DEFAULTS, ...base, ...overrides };
        let running = false, disposed = false, status = "starting";
        let frame = null, column = null;
        let frameObserver = null, treeObserver = null, sizeObserver = null;
        const cleanups = [];
        let raf = 0, openTimer = 0, closeTimer = 0, expectedTimer = 0;
        let expected = null, expectedSource = null;
        let lastCollapsed = null, lastTemplate = "";
        let hoverOpened = false, pinned = false, inHot = false, suppressUntilLeave = false;
        let pointerKnown = false, lastX = -1, lastY = -1, buttons = 0, dragging = false;
        let inputMode = "pointer", sidebarInteraction = false;
        let transition = null, transitionTimer = 0, waapi = null, lastAnim = null;
        const reducedMotion = typeof window.matchMedia === "function"
          ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

        function clearTimer(kind) {
          if (kind === "open") { window.clearTimeout(openTimer); openTimer = 0; }
          if (kind === "close") { window.clearTimeout(closeTimer); closeTimer = 0; }
          if (kind === "expected") {
            window.clearTimeout(expectedTimer); expectedTimer = 0; expected = null; expectedSource = null;
          }
        }
        function listen(target, name, fn, opts = { capture: true, passive: true }) {
          target.addEventListener(name, fn, opts);
          cleanups.push(() => target.removeEventListener(name, fn, opts));
        }

        // Host DOM knowledge lives here. Hashes may change; suffixes and
        // explicit semantic markers are checked, never an arbitrary button.
        function findLayout() {
          if (element(frame) && frame.isConnected && element(column) && column.isConnected && column.parentElement === frame) return true;
          releaseAnimation();
          frameObserver?.disconnect(); sizeObserver?.disconnect();
          frame = column = null; lastCollapsed = null;
          hoverOpened = false; pinned = false; inHot = false;
          clearTimer("open"); clearTimer("close"); clearTimer("expected");
          for (const col of document.querySelectorAll('[data-dsh-sidebar-column], [data-sidebar-column], [class*="sidebarCol"]')) {
            const parent = col.parentElement;
            if (!element(parent) || !element(col) || !parent.isConnected) continue;
            const marked = col.hasAttribute("data-dsh-sidebar-column") || col.hasAttribute("data-sidebar-column");
            if (!marked && !Array.from(col.classList).some((c) => c === "sidebarCol" || c.endsWith("_sidebarCol"))) continue;
            if (window.getComputedStyle(parent).display !== "grid" || !parent.style.gridTemplateColumns) continue;
            frame = parent; column = col;
            break;
          }
          if (!frame) { status = "waiting-for-layout"; return false; }
          status = "active";
          lastCollapsed = collapsed(); pinned = !lastCollapsed;
          lastTemplate = frame.style.gridTemplateColumns;
          frameObserver = new MutationObserver(onFrameChange);
          frameObserver.observe(frame, { attributes: true, attributeFilter: ["data-sidebar-collapsed", "data-dragging", "style"] });
          if (typeof ResizeObserver === "function") {
            sizeObserver = new ResizeObserver(queue);
            sizeObserver.observe(frame); sizeObserver.observe(column);
          }
          return true;
        }
        function collapsed() { return frame ? frame.hasAttribute("data-sidebar-collapsed") : null; }
        function held() { return buttons !== 0 || dragging || !!frame?.hasAttribute("data-dragging"); }
        function visible() { return document.visibilityState !== "hidden"; }
        function modalOpen() { return !!document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]'); }
        function focusProtected() {
          const active = document.activeElement;
          return pointerKnown && element(active) && !!column?.contains(active)
            && (inputMode === "keyboard" || active.matches('input, textarea, select, [contenteditable="true"], [contenteditable=""]'));
        }
        function popupProtected() {
          return sidebarInteraction && !!document.querySelector('[role="menu"], [role="listbox"]');
        }
        function pointerInside() {
          if (!pointerKnown || !column) return false;
          const r = column.getBoundingClientRect();
          // The opening destination protects a pointer within the future panel,
          // without treating an entire narrow/hidden frame as "inside".
          const targetWidth = expected === "open" || (hoverOpened && (transition || waapi))
            ? Number.parseFloat(frame.style.gridTemplateColumns) || 0 : 0;
          const right = r.left + Math.max(r.width, targetWidth);
          return lastY >= r.top && lastY <= r.bottom && lastX >= r.left && lastX <= right + options.keepOpenMarginPx;
        }
        function hotAt() {
          if (!pointerKnown || !column || lastX < 0 || lastY < 0) return false;
          if (!collapsed()) return pointerInside();
          const r = column.getBoundingClientRect();
          if (r.height <= 0 || lastY < r.top || lastY > r.bottom) return false;
          const rail = r.width > 0 && r.width <= options.railMaxPx ? r.width : 0;
          return lastX >= r.left && lastX <= r.left + Math.max(options.hotzonePx, rail);
        }

        function releaseAnimation() {
          window.clearTimeout(transitionTimer); transitionTimer = 0;
          const animation = waapi; waapi = null;
          if (animation) {
            animation.onfinish = null; animation.oncancel = null;
            try { animation.cancel(); } catch { /* detached animation */ }
          }
          const owned = transition; transition = null;
          if (!owned) return;
          owned.frame.removeEventListener("transitionend", owned.finish);
          owned.frame.removeEventListener("transitioncancel", owned.finish);
          for (const [key, value] of Object.entries(owned.writes)) {
            if (owned.frame.style.getPropertyValue(key) !== value || owned.frame.style.getPropertyPriority(key)) continue;
            const before = owned.before[key];
            if (before.value) owned.frame.style.setProperty(key, before.value, before.priority);
            else owned.frame.style.removeProperty(key);
          }
        }
        function animateOwn(collapsing) {
          releaseAnimation();
          const ms = collapsing ? options.closeAnimMs : options.animMs;
          if (!options.smooth || reducedMotion?.matches || held() || ms <= 0 || !frame) return;
          const target = frame;
          const writes = {
            "transition-property": "grid-template-columns", "transition-duration": `${ms}ms`,
            "transition-timing-function": collapsing ? options.closeEasing : options.easing,
            "will-change": "grid-template-columns",
          };
          const before = Object.fromEntries(Object.keys(writes).map((key) => [key, {
            value: target.style.getPropertyValue(key), priority: target.style.getPropertyPriority(key),
          }]));
          const finish = (e) => {
            if (e && (e.target !== target || e.propertyName !== "grid-template-columns")) return;
            if (transition?.frame !== target) return;
            releaseAnimation(); queue();
          };
          // Own the frame before the first write, including partial failures.
          transition = { frame: target, before, writes, finish };
          try {
            for (const [key, value] of Object.entries(writes)) {
              target.style.setProperty(key, value);
              writes[key] = target.style.getPropertyValue(key);
            }
            void target.offsetWidth;
            target.addEventListener("transitionend", finish);
            target.addEventListener("transitioncancel", finish);
            transitionTimer = window.setTimeout(() => finish(), ms + 100);
            lastAnim = { source: "own", ms, collapsing };
          } catch { releaseAnimation(); }
        }
        function animateCommitted(from, collapsing) {
          const current = transition || waapi ? window.getComputedStyle(frame).gridTemplateColumns : from;
          releaseAnimation();
          const ms = collapsing ? options.closeAnimMs : options.animMs;
          const to = frame?.style.gridTemplateColumns;
          if (!options.smooth || reducedMotion?.matches || held() || ms <= 0 || !current || current === to || typeof frame?.animate !== "function") return;
          try {
            // After-commit CSS transitions are cancelled in the same recalc.
            const animation = frame.animate([{ gridTemplateColumns: current }, { gridTemplateColumns: to }], {
              duration: ms, easing: collapsing ? options.closeEasing : options.easing, fill: "none",
            });
            waapi = animation;
            const finish = () => { if (waapi === animation) { waapi = null; queue(); } };
            animation.onfinish = finish; animation.oncancel = finish;
            lastAnim = { source: "committed", via: "waapi", ms, collapsing, from: current, to };
          } catch { /* Animation support is optional. */ }
        }

        function requestToggle(to, source) {
          if (!running || !frame || expected !== null || (to === "collapsed") === collapsed()) return false;
          const wasHover = hoverOpened;
          expected = to; expectedSource = source;
          hoverOpened = source === "hover" || (to === "open" && wasHover);
          if (to === "open") suppressUntilLeave = true;
          animateOwn(to === "collapsed");
          try { ctx.layout.toggleSidebar(); }
          catch {
            clearTimer("expected"); releaseAnimation(); hoverOpened = false;
            status = "toggle-failed";
            return false;
          }
          expectedTimer = window.setTimeout(() => {
            if (!running || expected === null) return;
            onFrameChange();
            if (expected !== null) {
              clearTimer("expected"); releaseAnimation(); hoverOpened = false;
              status = "toggle-unconfirmed";
            }
          }, 1200);
          queue();
          return true;
        }
        function onFrameChange() {
          if (!running || !frame?.isConnected) { queue(); return; }
          if (frame.hasAttribute("data-dragging")) {
            clearTimer("open"); clearTimer("close"); releaseAnimation();
          }
          const now = collapsed(), target = frame.style.gridTemplateColumns;
          if (now !== lastCollapsed) {
            const ours = expected !== null && (expected === "collapsed") === now;
            const source = expectedSource;
            if (!ours) animateCommitted(lastTemplate, now);
            clearTimer("expected"); clearTimer("open"); clearTimer("close");
            if (ours) {
              hoverOpened = !now && hoverOpened;
              pinned = source === "manual" && !now;
              if (source === "manual" && now) suppressUntilLeave = hotAt();
            } else {
              hoverOpened = false; pinned = !now;
              suppressUntilLeave = now && hotAt();
            }
            lastCollapsed = now; inHot = hotAt(); status = "active";
          }
          lastTemplate = target;
          queue();
        }
        function scheduleClose() {
          if (closeTimer || !hoverOpened || pinned || expected !== null) return;
          closeTimer = window.setTimeout(() => {
            closeTimer = 0;
            if (!running || !options.enabled || held() || !hoverOpened || pinned || expected !== null) return;
            if (visible() && (pointerInside() || focusProtected() || popupProtected() || modalOpen())) return;
            requestToggle("collapsed", "leave");
          }, options.leaveDelayMs);
        }
        function processPointer() {
          if (!running || !findLayout()) return;
          if (!visible()) { clearTimer("open"); scheduleClose(); return; }
          if (held()) { clearTimer("open"); clearTimer("close"); return; }
          const hot = hotAt(); inHot = hot;
          if (!hot) { suppressUntilLeave = false; clearTimer("open"); }
          if (collapsed() && hot && !suppressUntilLeave && expected === null && !pinned && !modalOpen() && !openTimer) {
            openTimer = window.setTimeout(() => {
              openTimer = 0;
              if (!running || !visible() || held() || suppressUntilLeave || pinned || expected !== null || !hotAt() || !collapsed() || modalOpen()) return;
              requestToggle("open", "hover");
            }, options.openDelayMs);
          }
          if (hoverOpened && !pinned) {
            if (pointerInside() || focusProtected() || popupProtected() || modalOpen()) clearTimer("close");
            else scheduleClose();
          }
        }
        function queue() {
          if (!running || raf) return;
          raf = window.requestAnimationFrame(() => { raf = 0; if (running) processPointer(); });
        }
        function onPointer(e) {
          if (e.pointerType === "touch" || !Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) return;
          pointerKnown = true; lastX = e.clientX; lastY = e.clientY; buttons = e.buttons || 0;
          if (e.type === "pointerdown") {
            inputMode = "pointer"; sidebarInteraction = !!column?.contains(e.target);
            clearTimer("open"); clearTimer("close");
          }
          queue();
        }
        function leaveWindow() {
          // Reset while collapsed too: cancelled intent must re-arm on re-entry.
          pointerKnown = false; lastX = lastY = -1; buttons = 0;
          inHot = false; suppressUntilLeave = false; dragging = false; sidebarInteraction = false;
          clearTimer("open"); clearTimer("close"); scheduleClose();
        }

        function deactivate() {
          if (!running) return;
          running = false; window.__dshHoverSidebarLive = 0;
          for (const off of cleanups.splice(0).reverse()) off();
          treeObserver?.disconnect(); treeObserver = null;
          frameObserver?.disconnect(); frameObserver = null;
          sizeObserver?.disconnect(); sizeObserver = null;
          if (raf) window.cancelAnimationFrame(raf);
          raf = 0;
          clearTimer("open"); clearTimer("close"); clearTimer("expected"); releaseAnimation();
          frame = column = null; pointerKnown = false; hoverOpened = false; pinned = false;
          inHot = false; suppressUntilLeave = false; buttons = 0; dragging = false; sidebarInteraction = false;
        }
        function activate() {
          if (running || disposed || !options.enabled) return;
          if (typeof ctx?.layout?.toggleSidebar !== "function") { status = "unsupported-layout-api"; return; }
          running = true; window.__dshHoverSidebarLive = 1;
          for (const name of ["pointermove", "pointerover", "pointerdown", "pointerup"]) listen(document, name, onPointer);
          listen(document.documentElement, "pointerenter", onPointer);
          listen(document.documentElement, "pointerleave", leaveWindow);
          listen(document, "pointercancel", leaveWindow);
          listen(window, "blur", leaveWindow); listen(window, "pagehide", leaveWindow);
          listen(window, "resize", queue);
          listen(document, "visibilitychange", () => { if (!visible()) leaveWindow(); else queue(); });
          listen(document, "focusin", queue); listen(document, "focusout", queue);
          listen(document, "keydown", (e) => {
            inputMode = "keyboard";
            if (e.key === "Escape" && hoverOpened && !pinned && !modalOpen() && !popupProtected()) {
              clearTimer("open"); clearTimer("close"); suppressUntilLeave = hotAt();
              requestToggle("collapsed", "escape");
            }
            queue();
          });
          listen(document, "dragstart", () => { dragging = true; clearTimer("open"); clearTimer("close"); releaseAnimation(); });
          listen(document, "dragend", () => { dragging = false; queue(); });
          if (typeof reducedMotion?.addEventListener === "function") listen(reducedMotion, "change", () => { releaseAnimation(); queue(); });
          treeObserver = new MutationObserver(() => {
            if (!frame?.isConnected || !column?.isConnected || column.parentElement !== frame || sidebarInteraction || (inHot && collapsed())) queue();
          });
          treeObserver.observe(document.documentElement, { childList: true, subtree: true });
          findLayout();
        }
        function configure(next) {
          if (disposed) return { ...options };
          overrides = record(next) && Object.keys(next).length ? { ...overrides, ...sanitize(next) } : {};
          options = { ...DEFAULTS, ...base, ...overrides };
          try {
            if (Object.keys(overrides).length) window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(overrides));
            else window.localStorage.removeItem(SETTINGS_KEY);
          } catch { /* Apply in memory even when browser storage is unavailable. */ }
          clearTimer("open"); clearTimer("close"); releaseAnimation();
          if (!options.enabled) { deactivate(); status = "disabled"; }
          else { activate(); queue(); }
          return { ...options };
        }
        function stop() {
          if (disposed) return;
          deactivate(); disposed = true; status = "disposed";
          if (window.__dshHoverSidebar === api) delete window.__dshHoverSidebar;
        }
        const api = {
          version: "0.2.0",
          state: () => ({ status, collapsed: collapsed(), hoverOpened, pinned, inHot, suppressUntilLeave,
            expected, openPending: !!openTimer, closePending: !!closeTimer, running }),
          options: () => ({ ...options }),
          anim: () => ({ on: !!transition, waapi: !!waapi, last: lastAnim ? { ...lastAnim } : null }),
          configure, setEnabled: (enabled) => configure({ enabled }),
          toggle: () => {
            if (!running || !findLayout()) return false;
            hoverOpened = false;
            return requestToggle(collapsed() ? "open" : "collapsed", "manual");
          },
          stop,
        };
        function mount() {
          window.__dshHoverSidebar = api; window.__dshHoverSidebarLive = 0;
          if (options.enabled) activate(); else status = "disabled";
          return stop;
        }
        if (typeof ctx?.effect === "function") {
          try { ctx.effect(mount, "hover-sidebar:lifecycle"); }
          catch { stop(); console.warn("[hover-sidebar] lifecycle unavailable; enhancement disabled"); }
        } else if (typeof ctx?.on === "function") { mount(); ctx.on("dispose", stop); }
        else status = "unsupported-lifecycle";
      }
      return { inject, apply };
    },
  });
})();
