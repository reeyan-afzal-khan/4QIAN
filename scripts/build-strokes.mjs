/* build-strokes.mjs — pack stroke-order data for the Write tab.
 *
 * Source: hanzi-writer-data, which is the Make Me a Hanzi dataset republished
 * per character. Get it once, anywhere you like:
 *
 *     npm pack hanzi-writer-data@2.0.1 && tar -xzf hanzi-writer-data-2.0.1.tgz
 *     node scripts/build-strokes.mjs ./package
 *
 * The data is under the Arphic Public License, which is copyleft: the notice
 * travels with it. app/ARPHICPL.TXT is copied from the package by this script
 * and the About panel credits it — do not ship one without the other.
 *
 * WHAT SHIPS. Two sets, in two files, because most people will only ever want
 * the first and it is already the largest thing in the app:
 *
 *   app/strokes.js     every character in the deck, plus the 2,000 most
 *                      frequent characters — 2,303 in all.
 *   app/strokes-tw.js  the traditional forms of those that have one, and the
 *                      simplified-to-traditional map. Loaded only if the Write
 *                      tab is switched to traditional.
 *
 * The frequency order comes from scripts/frequency-2000.txt and the variants
 * from scripts/opencc-STCharacters.txt. Both are checked in rather than
 * fetched: a build that silently changes because a website did is not a build.
 *
 * WHY A CUSTOM ENCODING. The raw JSON is 4.8 MB for 1,894 characters, and
 * 3.8 MB with the whitespace squeezed out. Almost all of it is coordinates:
 * hundreds of thousands of integers written in decimal, three or four bytes
 * plus a separator each, when consecutive points are usually a few dozen units
 * apart. Delta-encoding them against a running cursor and writing each delta as
 * a base-64 varint gets the identical numbers back — this is lossless, not a
 * quantisation, and the script asserts as much below — for about 45% of the
 * size. The decoder is twenty lines, and lives in app/write.js.
 *
 * The y axis is flipped on the way in. The source is y-up and expects the
 * reader to apply `scale(1,-1) translate(0,-900)`; baking `y = 900 - y` here
 * means the app can draw into a plain `0 0 1024 1024` viewBox and no part of
 * the renderer has to remember which way up the data is.
 */
import {readFileSync, writeFileSync, existsSync, copyFileSync} from "node:fs";
import {join} from "node:path";

const src = process.argv[2];
if(!src){
  console.error("usage: node scripts/build-strokes.mjs <hanzi-writer-data dir>");
  process.exit(1);
}

const isHan = c => {
  const n = c.codePointAt(0);
  return (n >= 0x4e00 && n <= 0x9fff) || (n >= 0x3400 && n <= 0x4dbf);
};
const hasData = ch => existsSync(join(src, ch + ".json"));

/* ---------- which characters ---------- */

const w = {};
new Function("window", readFileSync("app/questions.js", "utf8"))(w);
new Function("window", readFileSync("app/vocab.js", "utf8"))(w);

/* Every character the app can put in front of you, from either source. One
   that appears in a question but not the word bank is still one you will
   meet, so both count. */
const corpus = new Set();
for(const q of w.__DECK__.q) for(const ch of q[8]) if(isHan(ch)) corpus.add(ch);
for(const e of w.__VOCAB__.w) for(const ch of e[0]) if(isHan(ch)) corpus.add(ch);

/* …plus the frequency list, so the tab is useful for characters this deck
   happens not to use. Order is preserved: the app shows them in it. */
const freq = [];
const freqSeen = new Set();
for(const line of readFileSync("scripts/frequency-2000.txt", "utf8").split(/\r?\n/)){
  if(line.startsWith("#")) continue;
  for(const ch of line) if(isHan(ch) && !freqSeen.has(ch)){ freqSeen.add(ch); freq.push(ch); }
}

const simplified = new Set([...corpus, ...freq]);

/* ---------- traditional variants ---------- */

