import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { npm } from "./npm.mjs";
await mkdir("dist", { recursive: true });
const [packed] = JSON.parse(npm(["pack", "--ignore-scripts", "--json", "--pack-destination", "dist"]));
const bytes = await readFile(`dist/${packed.filename}`);
const sha256 = createHash("sha256").update(bytes).digest("hex");
await writeFile("dist/SHA256SUMS", `${sha256}  ${packed.filename}\n`);
console.log(`dist/${packed.filename} (${bytes.length} bytes)\nSHA256 ${sha256}`);
