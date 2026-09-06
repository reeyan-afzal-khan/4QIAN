/* android-build.mjs — web build -> synced assets -> signed APK -> release/.
 *
 * Uses the JDK and Android SDK unpacked under tools/, so the build does not
 * depend on anything being installed system-wide. Point JAVA_HOME or
 * ANDROID_HOME at your own copies to override.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TOOLS = join(ROOT, "tools");

function findJdk(){
  if(process.env.JAVA_HOME) return process.env.JAVA_HOME;
  const dir = join(TOOLS, "jdk");
  if(!existsSync(dir)) return null;
  const hit = readdirSync(dir).find(d => d.startsWith("jdk-"));
  return hit ? join(dir, hit) : null;
}

const JAVA_HOME = findJdk();
const ANDROID_HOME = process.env.ANDROID_HOME || join(TOOLS, "android-sdk");

if(!JAVA_HOME || !existsSync(JAVA_HOME))
  throw new Error("No JDK. Set JAVA_HOME, or unpack a JDK 21 into tools/jdk/.");
if(!existsSync(ANDROID_HOME))
  throw new Error("No Android SDK. Set ANDROID_HOME, or unpack the command-line tools into tools/android-sdk/.");

const env = {...process.env, JAVA_HOME, ANDROID_HOME, ANDROID_SDK_ROOT: ANDROID_HOME};
const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, {cwd: cwd || ROOT, env, stdio: "inherit", shell: true});

console.log("1/5  staging web build");
run("node", ["build.mjs"]);

/* The launcher icon, splash and theme colours are derived from app/icon-*.png
   every time, not branded once by hand and hoped for. They were manual for a
   while and the APK duly shipped the previous icon: nothing in the build knew
   the art had changed. android-brand.mjs writes everything it writes from
   source, so running it each time is free and makes the drift impossible. */
console.log("2/5  branding the android project");
run("node", ["scripts/android-brand.mjs"]);

console.log("3/5  syncing into the android project");
run("npx", ["cap", "copy", "android"]);

console.log("4/5  gradle assembleRelease");
writeFileSync(join(ROOT, "android", "local.properties"),
  "sdk.dir=" + ANDROID_HOME.replace(/\\/g, "\\\\") + "\n");
/* Quoted absolute path, not a bare "gradlew.bat": cmd.exe does not search the
   working directory for executables, so the bare name is simply not found. */
const wrapper = join(ROOT, "android", process.platform === "win32" ? "gradlew.bat" : "gradlew");
run(`"${wrapper}"`, ["assembleRelease", "--no-daemon"], join(ROOT, "android"));

console.log("5/5  collecting the apk");
const out = join(ROOT, "android", "app", "build", "outputs", "apk", "release");
const apk = readdirSync(out).find(f => f.endsWith(".apk") && !f.includes("unsigned"));
if(!apk) throw new Error("Gradle produced no signed APK in " + out);

const dest = join(ROOT, "release", "android");
mkdirSync(dest, {recursive: true});
/* Named from package.json, so bumping the release in one place renames the
   artefact too rather than shipping 1.0.0 in a file called 4.0.0. */
const named = `4QIAN-${JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version}.apk`;
copyFileSync(join(out, apk), join(dest, named));
const mb = (statSync(join(dest, named)).size / 1048576).toFixed(1);
console.log(`\ndone -> release/android/${named}  (${mb} MB)`);