const st = new Map();
for(const line of readFileSync("scripts/opencc-STCharacters.txt", "utf8").split(/\r?\n/)){
  if(!line || line.startsWith("#")) continue;
  const [k, v] = line.split("\t");
  if(k && v) st.set(k, v.trim().split(/\s+/));
}

/* A mapping is only worth shipping if the character it points at can actually
   be drawn. Forty-odd rare variants — 喫 for 吃, 麪 for 面 — have no stroke
   data, and a pad that offers a character and then cannot draw it is worse
   than one that never offered it. */
const tradOnly = new Set();
const variants = {};
let dropped = 0;
for(const ch of simplified){
  const list = (st.get(ch) || []).filter(t => {
    if(hasData(t)) return true;
    dropped++; return false;
  });
  if(!list.length) continue;
  /* Identical forms are not a variant, they are the same character. */
  const real = list.filter(t => t !== ch);
  if(!real.length) continue;
  variants[ch] = real.join("");
  for(const t of real) if(!simplified.has(t)) tradOnly.add(t);
}

/* ---------- the encoding ---------- */

const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/* Zigzag so a small negative costs what a small positive does, then five
   payload bits per character with the top bit meaning "another one follows".
   A delta inside ±15 is one character, inside ±511 is two. */
function num(n){
  let v = n < 0 ? -n * 2 - 1 : n * 2, s = "";
  do { const c = v & 31; v >>= 5; s += A[c | (v ? 32 : 0)]; } while(v);
  return s;
}

const NUM = /-?\d+(?:\.\d+)?/g;
const CMD = /([MLQCZ])([^MLQCZ]*)/g;

function tokens(path){
  const out = [];
  let m; CMD.lastIndex = 0;
  while((m = CMD.exec(path))) out.push([m[1], ...(m[2].match(NUM) || []).map(Number)]);
  return out;
}

/* One path becomes one string: command letters interleaved with deltas. The
   cursor runs across the whole path, so `Z` costs a single byte and a curve
   that doubles back costs almost nothing. */
function encodePath(path, seen){
  let cx = 0, cy = 0, s = "";
  for(const t of tokens(path)){
    seen.add(t[0]);
    s += t[0];
    for(let i = 1; i < t.length; i += 2){
      const x = Math.round(t[i]), y = Math.round(900 - t[i + 1]);
      s += num(x - cx) + num(y - cy);
      cx = x; cy = y;
    }
  }
  return s;
}

function encodeMedian(points){
  let cx = 0, cy = 0, s = "";
  for(const [px, py] of points){
    const x = Math.round(px), y = Math.round(900 - py);
    s += num(x - cx) + num(y - cy);
    cx = x; cy = y;
  }
  return s;
}

/* ---------- the decoder, kept here only to check the encoder ----------
   This is the same algorithm app/write.js runs. It exists in the build so a
   size win can never be a silent loss of precision: every coordinate is
   decoded and compared before anything is written. */
const IDX = {}; for(let i = 0; i < 64; i++) IDX[A[i]] = i;

function readNum(s, i){
  let v = 0, sh = 0, c;
  do { c = IDX[s[i++]]; v |= (c & 31) << sh; sh += 5; } while(c & 32);
  return [(v & 1) ? -((v + 1) >> 1) : (v >> 1), i];
}
const ARGS = {M: 1, L: 1, Q: 2, C: 3, Z: 0};

function decodePath(s){
  let i = 0, cx = 0, cy = 0;
  const out = [];
  while(i < s.length){
    const cmd = s[i++];
    const t = [cmd];
    for(let k = 0; k < ARGS[cmd]; k++){
      let d; [d, i] = readNum(s, i); cx += d;
      let e; [e, i] = readNum(s, i); cy += e;
      t.push(cx, cy);
    }
    out.push(t);
  }
  return out;
}

/* ---------- build ---------- */

const cmds = new Set();
const stats = {strokes: 0, points: 0, coords: 0};

