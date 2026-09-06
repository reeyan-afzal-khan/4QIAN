/* build-defs.mjs — a gloss for every character the Write tab can show.
 *
 * The word bank is 1,081 *words*, so it has nothing to say about most single
 * characters: the frequency list would show 机 #111 and 民 #113 with no
 * meaning at all, which makes a list of two thousand characters useless as
 * something to learn from. This fills that in from CC-CEDICT.
 *
 *     curl -o cedict.gz https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz
 *     gunzip cedict.gz && node scripts/build-defs.mjs ./cedict
 *
 * CC-CEDICT is CC BY-SA 4.0. That is attribution *and* share-alike, so the
 * credit is in the About panel and in the header of the generated file — it
 * is a different licence from the stroke data's, and both have to be kept.
 *
 * A character often has more than one reading with quite different meanings —
 * 长 is cháng "long" and zhǎng "to grow" — so readings are kept separately
 * rather than collapsed into one line that would be wrong for both.
 */
import {readFileSync, writeFileSync, existsSync} from "node:fs";

const src = process.argv[2];
if(!src || !existsSync(src)){
  console.error("usage: node scripts/build-defs.mjs <cedict txt>");
  process.exit(1);
}

/* ---------- which characters ---------- */

const w = {};
new Function("window", readFileSync("app/strokes.js", "utf8"))(w);
new Function("window", readFileSync("app/strokes-tw.js", "utf8"))(w);
const wanted = new Set([...Object.keys(w.__STROKES__),
                        ...Object.keys(w.__STROKES_TW__.chars)]);

/* ---------- numbered pinyin to tone marks ---------- */

const MARKS = {
  a: "āáǎàa", e: "ēéěèe", i: "īíǐìi",
  o: "ōóǒòo", u: "ūúǔùu", "ü": "ǖǘǚǜü"
};

/* The mark goes on the a if there is one, else the o or e, else the last
   vowel — which is what makes "iu" take it on the u and "ui" on the i
   without either needing a rule of its own. */
function toned(syl){
  const t = syl.match(/[1-5]$/);
  let s = syl.replace(/[1-5]$/, "").replace(/u:/g, "ü").toLowerCase();
  if(!t) return s;
  const tone = +t[0];
  if(tone === 5) return s;
  const vowels = [...s].map((c, i) => ({c, i})).filter(v => MARKS[v.c]);
  if(!vowels.length) return s;
  let pick = vowels.find(v => v.c === "a") ||
             vowels.find(v => v.c === "o" || v.c === "e") ||
             vowels[vowels.length - 1];
  return s.slice(0, pick.i) + MARKS[pick.c][tone - 1] + s.slice(pick.i + 1);
}

const readingOf = p => p.trim().split(/\s+/).map(toned).join(" ");

/* ---------- trim a definition down to something readable ---------- */

/* CC-CEDICT senses carry a lot of apparatus a beginner does not want on a
   flash card: cross-references, classifier notes, Taiwan pronunciation
   variants. Kept only when a character has nothing else. */
const NOISE = /^(variant of|old variant|see |see also|abbr\. for|surname |CL:|Taiwan pr\.|erhua variant|used in|also written)/i;

/* Parentheses are NOT stripped. An early version did, and it turned 第 —
   whose CC-CEDICT sense is "(prefix indicating ordinal number)" — into a note
   about imperial examinations, because removing the bracket removed the
   definition. Only the embedded [pinyin] cross-references go. */
