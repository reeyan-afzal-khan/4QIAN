/* fix-readings.mjs — correct word-level pinyin errors in the deck.
 *
 * The corpus romanises a handful of words wrongly, and does so consistently,
 * which is what makes them findable: 照片 is zhàopiàn everywhere in the
 * language but zhào piān in all eleven of its appearances here. Each fix is
 * applied by locating the word in the Chinese and rewriting exactly the
 * syllables that align with it, so an identical syllable elsewhere in the
 * same sentence is untouched.
 *
 * Only words where the shipped reading is wrong rather than merely formal.
 * 爸爸 as "bà bà" and 时候 as "shí hòu" are citation forms — stiff, not
 * incorrect — and are left alone; changing them would churn hundreds of rows
 * to settle a matter of house style.
 */
import {readFileSync, writeFileSync} from "node:fs";
import {SYLLABLE} from "./pinyin.mjs";

export const FIXES = [
  ["行为", "xíng wèi",  "xíng wéi",  "行为 is xíngwéi; wèi is the preposition 为"],
  ["照片", "zhào piān", "zhào piàn", "照片 is zhàopiàn; piān is 影片/唱片"],
  ["之一", "zhī yí",    "zhī yī",    "一 is word-final here, so no sandhi"],
  ["一场", "yì cháng",  "yì chǎng",  "场 is chǎng as a measure word"],
  ["电子", "diàn zi",   "diàn zǐ",   "电子 is diànzǐ, not a neutral-tone 子"],
  ["为了", "wèi liǎo",  "wèi le",    "了 is the particle le"],
  ["部分", "bù fèn",    "bù fen",    "部分 is bùfen"],
  ["差距", "chà jù",    "chā jù",    "差距 is chājù; chà is the adjective 差"],
];

const HAN = /[\u4e00-\u9fff]/;
const path = "app/questions.js";
const src = readFileSync(path, "utf8");
const w = {}; new Function("window", src)(w);
const D = w.__DECK__;

const changes = new Map();      // old pinyin string -> new
let hits = 0;
const tally = new Map(FIXES.map(f => [f[0], 0]));

for(const q of D.q){
  const chars = [...q[8]].filter(c => HAN.test(c));
  const parts = q[9].split(/(\s+)/);
  const idx = []; parts.forEach((t,i) => { if(SYLLABLE.test(t)) idx.push(i); });
  if(chars.length !== idx.length) continue;
  const str = chars.join("");
  let touched = false;

  for(const [word, wrong, right] of FIXES){
    const wrongSyl = wrong.split(" "), rightSyl = right.split(" ");
    let from = 0, at;
    while((at = str.indexOf(word, from)) !== -1){
      const got = wrongSyl.every((s, k) => {
        const tok = parts[idx[at + k]];
        return tok && tok.replace(/[^a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]/gi, "").toLowerCase() === s;
      });
      if(got){
        wrongSyl.forEach((s, k) => {
          const i = idx[at + k];
          parts[i] = parts[i].replace(new RegExp(s, "i"), rightSyl[k]);
        });
        touched = true; hits++; tally.set(word, tally.get(word) + 1);
      }
      from = at + 1;
    }
  }
  if(touched) changes.set(q[9], parts.join(""));
}

console.log([...tally.entries()].map(([k,v]) => `${k}: ${v}`).join("   "));
console.log(`${hits} corrections across ${changes.size} rows`);
for(const [a,b] of [...changes].slice(0,5)) console.log(`  - ${a}\n  + ${b}`);

if(process.argv.includes("--write")){
  let out = src, n = 0;
  for(const [from, to] of changes){
    const needle = JSON.stringify(from);
    if(out.includes(needle)){ out = out.split(needle).join(JSON.stringify(to)); n++; }
  }
  writeFileSync(path, out);
  console.log("written:", n);
}
