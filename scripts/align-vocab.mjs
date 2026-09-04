/* align-vocab.mjs — make the bank agree with the corpus, word by word.
 *
 * The two must print a word the same way or the app contradicts itself on
 * screen. The corpus wins, because it is 4,228 rows against one file — but
 * only where the corpus actually contains the word IN CONTEXT. Reading a
 * word's tones off its individual characters is how 吧 (the particle, "ba")
 * ends up spelled like 酒吧 (the bar, "bā"), so the span is extracted from
 * real sentences and the majority spelling across them wins.
 */
import {readFileSync, writeFileSync} from "node:fs";
import {SYLLABLE} from "./pinyin.mjs";
const HAN = /[\u4e00-\u9fff]/;
const w = {};
new Function("window", readFileSync("app/questions.js","utf8"))(w);
new Function("window", readFileSync("app/vocab.js","utf8"))(w);
const D = w.__DECK__, V = w.__VOCAB__;

/* every sentence, as aligned (char, syllable) pairs */
const rows = [];
for(const q of D.q){
  const chars = [...q[8]].filter(c => HAN.test(c));
  const syl = q[9].replace(/[.,!?;:"'“”‘’()（）、，。？！；：]/g," ").split(/\s+/)
                  .filter(s => SYLLABLE.test(s) && !/^[A-Z0-9]+$/.test(s));
  if(chars.length === syl.length) rows.push([chars, syl.map(s => s.toLowerCase())]);
}

const spellings = new Map();     // word -> Map(pinyin -> count)
for(const [chars, syl] of rows){
  const s = chars.join("");
  for(const [hz] of V.w){
    if(hz.length < 2) continue;
    let from = 0, at;
    while((at = s.indexOf(hz, from)) !== -1){
      const py = syl.slice(at, at + hz.length).join(" ");
      if(!spellings.has(hz)) spellings.set(hz, new Map());
      const m = spellings.get(hz);
      m.set(py, (m.get(py) || 0) + 1);
      from = at + 1;
    }
  }
}

let out = readFileSync("app/vocab.js","utf8"), n = 0, kept = 0;
for(const [hz, py, en, lv] of V.w){
  const m = spellings.get(hz);
  if(!m) { kept++; continue; }                      // not in the corpus: bank stands
  const top = [...m.entries()].sort((a,b) => b[1]-a[1])[0];
  if(top[0] === py) continue;
  // Only follow the corpus when it is consistent about the word.
  const total = [...m.values()].reduce((a,b)=>a+b,0);
  if(top[1] / total < 0.8){ console.log(`~ ${hz}: corpus is split (${[...m.entries()].map(([p,c])=>p+"×"+c).join(", ")}) — keeping "${py}"`); continue; }
  const a = `["${hz}","${py}","${en.replace(/"/g,'\\"')}",${lv}]`;
  const b = `["${hz}","${top[0]}","${en.replace(/"/g,'\\"')}",${lv}]`;
  if(out.includes(a)){ out = out.replace(a, b); n++; console.log(`${hz}: ${py} -> ${top[0]}  (${top[1]}/${total} in corpus)`); }
}
writeFileSync("app/vocab.js", out);
console.log(`\naligned ${n}; ${kept} entries the corpus does not contain were left as written`);