function clean(d){
  return d
    /* CC-CEDICT writes a cross-referenced word as traditional|simplified —
       "used mostly in 會水|会水". Only one of those belongs on a card, and it
       is the one matching the script most readers here are learning. */
    .replace(/[㐀-鿿]+\|([㐀-鿿]+)/g, "$1")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function senses(defs){
  const good = defs.map(clean).filter(d => d && !NOISE.test(d));
  const pool = good.length ? good : defs.map(clean).filter(Boolean);

  /* CC-CEDICT repeats a sense across the traditional and simplified lines,
     so the same gloss arrives twice. */
  const seen = new Set(), list = [];
  for(const d of pool){
    const k = d.toLowerCase();
    if(seen.has(k)) continue;
    seen.add(k); list.push(d);
    if(list.length === 3) break;
  }

  /* Truncate at a sense boundary rather than mid-phrase, so a gloss never
     ends inside a bracket it opened. */
  let out = "";
  for(const d of list){
    const next = out ? out + "; " + d : d;
    if(next.length > 92){ if(!out) out = d.slice(0, 90) + "…"; break; }
    out = next;
  }
  return out;
}

/* ---------- parse ---------- */

const LINE = /^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\/(.+)\/\s*$/;
const byChar = new Map();          // char -> Map(reading -> [defs])

let lines = 0, used = 0;
for(const line of readFileSync(src, "utf8").split(/\r?\n/)){
  if(!line || line.startsWith("#")) continue;
  lines++;
  const m = LINE.exec(line);
  if(!m) continue;
  const [, trad, simp, pin, body] = m;

  /* Single characters only: this is a character pad, and the word bank
     already covers words. */
  for(const head of new Set([trad, simp])){
    if([...head].length !== 1 || !wanted.has(head)) continue;
    const r = readingOf(pin);
    if(!byChar.has(head)) byChar.set(head, new Map());
    const m2 = byChar.get(head);
    if(!m2.has(r)) m2.set(r, {plain: [], proper: []});

    /* CC-CEDICT marks proper nouns by capitalising the pinyin — 水 is both
       [Shui3] "the Shui ethnic group" and [shui3] "water". Tone marks erase
       the capital, so the two entries merge into one reading and the ethnic
       group can end up first, which is not what anyone means by 水. Kept, but
       kept behind. */
    const bucket = /^[A-Z]/.test(pin.trim()) ? "proper" : "plain";
    m2.get(r)[bucket].push(...body.split("/"));
    used++;
  }
}

/* ---------- emit ---------- */

const out = {};
let multi = 0;
for(const [ch, readings] of byChar){
  /* CC-CEDICT lists entries alphabetically by headword, so its order says
     nothing about which reading you will actually meet — taking the first
     gave 說 as shuì "to persuade" and lost xíng from 行 entirely. Sense count
     is a far better proxy: the reading a character usually has is the one
     the dictionary has the most to say about. Two at most — a card with four
     readings is not a card. */
  const ranked = [...readings.entries()]
    .map(([r, b]) => {
      const all = b.plain.concat(b.proper);
      return [r, all, senses(all)];
    })
    .filter(x => x[2])
    .sort((a, b) => b[1].length - a[1].length);

  const parts = ranked.slice(0, 2).map(x => x[0] + "|" + x[2]);
  if(!parts.length) continue;
  if(parts.length > 1) multi++;
  out[ch] = parts.join("¦");
}

const body = "/* Generated by scripts/build-defs.mjs — do not edit.\n" +
  " *\n" +
  " * A reading and a short gloss for every character the Write tab can show,\n" +
  " * from CC-CEDICT (https://cc-cedict.org/), used under CC BY-SA 4.0. The\n" +
  " * credit is also in the About panel; it is a different licence from the\n" +
  " * stroke data's and both have to travel with the app.\n" +
  " *\n" +
  " * Per character: reading|gloss, and where a character has two readings\n" +
  " * with different meanings, the two separated by ¦.\n" +
  " */\n" +
  "window.__DEFS__=" + JSON.stringify(out) + ";\n";

writeFileSync("app/defs.js", body);

const missing = [...wanted].filter(c => !out[c]);
console.log("cedict lines     " + lines);
console.log("single-char hits " + used);
console.log("characters       " + Object.keys(out).length + " of " + wanted.size +
            (missing.length ? "  (missing: " + missing.slice(0, 30).join("") + ")" : ""));
console.log("two readings     " + multi);
console.log("app/defs.js      " + (Buffer.byteLength(body) / 1024).toFixed(0) + " KB");
