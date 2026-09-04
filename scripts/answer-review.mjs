/* answer-review.mjs — list every polyphonic reading the generated answer
 * pinyin committed to, with context, so it can be eyeballed.
 *
 * The romaniser is only as good as its override table, and the place it goes
 * wrong is always the same: a character with more than one reading, in a word
 * the table did not know about. This prints exactly those decisions and
 * nothing else, so reviewing a rebuild is a one-screen job.
 *
 *   node scripts/answer-review.mjs           polyphones only
 *   node scripts/answer-review.mjs --all     every character, for a full pass
 */
import {readFileSync} from "node:fs";
import {learn, SYLLABLE} from "./pinyin.mjs";

const HAN = /[一-鿿]/;
const {map} = learn();
const w = {};
new Function("window", readFileSync("app/answers.js", "utf8"))(w);
const A = w.__ANSWERS__;

/* Characters worth checking: more than one reading in the corpus, plus the
   ones a table commonly gets wrong even when the corpus only shows one. */
const EXTRA = new Set([..."朝缝薄粘夹笼乘膊璃惚倒干强恶血系将量传283"]);
const poly = c => (map.get(c)?.size || 0) > 1 || EXTRA.has(c);

const all = process.argv.includes("--all");
const seen = new Map();          // "char:reading" -> [contexts]

function walk(zh, py, tag){
  const chars = [...zh].filter(c => HAN.test(c));
  const syl = py.replace(/[.,!?;:"'“”‘’()（）、，。？！；：—…]/g, " ")
                .split(/\s+/).filter(s => SYLLABLE.test(s));
  if(chars.length !== syl.length){
    console.log(`MISALIGN ${tag}: ${chars.length} chars vs ${syl.length} syllables`);
    console.log("   " + zh);
    return;
  }
  let ci = 0;
  [...zh].forEach((ch, i) => {
    if(!HAN.test(ch)) return;
    const r = syl[ci++];
    if(!all && !poly(ch)) return;
    const key = ch + " = " + r;
    if(!seen.has(key)) seen.set(key, new Set());
    const s = seen.get(key);
    if(s.size < 3) s.add(zh.slice(Math.max(0, i - 3), i + 4));
  });
}

for(const [rank, en, zh, py] of A.a)
  for(let i = 0; i < 4; i++) walk(zh[i], py[i], `Q${rank}.${"AREC"[i]}`);
for(const k of Object.keys(A.scaffold)){
  const s = A.scaffold[k];
  for(const part of ["a","r","e","c"]) walk(s[part][1], s[part][2], `scaffold.${k}.${part}`);
}

/* group by character so competing readings sit next to each other */
const byChar = new Map();
for(const [key, ctx] of seen){
  const ch = key[0];
  if(!byChar.has(ch)) byChar.set(ch, []);
  byChar.get(ch).push([key.slice(4), ctx]);
}
const multi = [...byChar.entries()].filter(([, rs]) => rs.length > 1);
const single = [...byChar.entries()].filter(([, rs]) => rs.length === 1);

console.log(`=== characters given MORE THAN ONE reading (check these first) ===`);
for(const [ch, rs] of multi){
  console.log(`\n${ch}`);
  for(const [r, ctx] of rs) console.log(`   ${r.padEnd(8)} ${[...ctx].join("  ")}`);
}
console.log(`\n=== single-reading polyphones (${single.length}) ===`);
for(const [ch, rs] of single) console.log(`${ch} = ${rs[0][0].padEnd(7)} ${[...rs[0][1]][0]}`);
