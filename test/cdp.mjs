import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export class Cdp {
  id = 0; pending = new Map();
  constructor(ws) {
    this.ws = ws;
    ws.addEventListener("message", (e) => {
      const msg = JSON.parse(e.data), job = this.pending.get(msg.id);
      if (!job) return;
      this.pending.delete(msg.id); clearTimeout(job.timer);
      if (msg.error) job.reject(new Error(`${job.method}: ${msg.error.message}`)); else job.resolve(msg.result);
    });
    ws.addEventListener("close", () => {
      for (const job of this.pending.values()) { clearTimeout(job.timer); job.reject(new Error("CDP disconnected")); }
      this.pending.clear();
    });
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { ws.close(); reject(new Error("CDP connect timeout")); }, 10000);
      ws.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
      ws.addEventListener("error", (e) => { clearTimeout(timer); reject(new Error(`CDP connection failed (${new URL(url).host}): ${e.error?.message || e.message || "socket error"}`)); }, { once: true });
    });
    return new Cdp(ws);
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
      this.pending.set(id, { resolve, reject, timer, method });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  }
  close() { this.ws.close(); }
}

export async function launchBrowser() {
  const binary = [process.env.BROWSER_BIN,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].find((p) => p && existsSync(p));
  if (!binary) throw new Error("Chromium not found. Set BROWSER_BIN to a Chrome/Edge executable.");
  const directory = await mkdtemp(join(tmpdir(), "dsh-hover-test-"));
  async function removeProfile() {
    const target = resolve(directory);
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith("dsh-hover-test-")) throw new Error("Refusing to remove an unexpected test directory");
    await rm(target, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  }
  const child = spawn(binary, ["--headless=new", "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0",
    `--user-data-dir=${directory}`, "--no-first-run", "--no-default-browser-check", "about:blank"],
  { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  let browser;
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let stderr = "";
      const timer = setTimeout(() => reject(new Error("Browser startup timeout")), 20000);
      child.once("error", (e) => { clearTimeout(timer); reject(e); });
      child.once("exit", () => { clearTimeout(timer); reject(new Error("Browser exited before becoming ready")); });
      child.stderr.on("data", (data) => {
        stderr = (stderr + data).slice(-8192);
        const match = /DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/\S+)/.exec(stderr);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    browser = await Cdp.connect(endpoint);
    const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
    const port = new URL(endpoint).port;
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const tab = targets.find((t) => t.id === targetId);
    const page = await Cdp.connect(tab.webSocketDebuggerUrl);
    await page.send("Runtime.enable"); await page.send("Page.enable"); await page.send("Page.bringToFront");
    await page.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await page.send("Emulation.setFocusEmulationEnabled", { enabled: true });
    let closed = false;
    return { page, browser, async close() {
      if (closed) return; closed = true;
      page.close();
      try { await browser.send("Browser.close"); } catch { /* already closed */ }
      browser.close();
      if (child.exitCode === null) await Promise.race([new Promise((r) => child.once("exit", r)), sleep(3000)]);
      if (child.exitCode === null) child.kill();
      // Only this helper's freshly-created temporary directory can be removed.
      await removeProfile();
    } };
  } catch (error) {
    browser?.close(); child.kill();
    await sleep(500);
    await removeProfile();
    throw error;
  }
}
