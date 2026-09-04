/* vocab-check.mjs — validate the word bank against the corpus.
 *
 * The corpus is the reference for readings: 4,205 of its 4,228 sentences
 * align syllable-for-syllable with their pinyin, so every reading a character
 * legitimately takes in this deck is observable. An entry is only flagged
 * when its syllable is one the corpus never uses for that character, with
 * neutral-tone variants treated as agreeing — "shí hou" and "shí hòu" are the
 * same word, and which one the bank prints is a house-style call, not an error.
 */
import {readFileSync} from "node:fs";
import {learn} from "./pinyin.mjs";

const w = {};
new Function("window", readFileSync("app/questions.js","utf8"))(w);
new Function("window", readFileSync("app/vocab.js","utf8"))(w);
const D = w.__DECK__, V = w.__VOCAB__;
const {map} = learn();

const bare = s => s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/v/g,"u");
const readings = c => new Set([...(map.get(c) || new Map()).keys()]);

const seen = new Set(), dupes = [], malformed = [], wrong = [], unknownChar = [];
const corpus = D.q.map(q => q[8]).join("\u0000");
const unused = [];

for(const e of V.w){
  const [hz, py, en, lv] = e;
  if(!Array.isArray(e) || e.length !== 4 || !hz || !py || !en){ malformed.push(String(hz)); continue; }
  if(!/^[\u4e00-\u9fff]+$/.test(hz)){ malformed.push(hz); continue; }
  if(!Number.isInteger(lv) || lv < 1 || lv > 4){ malformed.push(hz + " (bad level)"); continue; }
  if(seen.has(hz)) dupes.push(hz);
  seen.add(hz);

  const syl = py.trim().split(/\s+/);
  const chars = [...hz];
  if(syl.length !== chars.length){ malformed.push(`${hz} = "${py}" (${syl.length} syllables, ${chars.length} characters)`); continue; }

  chars.forEach((c, i) => {
    const rs = readings(c);
    if(!rs.size){ unknownChar.push(c + " (in " + hz + ")"); return; }
    const mine = bare(syl[i]);
    const ok = [...rs].some(r => bare(r) === mine);
    if(!ok) wrong.push(`${hz}: "${syl[i]}" for ${c} — corpus uses ${[...rs].join("/")}`);
  });
  if(!corpus.includes(hz)) unused.push(hz);
}

const say = (label, list, limit = 80) => {
  console.log(`\n${label}: ${list.length}`);
  list.slice(0, limit).forEach(x => console.log("  " + x));
};
console.log("entries:", V.w.length);
say("duplicates", dupes);
say("malformed", malformed);
say("readings the corpus never uses", wrong);
say("characters absent from the corpus", unknownChar);
say("entries not in any question (fine for answer-only words)", unused, 200);

/* coverage */
const keys = new Set(V.w.map(e => e[0]));
let total = 0, covered = 0;
const missCount = new Map();
for(const q of D.q){
  const s = q[8];
  for(let i = 0; i < s.length; ){
    if(!/[\u4e00-\u9fff]/.test(s[i])){ i++; continue; }
    let hit = 0;
    for(let n = Math.min(4, s.length - i); n >= 1; n--)
      if(keys.has(s.substr(i, n))){ hit = n; break; }
    total += hit || 1;
    if(hit) covered += hit; else missCount.set(s[i], (missCount.get(s[i])||0) + 1);
    i += hit || 1;
  }
}
console.log(`\nsegmentation coverage: ${(covered/total*100).toFixed(1)}% of ${total} characters`);
const miss = [...missCount.entries()].sort((a,b)=>b[1]-a[1]);
console.log("top uncovered:", miss.slice(0,70).map(([c,n])=>c+":"+n).join(" "));
