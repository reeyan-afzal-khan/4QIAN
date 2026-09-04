/* fix-sandhi.mjs — apply 一 and 不 tone sandhi to the shipped pinyin.
 *
 * Both are mechanical rules that every Mandarin course teaches in its first
 * month, and the deck's pinyin does not apply either: it prints "yī" and "bù"
 * everywhere regardless of what follows. That is not a stylistic choice, it
 * is a wrong reading, and it is wrong in about a third of the corpus.
 *
 *   不  ->  bú  before a fourth-tone syllable, bù otherwise
 *   一  ->  yí  before a fourth tone
 *           yì  before a first, second or third tone
 *           yī  as a bare numeral: after 第, before a unit of a date or a
 *                number, or when nothing follows it inside the word
 *
 * Only these two syllables are touched, and only their tone mark, so the
 * change cannot disturb any other reading. The rewrite is applied against
 * the hanzi so a "yi" that romanises 以 or 已 is never mistaken for 一.
 */
import {readFileSync, writeFileSync} from "node:fs";
import {SYLLABLE} from "./pinyin.mjs";

const HAN = /[\u4e00-\u9fff]/;
const toneOf = s =>
  /[āēīōūǖ]/.test(s) ? 1 : /[áéíóúǘ]/.test(s) ? 2 :
  /[ǎěǐǒǔǚ]/.test(s) ? 3 : /[àèìòùǜ]/.test(s) ? 4 : 0;

/* 一 stays a plain numeral in these shapes. */
const ORDINAL_BEFORE = new Set(["第"]);
/* Dates only. 一年 and 一点 are quantities — "one year", "a little" — and take
   the sandhi like any other measure phrase. */
const NUMERAL_AFTER  = new Set(["月","日","号"]);
/* words where 一 is the final syllable and keeps yī */
/* 统一 is deliberately absent: its only appearance in this corpus is the
   false split of 总统|一届, where the 一 does take the sandhi. */
const FINAL_YI = ["之一","唯一","万一","专一","单一","归一","合一","第一"];

export function fixOne(zh, py){
  // Split the pinyin into tokens, keeping punctuation attached to its slot.
  const toks = py.split(/(\s+)/);
  const sylIdx = [];                     // indices in toks that are syllables
  toks.forEach((t, i) => { if(SYLLABLE.test(t)) sylIdx.push(i); });

  const chars = [...zh].filter(c => HAN.test(c) || /[A-Za-z0-9]/.test(c));
  // Only proceed when the two sides line up; a mismatch means this row is one
  // of the 23 the aligner already could not read, and it is left alone.
  const hanChars = [...zh].filter(c => HAN.test(c));
  if(hanChars.length !== sylIdx.length) return {py, n: 0};

  let n = 0;
  for(let k = 0; k < hanChars.length; k++){
    const ch = hanChars[k];
    if(ch !== "一" && ch !== "不") continue;
    const at = sylIdx[k];
    const cur = toks[at];
    const bare = cur.replace(/[^a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]/gi, "");
    if(ch === "一" && !/^y[īíì]$/.test(bare)) continue;
    if(ch === "不" && !/^b[ùú]$/.test(bare)) continue;   // leave neutral "bu"

    const prev = hanChars[k-1], next = hanChars[k+1];
    const nextSyl = sylIdx[k+1] != null ? toks[sylIdx[k+1]] : null;
    const t = nextSyl ? toneOf(nextSyl) : 0;

    let want;
    if(ch === "不"){
      want = t === 4 ? "bú" : "bù";
    }else{
      const finalWord = FINAL_YI.some(wd => zh.slice(Math.max(0, k-2)).startsWith(wd.slice(0,-1) + "一"));
      if(prev && ORDINAL_BEFORE.has(prev)) want = "yī";
      else if(next && NUMERAL_AFTER.has(next)) want = "yī";
      else if(prev && FINAL_YI.some(wd => wd.endsWith("一") && wd[wd.length-2] === prev)) want = "yī";
      else if(!nextSyl || t === 0) want = "yī";
      else if(t === 4) want = "yí";
      else want = "yì";
      void finalWord;
    }
    if(bare !== want){
      toks[at] = cur.replace(bare, want);
      n++;
    }
  }
  return {py: toks.join(""), n};
}

/* ---- run over the deck ---- */
const path = "app/questions.js";
const src = readFileSync(path, "utf8");
const w = {}; new Function("window", src)(w);
const D = w.__DECK__;

let rows = 0, syls = 0;
const samples = [];
const replacements = new Map();
for(const q of D.q){
  const {py, n} = fixOne(q[8], q[9]);
  if(n){
    rows++; syls += n;
    if(samples.length < 12) samples.push(`  ${q[8]}\n    was ${q[9]}\n    now ${py}`);
    replacements.set(q[9], py);
  }
}
console.log(`rows changed: ${rows}   syllables corrected: ${syls}`);
samples.forEach(s => console.log(s));

if(process.argv.includes("--write")){
  /* Rewrite in place by replacing each pinyin string literal. The file is one
     long generated array, so the strings are edited textually rather than the
     whole structure being re-serialised — that keeps the diff to the pinyin
     field and nothing else. */
  let out = src, hits = 0;
  for(const [from, to] of replacements){
    const needle = JSON.stringify(from);
    const repl = JSON.stringify(to);
    if(out.includes(needle)){ out = out.split(needle).join(repl); hits++; }
  }
  writeFileSync(path, out);
  console.log(`written: ${hits} distinct pinyin strings replaced`);
}
