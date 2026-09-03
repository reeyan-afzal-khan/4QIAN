/* build.mjs — stage the web app into every target that ships it.
 *
 *   app/  ->  release/web/          a plain folder + zip, for a static host,
 *                                  and the webDir Capacitor copies into the APK
 *         ->  desktop/www/          what the Electron window loads
 *
 * The one transform on the way through is stamping sw.js: the cache name is
 * derived from the hash of the files it caches, so shipping new code always
 * retires the old cache instead of leaving a stale mix behind.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, rmSync, mkdirSync, readdirSync, copyFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC  = join(ROOT, "app");
const TARGETS = [
  join(ROOT, "release", "web"),
  join(ROOT, "desktop", "www"),
];

const files = readdirSync(SRC).filter(f => statSync(join(SRC, f)).isFile());

/* Hash every shipped file, not just the code, so an icon swap also busts. */
const h = createHash("sha256");
for(const f of files.sort()) h.update(f).update(readFileSync(join(SRC, f)));
const stamp = h.digest("hex").slice(0, 12);

console.log(`build ${stamp} · ${files.length} files`);

for(const dest of TARGETS){
  rmSync(dest, {recursive: true, force: true});
  mkdirSync(dest, {recursive: true});
  for(const f of files){
    if(f === "sw.js") continue;
    copyFileSync(join(SRC, f), join(dest, f));
  }
  const sw = readFileSync(join(SRC, "sw.js"), "utf8").replace("__BUILD__", stamp);
  writeFileSync(join(dest, "sw.js"), sw);
  console.log("  ->", dest.replace(ROOT + "\\", "").replace(ROOT + "/", ""));
}

/* A zip of the web build, so the folder can be handed to a static host or
   opened straight from disk the way the original dist.zip was. */
const web = TARGETS[0];
const zip = join(ROOT, "release", "4QIAN-web.zip");
rmSync(zip, {force: true});
try{
  execFileSync("powershell", ["-NoProfile", "-Command",
    `Compress-Archive -Path '${web}\\*' -DestinationPath '${zip}' -Force`],
    {stdio: "inherit"});
  console.log("  ->", zip.replace(ROOT + "\\", ""));
}catch(e){
  console.warn("  (zip skipped:", e.message, ")");
}
