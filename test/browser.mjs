import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { launchBrowser, sleep } from "./cdp.mjs";

const assets = new Map([
  ["/", ["text/html", await readFile(new URL("fixture.html", import.meta.url))]],
  ["/client.js", ["text/javascript", await readFile(new URL("../client.js", import.meta.url))]],
]);
const server = createServer((req, res) => {
  const asset = assets.get(new URL(req.url, "http://localhost").pathname);
  if (req.method !== "GET" || !asset) { res.writeHead(404); res.end(); return; }
  res.setHeader("Content-Type", asset[0]); res.end(asset[1]);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let runtime, passed = 0;
const checks = [];
function check(condition, message, detail) {
  assert.ok(condition, `${message}${detail ? `: ${JSON.stringify(detail)}` : ""}`);
  checks.push(message); passed++; console.log(`PASS ${message}`);
}
try {
  runtime = await launchBrowser();
  const { page } = runtime;
  const ev = (s) => page.evaluate(s);
  const move = async (x, y = 400) => page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none" });
  const state = () => ev("__dshHoverSidebar.state()");
  const width = () => ev("document.querySelector('.fixture_sidebarCol').getBoundingClientRect().width");
  async function until(expr, timeout = 2500) {
    const end = Date.now() + timeout;
    while (Date.now() < end) { if (await ev(expr)) return; await sleep(20); }
    throw new Error(`Timed out: ${expr}; state=${JSON.stringify(await state())}`);
  }
  async function reset(shell = "desktop") {
    await move(900);
    await page.send("Page.navigate", { url: `${origin}/?shell=${shell}` });
    await until("!!window.__dshHoverSidebar");
    await ev("__dshHoverSidebar.configure({})");
    await until("__dshHoverSidebar.state().running");
    await move(900); await sleep(80);
  }
  async function sample(action, duration = 650) {
    return ev(`new Promise(resolve => {
      const values = [], start = performance.now();
      const read = () => document.querySelector('.fixture_sidebarCol').getBoundingClientRect().width;
      values.push(read()); ${action};
      function step() { values.push(read()); if (performance.now()-start < ${duration}) requestAnimationFrame(step); else resolve(values); }
      requestAnimationFrame(step);
    })`);
  }
  function intermediate(samples, from, to) { return samples.filter((v) => v > Math.min(from, to) + 1 && v < Math.max(from, to) - 1); }
  for (const shell of ["desktop", "web"]) {
    await reset(shell);
    const rail = shell === "web" ? 56 : 0;
    check(Math.abs(await width() - rail) < 1, `${shell}: correct collapsed track`);
    check((await ev("__dshHoverSidebarLive")) === 1, `${shell}: one live instance`);
    await move(shell === "web" ? 35 : 3);
    await until("__dshHoverSidebar.state().hoverOpened");
    await sleep(380);
    check(Math.abs(await width() - 280) < 1, `${shell}: hover opens`);
    check(!(await state()).pinned, `${shell}: hover remains unpinned`);
    await move(150); await sleep(450);
    check(!(await state()).collapsed, `${shell}: remains open inside`);
    await move(900); await until("__dshHoverSidebar.state().collapsed"); await sleep(300);
    check(Math.abs(await width() - rail) < 1, `${shell}: moving away hides`);
    await ev("fixture.toggle()"); await sleep(380); await move(1100); await sleep(600);
    check((await state()).pinned && !(await state()).collapsed, `${shell}: manual open stays pinned`);
    await ev("fixture.toggle()"); await sleep(300);
    const own = await sample("document.dispatchEvent(new PointerEvent('pointermove',{clientX:3,clientY:400,pointerType:'mouse',bubbles:true}))");
    check(intermediate(own, rail, 280).length >= 3, `${shell}: own opening has real intermediate frames`, own);
    await sleep(150);
    check((await ev("document.getElementById('frame').style.getPropertyValue('transition-property')")) === "", `${shell}: transition cleanup`);
    const committed = await sample("fixture.toggle()", 450);
    check(intermediate(committed, 280, rail).length >= 3, `${shell}: manual closing has real WAAPI frames`, committed);
    check((await ev("document.getElementById('frame').getAnimations().length")) === 0, `${shell}: WAAPI cleanup`);
  }
  await reset();
  await move(3); await sleep(40); await move(900); await sleep(250);
  check((await state()).collapsed, "crossing edge is ignored");
  await move(3); await sleep(45);
  await move(-25); await sleep(180);
  await move(4); await until("__dshHoverSidebar.state().hoverOpened");
  check(!(await state()).collapsed, "leaving during intent and reentering rearms");
  await move(-25);
  await until("__dshHoverSidebar.state().collapsed");
  check((await state()).collapsed, "window exit closes with stationary last coordinates");

  await reset(); await move(3); await until("__dshHoverSidebar.state().hoverOpened"); await sleep(320);
  await ev("document.getElementById('search').focus()"); await move(900); await sleep(500);
  check(!(await state()).collapsed, "input focus protects editing", await ev("({state:__dshHoverSidebar.state(),active:document.activeElement?.id,visible:document.visibilityState,focus:document.hasFocus()})"));
  await ev("document.getElementById('search').blur()"); await until("__dshHoverSidebar.state().collapsed");
  check((await state()).collapsed, "focusout closes without a new pointer event");

  await reset(); await move(3); await sleep(40); await ev("__dshHoverSidebar.setEnabled(false)"); await sleep(450);
  check((await state()).status === "disabled" && (await ev("__dshHoverSidebarLive")) === 0, "disable cancels work and deactivates");
  check((await ev("fixture.calls")) === 0, "disabled pending intent never toggles");
  await ev("__dshHoverSidebar.setEnabled(true)"); await move(900); await sleep(50); await move(4); await until("__dshHoverSidebar.state().hoverOpened");
  check((await ev("__dshHoverSidebarLive")) === 1, "reenable starts one instance");
  const style = await ev("document.getElementById('frame').style.getPropertyValue('transition-timing-function')");
  await ev("__dshHoverSidebar.setEnabled(false)");
  check((await ev("document.getElementById('frame').style.getPropertyValue('transition-timing-function')")) === "", "normalized CSS easing is restored on disable", style);

  await reset(); await move(3); await sleep(35); await ev("fixture.mount()"); await sleep(400);
  check((await ev("__dshHoverSidebarLive")) === 1, "hot reload retains one instance");
  await move(900); await sleep(350); await move(3); await until("__dshHoverSidebar.state().hoverOpened");
  await ev("fixture.effects[0]()");
  check((await state()).running, "old disposal does not stop new instance");

  await reset(); await ev("fixture.build()"); await sleep(60); await move(3); await until("__dshHoverSidebar.state().hoverOpened");
  check(!(await state()).collapsed, "replaced DOM frame is rediscovered");

  await reset(); await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await move(3); await until("__dshHoverSidebar.state().hoverOpened");
  check(!(await ev("__dshHoverSidebar.anim().on")), "system reduced-motion disables own animation");
  await ev("fixture.toggle()"); await sleep(60);
  check(!(await ev("__dshHoverSidebar.anim().waapi")), "system reduced-motion disables host animation");
  await page.send("Emulation.setEmulatedMedia", { features: [] });

  await reset("web"); await move(35); await until("__dshHoverSidebar.state().hoverOpened"); await sleep(350);
  const artifacts = new URL("../artifacts/", import.meta.url); await mkdir(artifacts, { recursive: true });
  const shot = await page.send("Page.captureScreenshot", { format: "png" });
  await writeFile(new URL("browser-fixture.png", artifacts), Buffer.from(shot.data, "base64"));
  await writeFile(new URL("browser-results.json", artifacts), JSON.stringify({ passed, browser: await runtime.browser.send("Browser.getVersion"), checks }, null, 2) + "\n");
  console.log(`Browser checks: ${passed}/${passed} passed`);
} finally {
  await runtime?.close();
  await new Promise((resolve) => server.close(resolve));
}
