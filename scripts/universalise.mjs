/* universalise.mjs — take the American assumptions out of the question set.
 *
 * The deck was written for a US reader. Most of it travels fine, but a few
 * dozen questions do not: they name American institutions (Congress, the
 * Tonight Show), American sports (a football game is a different game in most
 * of the world), the American school ladder (elementary / junior high /
 * college), and American money. A learner in Jakarta or Lagos or Lisbon reads
 * those as questions about somewhere else.
 *
 * Three kinds of change, in rising order of how much is touched:
 *
 *   EN      the English is rewritten, the Chinese was already neutral. Most
 *           of these are one word: college -> university, where the Chinese
 *           already said 大学.
 *   EN+ZH   both sides are rewritten, because the Chinese carried the same
 *           assumption (橄榄球 is specifically American football; 美元 is
 *           specifically dollars).
 *   GLOBAL  a plain word swap applied everywhere it occurs.
 *
 * The school ladder is handled deliberately rather than mechanically. English
 * gets "primary school" and "secondary school", which read naturally almost
 * everywhere. Chinese keeps 小学 / 初中 / 高中, because those ARE the Chinese
 * terms for those stages — replacing them with a calque would make the
 * Chinese worse to learn from in order to make it match the English more
 * literally, which is the wrong trade for a language app.
 *
 * Pinyin for any rewritten Chinese is generated from the corpus-derived
 * romaniser and printed for review by `--check` before anything is written.
 */
import {readFileSync, writeFileSync} from "node:fs";
import {makeRomaniser} from "./pinyin.mjs";

/* ---- swaps applied to every question that contains them ---- */
export const GLOBAL = [
  [/\bcollege\b/g, "university"], [/\bCollege\b/g, "University"],
  [/\belementary school\b/gi, "primary school"],
  [/\bjunior high(?: school)?\b/gi, "lower secondary school"],
  [/\bhigh school\b/gi, "secondary school"], [/\bHigh School\b/g, "Secondary School"],
  [/\bcell ?phone\b/gi, "phone"],
  [/\bmovie theater\b/gi, "cinema"],
  [/\bgas station\b/gi, "petrol station"],
  [/\bgrocery store\b/gi, "supermarket"],
  [/\bdrugstore\b/gi, "pharmacy"],
  [/\bsidewalk\b/gi, "pavement"],
  [/\bgarbage\b/gi, "rubbish"],
  [/\bzip code\b/gi, "postcode"],
];

/* ---- per-question rewrites ----
   [rank, english, chinese|null]   null = the Chinese was already fine  */
