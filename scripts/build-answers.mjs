/* build-answers.mjs — turn the hand-written answers into app/answers.js.
 *
 * The romaniser lives in the build, not the app: the runtime should not have
 * to carry a pinyin engine and a reading table to display a sentence that was
 * settled when it was written. So the pinyin is generated here, checked, and
 * shipped next to the Chinese.
 *
 * Two things come out of this file:
 *   a           the model answers, one row per question that has one
 *   scaffold    the AREC frame offered for every other question, plus the
 *               map from the deck's 101 grammar frames onto which scaffold
 *               each one takes
 *
 * Anything the romaniser could not verify is reported rather than silently
 * shipped — characters that neither the corpus nor the override table can
 * read have no reading at all, and would otherwise appear as themselves.
 */
import {readFileSync, writeFileSync} from "node:fs";
 /* The answers live in scripts/answers/, split into batches only so that each
    file stays a readable length. Order across files is irrelevant — the rows
    are sorted by rank before they are written. */
import daily      from "./answers/01-daily.mjs";
import workPeople from "./answers/02-work-people.mjs";
import memPlace   from "./answers/03-memory-place.mjs";
import taste      from "./answers/04-taste-opinion.mjs";
const ANSWERS = [...daily, ...workPeople, ...memPlace, ...taste];
import {KINDS, MIDDLE, FRAME_KIND} from "./scaffold-source.mjs";

/* Topic answers: a full-length model for every category-and-shape pair, so a
   question with no exact answer still gets a real answer rather than four
   headings. Batched by category group only to keep each file readable. */
import topicGeneral from "./answers/topic/10-general.mjs";
import topicPeople  from "./answers/topic/a-people.mjs";
import topicLife    from "./answers/topic/b-life.mjs";
import topicMind    from "./answers/topic/c-mind.mjs";
import topicRest    from "./answers/topic/d-rest.mjs";
const TOPIC = [...topicGeneral, ...topicPeople, ...topicLife, ...topicMind, ...topicRest];
import {makeRomaniser, learn, OVERRIDE} from "./pinyin.mjs";

const romanise = makeRomaniser();
const {map} = learn();
const HAN = /[一-鿿]/;
/* A character is only readable if the romaniser can resolve it ON ITS OWN.
   Crediting every character that appears inside a multi-character override
   is what let 扫 through: the table knew 打扫 and the answer wrote 随便扫,
   so the phrase never matched and the bare character came out untouched.
   The reliable test is not what the table contains but what the romaniser
   actually produced, so the check now reads its own output. */
const single = new Set(OVERRIDE.filter(([hz]) => [...hz].length === 1).map(([hz]) => hz));
const covered = new Set([...map.keys(), ...single]);

const w = {};
new Function("window", readFileSync("app/questions.js", "utf8"))(w);
const D = w.__DECK__;
const byRank = new Map(D.q.map(q => [q[0], q]));

/* ---- model answers ---- */
const unknown = new Map();
const rows = [];
const seen = new Set();

/* Report the surrounding characters as well as the count. A bare list of
   characters is not actionable — 朝 needs a different reading in 朝阳 than
   in 朝代, and the context is what tells you which override to write. */
/* Any Chinese character still present in a romanised string is one the
   romaniser could not read. Reported with its context, because a bare list
   of characters is not actionable — 朝 needs a different reading in 朝阳
   than in 朝夕, and only the context tells you which override to write. */
function scan(py, source){
  [...py].forEach(ch => {
    if(!HAN.test(ch)) return;
    const at = (source || py).indexOf(ch);
    const ctx = (source || py).slice(Math.max(0, at - 3), at + 4);
    if(!unknown.has(ch)) unknown.set(ch, {n: 0, ctx: new Set()});
    const u = unknown.get(ch);
    u.n++;
    if(u.ctx.size < 3) u.ctx.add(ctx);
  });
}

for(const [rank, en, zh] of ANSWERS){
  if(!byRank.has(rank)){ console.error(`!! rank ${rank} is not in the deck`); continue; }
  if(seen.has(rank)){ console.error(`!! duplicate answer for rank ${rank}`); continue; }
  seen.add(rank);
  if(en.length !== 4 || zh.length !== 4){ console.error(`!! rank ${rank}: expected 4 parts each`); continue; }
  const py = zh.map(romanise);
  py.forEach((p, i) => scan(p, zh[i]));
  rows.push([rank, en, zh, py]);
}
rows.sort((a, b) => a[0] - b[0]);

/* ---- scaffolds ---- */
/* Longest prefix first, so "Do you think" beats "Do you". */
const order = FRAME_KIND.slice().sort((a, b) => b[0].length - a[0].length);
const frameKind = D.frames.map(f => {
  const hit = order.find(([p]) => f.toLowerCase().startsWith(p.toLowerCase().trim()));
  return hit ? hit[1] : "open";
});

const scaffold = {};
for(const [id, k] of Object.entries(KINDS)){

  scaffold[id] = {
    nm: k.nm,
    a: [k.a[0], k.a[1], romanise(k.a[1])],
    r: [MIDDLE.r[0], MIDDLE.r[1], romanise(MIDDLE.r[1])],
    e: [MIDDLE.e[0], MIDDLE.e[1], romanise(MIDDLE.e[1])],
    c: [k.c[0], k.c[1], romanise(k.c[1])]
  };
}
for(const k of Object.values(scaffold))
  for(const p of ["a","r","e","c"]) scan(k[p][2], k[p][1]);

