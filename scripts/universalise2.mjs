/* universalise2.mjs — the second sweep.
 *
 * The first pass's scan missed anything whose match ended on a full stop:
 * "\bU\.S\.\b" cannot fire before a space, because a word boundary needs a
 * word character on the other side of it. These eight are the ones that
 * slipped through, all of them the same shape — a civic question written as
 * though there were only one country it could be about.
 */
import {readFileSync, writeFileSync} from "node:fs";
import {makeRomaniser} from "./pinyin.mjs";

const FIX = [
  [1961, "How do you feel about giving the armed forces authority to assist police in counter-terrorism work?",
         "你怎么看让军方协助警方开展反恐工作的做法？"],
  [2547, "What would you do if terrorists began attacking cities in your country regularly?",
         "如果恐怖分子开始频繁袭击你们国家的城市，你会怎样改变自己的生活或应对？"],
  [3487, "Should the tax system where you live be simplified?",
         "你觉得你所在国家的税法应该大幅简化吗？"],
  [3511, "Are there countries your government should try to re-establish diplomatic relations with?",
         "你觉得你们国家应该尝试和哪些国家恢复外交关系吗？"],
  [3683, "Do you think the gap between rich and poor is widening where you live? What could keep it from widening?",
         "你觉得你所在国家的贫富差距正在扩大吗？可以做些什么阻止它继续扩大？"],
  [3873, "If your head of state's official residence were rebuilt somewhere new, where should it go?",
         "如果重新为国家元首设计官邸，你觉得哪里会是一个很棒的新地点？"],
  [3990, "How do you feel about governments increasing surveillance of their own citizens?",
         "你怎么看政府加强对本国公民的监控？"],
  [4060, "What should be done to control government spending and cut waste?", null],
];

const path = "app/questions.js";
const src = readFileSync(path, "utf8");
const w = {}; new Function("window", src)(w);
const byRank = new Map(w.__DECK__.q.map(q => [q[0], q]));
const romanise = makeRomaniser();

const edits = [];
for(const [rank, en, zh] of FIX){
  const q = byRank.get(rank);
  if(!q){ console.error("!! missing", rank); continue; }
  if(en !== q[7]) edits.push([q[7], en, `Q${rank} EN`]);
  if(zh && zh !== q[8]){
    edits.push([q[8], zh, `Q${rank} ZH`]);
    edits.push([q[9], romanise(zh), `Q${rank} PY`]);
  }
}
for(const [from, to, tag] of edits) console.log(`${tag}\n  - ${from}\n  + ${to}`);

if(process.argv.includes("--write")){
  let out = src, n = 0, missed = [];
  for(const [from, to, tag] of edits){
    const needle = JSON.stringify(from);
    if(!out.includes(needle)){ missed.push(tag); continue; }
    out = out.replace(needle, () => JSON.stringify(to)); n++;
  }
  writeFileSync(path, out);
  console.log(`\nwritten: ${n}` + (missed.length ? ` MISSED ${missed}` : ""));
}