export const FIX = [

  /* --- American sport, which is not the sport most readers mean --- */
  [30, "What teams do you follow, at any level?",
       "你会关注哪些球队？不管是业余的还是职业的。"],
  [195, "Do you prefer traditional team sports or extreme sports like BMX, motocross, hang gliding and snowboarding?",
        "传统团体运动和极限运动（小轮车、越野摩托、悬挂滑翔、单板滑雪）相比，你更喜欢哪一类？"],
  [519, "What is the best finish to a match you have ever seen?",
        "你看过结局最精彩的一场比赛是什么？"],
  [530, "How many teams should a national championship play-off include to settle who is best?",
        "你觉得全国冠军赛的季后赛应该有多少支球队，才能合理决出第一名？"],
  [956, "In a team sport you know well, which position would you most want to play?",
        "在你熟悉的一项团体运动里，你最想打什么位置？"],
  [957, "Why is football far more popular in some countries than in others?",
        "为什么足球在有些国家远比在另一些国家受欢迎？"],
  [840, "If you could trade work skills the way children swap collectable cards, who would you trade with and for what?",
        "如果工作技能能像小孩交换卡片一样交换，你最想和谁换、换什么技能？"],
  [452, "How old should an athlete be before clubs or universities can recruit them?",
        "你觉得运动员到几岁，俱乐部或大学才适合开始招募他们？"],
  [721, "Should student athletes be paid?", "你觉得学生运动员应该获得报酬吗？"],

  /* --- American media and places --- */
  [81, "Who do you think is the best late-night talk show host?",
       "你觉得深夜脱口秀的主持人里谁最好？"],
  [310, "Who is the most overrated actor working today?",
        "你觉得当今哪位演员最被高估？"],
  [2137, "If you had to live in one of the two biggest cities in your country, which would you choose?",
         "如果必须住在你们国家最大的两座城市之一，你会选哪座？"],

  /* --- American civics --- */
  [1307, "What is your overall view of your country's armed forces?",
         "你对本国军队的总体看法是什么？"],
  [1812, "What is the most regrettable event in your country's history?",
         "你觉得本国历史上最令人遗憾的事件是什么？"],
  [3822, "What would your list of priorities be for your country's parliament?",
         "如果由你决定，你会给国家议会列出哪些优先事项？"],
  [3870, "Would you rather be a research scientist or a member of parliament?",
         "你宁愿当科研人员，还是当议员？"],
  [3914, "What do you think about limiting how many terms a politician can serve?",
         "你怎么看限制政治人物的任期次数？"],
  [3946, "When the government and the legislature are held by opposing parties, do you think they cooperate?",
         "当政府和立法机构分属不同政党时，你觉得他们能合作吗？"],

  /* --- money, stated as amounts rather than a currency --- */
  [2193, "What is actually worth buying in a discount shop?",
         "在折扣店里，有哪些东西特别值得买？"],
  [2239, "What would you say or do if someone offered you a week's pay to shave your head?",
         "如果有人给你一周的工资让你剃光头，你会答应吗？"],
  [2241, "What would you say or do if you were given a fortune to spend on helping other people?",
         "如果你得到一大笔钱，只能用来帮助别人，你会怎么用？"],
  [2371, "What do you own that is worth almost nothing but that you would not sell at any price?",
         "你拥有的什么东西几乎不值钱，却无论出多少钱你都不会卖？"],
  [2461, "What would you do if you were handed a month's wages to spend on anything?",
         "如果有一个月的工资可以随便花，你会买什么或做什么？"],
  [2483, "Would you rather be rich beyond counting but exiled from your homeland, or stay and have little money?",
         "你宁愿富可敌国但被永久驱逐出祖国，还是留在祖国但没什么钱？"],
  [2835, "What would you do if you earned a fortune every single day? How would your life change?",
         "如果你每天都能赚到一大笔钱，你会怎么生活？生活会发生什么变化？"],

  /* --- school stages, where the English needed more than a word swap --- */
  [417, "What were your school's colours, emblem, chants and song?",
        "你中学时的校色、校徽、助威口号和校歌分别是什么？"],
  [1014, "What activities did you take part in outside lessons at secondary school?",
         "中学期间你参加过哪些课外活动？"],
  [1107, "Should students be required by law to be fluent in a second language before they finish school?",
         "你赞成法律规定学生必须至少熟练掌握一门外语才能毕业吗？"],
  [4014, "Would you take out a loan to study? How much student debt is a reasonable amount to carry?",
         "为了上大学，你愿意申请贷款吗？你觉得一个人背多少学生贷款算合理？"],
  [480, "Could you see yourself retiring to a university town?", null],

  /* --- misc phrasing that only reads naturally in one country --- */
  [237, "What is your favourite brand of biscuit? Is there one that was discontinued that you wish would come back?", null],
  [1598, "What is always in your bin?", null],
];

/* ---------------------------------------------------------------- */
const path = "app/questions.js";
const src = readFileSync(path, "utf8");
const w = {}; new Function("window", src)(w);
const D = w.__DECK__;
const byRank = new Map(D.q.map(q => [q[0], q]));
const romanise = makeRomaniser();

const edits = [];          // {rank, field, from, to}
const seenRank = new Set();

for(const [rank, en, zh] of FIX){
  const q = byRank.get(rank);
  if(!q){ console.error("!! no question with rank", rank); continue; }
  if(seenRank.has(rank)) console.error("!! duplicate fix for rank", rank);
  seenRank.add(rank);
  if(en && en !== q[7]) edits.push({rank, field: "en", from: q[7], to: en});
  if(zh && zh !== q[8]){
    edits.push({rank, field: "zh", from: q[8], to: zh});
    edits.push({rank, field: "py", from: q[9], to: romanise(zh)});
  }
}

/* global swaps, skipping questions already rewritten above */
let globalHits = 0;
for(const q of D.q){
  if(seenRank.has(q[0])) continue;
  let en = q[7];
  for(const [rx, to] of GLOBAL) en = en.replace(rx, to);
  if(en !== q[7]){ edits.push({rank: q[0], field: "en", from: q[7], to: en}); globalHits++; }
}

if(process.argv.includes("--check")){
  for(const e of edits){
    if(e.field === "en") console.log(`Q${e.rank} EN\n  - ${e.from}\n  + ${e.to}`);
    if(e.field === "zh") console.log(`Q${e.rank} ZH\n  - ${e.from}\n  + ${e.to}`);
    if(e.field === "py") console.log(`Q${e.rank} PY\n  - ${e.from}\n  + ${e.to}\n`);
  }
}
console.log(`\n${FIX.length} targeted rewrites, ${globalHits} questions touched by word swaps, ${edits.length} field edits`);

if(process.argv.includes("--write")){
  let out = src, applied = 0, missed = [];
  for(const e of edits){
    const needle = JSON.stringify(e.from);
    if(!out.includes(needle)){ missed.push(`Q${e.rank} ${e.field}`); continue; }
    // Replace only the first occurrence: two questions can share an English
    // string only if the corpus has duplicates, and it does not.
    out = out.replace(needle, () => JSON.stringify(e.to));
    applied++;
  }
  writeFileSync(path, out);
  console.log(`written: ${applied} edits applied` + (missed.length ? `, MISSED ${missed.join(", ")}` : ""));
}
