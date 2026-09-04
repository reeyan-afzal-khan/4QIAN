/* vocab-dedupe.mjs — drop repeated entries from the word bank.
 *
 * The bank was written in passes, and a later pass can re-add a word an
 * earlier one already had. The first spelling wins, because that is the one
 * the earlier passes were validated against; the duplicate is removed from
 * the file textually so the rest of the formatting and the comments that
 * group the list survive.
 */
import {readFileSync, writeFileSync} from "node:fs";

const path = "app/vocab.js";
let src = readFileSync(path, "utf8");

const w = {};
new Function("window", src)(w);

const seen = new Set(), dupes = [];
for(const [hz] of w.__VOCAB__.w){
  if(seen.has(hz)) dupes.push(hz);
  seen.add(hz);
}
if(!dupes.length){ console.log("no duplicates"); process.exit(0); }

let removed = 0;
for(const hz of new Set(dupes)){
  // Every entry is written on one line as ["hz","py","en",lv]
  const rx = new RegExp('\\["' + hz + '","[^"]*","(?:[^"\\\\]|\\\\.)*",\\d\\],?\\s?', "g");
  const hits = [...src.matchAll(rx)];
  if(hits.length < 2){ console.error(`?? ${hz}: found ${hits.length} literal(s), skipping`); continue; }
  // Remove from the back so earlier offsets stay valid.
  for(let i = hits.length - 1; i >= 1; i--){
    const m = hits[i];
    src = src.slice(0, m.index) + src.slice(m.index + m[0].length);
    removed++;
  }
  console.log(`${hz}: kept 1 of ${hits.length}`);
}
writeFileSync(path, src);
console.log(`removed ${removed} duplicate entries`);