function pack(chars){
  const out = {};
  const missing = [];
  for(const ch of chars){
    const f = join(src, ch + ".json");
    if(!existsSync(f)){ missing.push(ch); continue; }
    const j = JSON.parse(readFileSync(f, "utf8"));

    const paths = j.strokes.map(p => encodePath(p, cmds));
    const meds  = j.medians.map(encodeMedian);
    stats.strokes += paths.length;
    for(const m of j.medians) stats.points += m.length;

    /* Assert the round trip, coordinate by coordinate. */
    for(let s = 0; s < j.strokes.length; s++){
      const want = tokens(j.strokes[s]), got = decodePath(paths[s]);
      if(want.length !== got.length) throw new Error(ch + ": command count changed");
      for(let a = 0; a < want.length; a++){
        if(want[a][0] !== got[a][0]) throw new Error(ch + ": command changed");
        for(let b = 1; b < want[a].length; b += 2){
          const ex = Math.round(want[a][b]), ey = Math.round(900 - want[a][b + 1]);
          if(got[a][b] !== ex || got[a][b + 1] !== ey)
            throw new Error(ch + ": coordinate changed at stroke " + s);
          stats.coords += 2;
        }
      }
    }
    out[ch] = paths.join("|") + "~" + meds.join("|");
  }
  if(missing.length) throw new Error("no stroke data for: " + missing.join(""));
  return out;
}

const head = name => "/* Generated by scripts/build-strokes.mjs — do not edit.\n" +
  " *\n" +
  " * " + name + "\n" +
  " *\n" +
  " * From the Make Me a Hanzi dataset by way of hanzi-writer-data, under the\n" +
  " * Arphic Public License; see ARPHICPL.TXT beside this file, and the credit\n" +
  " * in the About panel. Decoder: app/write.js.\n" +
  " *\n" +
  " * Coordinates are a 1024x1024 box, y down, ready for the viewBox as written.\n" +
  " * Per character: outline paths joined by |, then ~, then medians joined by |.\n" +
  " */\n";

/* Frequency order first, so the app can offer "the 500 most common" without
   carrying a second list; everything else follows. */
const ordered = [...freq.filter(c => simplified.has(c)),
                 ...[...simplified].filter(c => !freqSeen.has(c)).sort()];

const simpOut = pack(ordered);
const bodyA = head("Every character in the deck, plus the 2,000 most frequent.") +
  "window.__STROKES__=" + JSON.stringify(simpOut) + ";\n" +
  "window.__STROKES_FREQ__=" + JSON.stringify(freq.filter(c => simplified.has(c)).join("")) + ";\n";
writeFileSync("app/strokes.js", bodyA);

const tradOut = pack([...tradOnly].sort());
const bodyB = head("Traditional forms, and the simplified-to-traditional map.") +
  "window.__STROKES_TW__={chars:" + JSON.stringify(tradOut) +
  ",map:" + JSON.stringify(variants) + "};\n";
writeFileSync("app/strokes-tw.js", bodyB);

for(const c of cmds) if(!(c in ARGS)) throw new Error("unhandled path command: " + c);

const lic = join(src, "ARPHICPL.TXT");
if(existsSync(lic)) copyFileSync(lic, "app/ARPHICPL.TXT");
else console.warn("! ARPHICPL.TXT not found in " + src + " — copy it by hand");

const mb = n => (n / 1048576).toFixed(2) + " MB";
console.log("deck characters      " + corpus.size);
console.log("frequency list       " + freq.length + " (" +
            freq.filter(c => !corpus.has(c)).length + " not already in the deck)");
console.log("simplified shipped   " + Object.keys(simpOut).length);
console.log("traditional shipped  " + Object.keys(tradOut).length);
console.log("variant map          " + Object.keys(variants).length + " characters" +
            (dropped ? "  (" + dropped + " variants dropped, no stroke data)" : ""));
console.log("strokes              " + stats.strokes);
console.log("median points        " + stats.points);
console.log("coordinates          " + stats.coords + " round-tripped exactly");
console.log("path commands        " + [...cmds].sort().join(" "));
console.log("app/strokes.js       " + mb(Buffer.byteLength(bodyA)));
console.log("app/strokes-tw.js    " + mb(Buffer.byteLength(bodyB)));
