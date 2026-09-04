/* word-reading.mjs — how the deck romanises a given word, everywhere it occurs.
 *
 * The diagnostic behind fix-readings.mjs: pass it words and it reports every
 * spelling the corpus uses for each, with counts. A word with one spelling is
 * settled; a word with two is either legitimate sandhi or the error you were
 * looking for.
 *
 *   node scripts/word-reading.mjs 行为 照片 一场
 */
import {readFileSync} from "node:fs";
import {SYLLABLE} from "./pinyin.mjs";
const HAN=/[\u4e00-\u9fff]/;
const w={}; new Function("window", readFileSync("app/questions.js","utf8"))(w);
const D=w.__DECK__;
const rows=[];
for(const q of D.q){
  const c=[...q[8]].filter(x=>HAN.test(x));
  const s=q[9].replace(/[.,!?;:"'“”‘’()（）、，。？！；：]/g," ").split(/\s+/)
              .filter(x=>SYLLABLE.test(x)&&!/^[A-Z0-9]+$/.test(x));
  if(c.length===s.length) rows.push([c,s.map(x=>x.toLowerCase()),q]);
}
const probe = process.argv.slice(2);
for(const word of probe){
  const m=new Map();
  for(const [c,s] of rows){
    const str=c.join(""); let f=0,at;
    while((at=str.indexOf(word,f))!==-1){ const py=s.slice(at,at+word.length).join(" ");
      m.set(py,(m.get(py)||0)+1); f=at+1; }
  }
  console.log(word.padEnd(8), [...m.entries()].sort((a,b)=>b[1]-a[1]).map(([p,n])=>`${p}×${n}`).join("  ") || "(absent)");
}
