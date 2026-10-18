import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { npm } from "./npm.mjs";

const pkg = JSON.parse(await readFile("package.json", "utf8"));
assert.equal(pkg.private, undefined);
assert.equal(pkg.license, "MIT");
assert.equal(pkg.dsh.bundle.patch, "./cordis.patch.yml");
assert.equal(pkg.dsh.client.platform, "web");
for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) assert.equal(Object.keys(pkg[field] || {}).length, 0, `${field} must stay empty`);
for (const name of ["preinstall", "install", "postinstall", "prepare", "prepack"]) assert.equal(pkg.scripts[name], undefined, `forbidden install hook ${name}`);
const client = await readFile("client.js", "utf8");
assert.ok(client.includes(`version: "${pkg.version}"`), "client diagnostics must match package version");
assert.ok(!/\b(?:fetch|XMLHttpRequest|WebSocket|eval)\s*\(/.test(client), "runtime must not add network or dynamic code execution");
assert.ok(!/\.innerHTML\s*=/.test(client), "runtime must not use HTML injection");
const skip = new Set([".git", "node_modules", "dist", "artifacts", "coverage"]);
async function walk(dir = ".") {
  const files = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    if (skip.has(item.name)) continue;
    const path = `${dir}/${item.name}`;
    if (item.isDirectory()) files.push(...await walk(path)); else files.push(path);
  }
  return files;
}
const files = await walk();
const secretPatterns = [
  /\bgh[pousr]_[A-Za-z0-9]{25,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{30,}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bsk-[A-Za-z0-9]{32,}\b/,
  /[A-Z]:[\\/]Users[\\/][^\s"<>]+/i,
];
for (const path of files) {
  if (!/\.(?:js|mjs|cjs|json|ya?ml|md|html|txt)$/.test(path) && !path.endsWith("LICENSE")) continue;
  const source = await readFile(path, "utf8");
  for (const pattern of secretPatterns) assert.ok(!pattern.test(source), `potential credential or personal path in ${path}`);
  if (/\.(?:mjs|cjs|js)$/.test(path)) {
    const result = spawnSync(process.execPath, ["--check", path], { encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
  }
}
const expected = ["LICENSE", "README.md", "README.en.md", "client.js", "cordis.patch.yml", "index.js", "locale/en.json", "locale/zh.json", "package.json"].sort();
const result = JSON.parse(npm(["pack", "--dry-run", "--ignore-scripts", "--json"]));
assert.deepEqual(result[0].files.map((f) => f.path).sort(), expected, "package file allowlist changed");
for (const locale of ["zh", "en"]) {
  const data = JSON.parse(await readFile(`locale/${locale}.json`, "utf8"));
  assert.ok(data.meta.title && data.meta.description);
}
console.log(`Checks passed: syntax, manifest, ${files.length} source files scanned, ${expected.length} package files, zero runtime dependencies.`);