const tally = {};
frameKind.forEach(k => tally[k] = (tally[k] || 0) + 1);

console.log(`model answers: ${rows.length}`);
console.log(`scaffold kinds over ${D.frames.length} frames: ` +
  Object.entries(tally).map(([k, n]) => `${k}=${n}`).join("  "));
if(unknown.size)
  console.log("\nNO READING AVAILABLE for: " +
    [...unknown.entries()].map(([c, u]) => `
  ${c} ×${u.n}  ${[...u.ctx].join("  ")}`).join(""));

/* ---- emit ---- */
const header = `/* answers.js — model answers in the AREC shape.
 *
 * AREC is the IELTS speaking structure: Answer, Reason, Example, Conclusion.
 * Say the thing, say why, ground it in something that actually happened, then
 * close. It is taught because it fixes the two ways a fluent speaker still
 * loses marks — answering in three words, and talking without landing.
 *
 * \`a\` holds the written answers, one row per question that has one:
 * [rank, en[4], zh[4], pinyin[4]], the four parts in order. The Chinese is a
 * real answer to the same question rather than a translation of the English —
 * same content, said the way it would be said in Chinese.
 *
 * \`scaffold\` is what every other question gets: the same four moves with
 * openers chosen to fit the grammar the question is built on, because a
 * template that ignores the frame teaches nothing the heading did not.
 * \`frameKind\` maps each of the deck's grammar frames onto one of them.
 *
 * Generated by scripts/build-answers.mjs — edit the sources next to it, not
 * this file. Pinyin comes from the same corpus-derived romaniser that checks
 * the deck, so the two agree on how a word is spelled.
 */
window.__ANSWERS__ = {
  version: 1,
  parts: [
    ["A", "Answer",     "State a position and qualify it once. Do not hedge and do not stall."],
    ["R", "Reason",     "Why. One reason developed properly, rather than three listed."],
    ["E", "Example",    "One thing that actually happened, with specifics. The longest part."],
    ["C", "Conclusion", "What it adds up to — a step beyond the answer, not a repeat of it."]
  ],
  a: [
`;

const body = rows.map(([rank, en, zh, py]) =>
  `[${rank},\n [${en.map(s => JSON.stringify(s)).join(",\n  ")}],\n` +
  ` [${zh.map(s => JSON.stringify(s)).join(",\n  ")}],\n` +
  ` [${py.map(s => JSON.stringify(s)).join(",\n  ")}]]`
).join(",\n\n");

/* ---- topic answers ---- */
const topic = {};
const shapeSeen = new Set();
for(const [cat, shape, en, zh] of TOPIC){
  if(en.length !== 4 || zh.length !== 4){ console.error(`!! topic ${cat}/${shape}: expected 4 parts each`); continue; }
  const k = cat + "|" + shape;
  if(shapeSeen.has(k)){ console.error(`!! duplicate topic answer for ${k}`); continue; }
  shapeSeen.add(k);
  const py = zh.map(romanise);
  py.forEach((p, i) => scan(p, zh[i]));
  (topic[cat] || (topic[cat] = {}))[shape] = [0,1,2,3].map(i => [en[i], zh[i], py[i]]);
}

/* Which shape each category falls back to when the question's own shape has
   no answer written yet: the one with the most questions behind it. */
const counts = {};
for(const q of D.q){
  const c = q[4], sh = frameKind[q[5]];
  ((counts[c] || (counts[c] = {}))[sh]) = (counts[c][sh] || 0) + 1;
}
const fallback = {};
for(const c of Object.keys(topic)){
  const have = Object.keys(topic[c]);
  fallback[c] = have.sort((a, b) => (counts[c]?.[b] || 0) - (counts[c]?.[a] || 0))[0];
}

/* How many questions now reach a full answer rather than the bare scaffold. */
let full = 0;
for(const q of D.q){
  if(seen.has(q[0])) { full++; continue; }
  if(topic[q[4]]) full++;
}
console.log(`topic answers: ${TOPIC.length} across ${Object.keys(topic).length} categories`);
console.log(`questions reaching a full answer: ${full} of ${D.q.length} ` +
            `(${(full / D.q.length * 100).toFixed(1)}%)`);

const tail =
  "\n],\n\n" +
  "  /* Which scaffold each of the deck's grammar frames takes, by frame index. */\n" +
  "  frameKind: " + JSON.stringify(frameKind) + ",\n\n" +
  "  /* Full answers by category and question shape, used by every question\n" +
  "     that has no exact answer of its own. */\n" +
  "  topic: " + JSON.stringify(topic) + ",\n\n" +
  "  /* Which shape a category falls back to when the question's own shape has\n" +
  "     no answer written for it yet. */\n" +
  "  topicFallback: " + JSON.stringify(fallback) + ",\n\n" +
  "  scaffold: " + JSON.stringify(scaffold, null, 1).replace(/\n/g, "\n  ") + "\n};\n";

writeFileSync("app/answers.js", header + body + tail);
console.log("\nwrote app/answers.js");
