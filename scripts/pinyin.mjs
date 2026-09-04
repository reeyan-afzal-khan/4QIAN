/* pinyin.mjs — a hanzi -> pinyin map learned from the shipped corpus.
 *
 * The deck already contains 4,228 Chinese sentences with hand-checked,
 * tone-marked pinyin aligned syllable-for-syllable. That is a better source
 * for this app than a generic table: it is the exact vocabulary, in the exact
 * readings, that these questions use. So rather than bundle a dictionary, the
 * map is derived from the corpus and any new Chinese written for the app is
 * romanised from it.
 *
 * Ambiguous characters (多音字) keep every reading seen, ranked by frequency,
 * plus a table of the phrases where the minority reading wins.
 */
import {readFileSync} from "node:fs";

const HAN = /[\u4e00-\u9fff]/;
/* Is this token a pinyin syllable?
 *
 * The test has to include the tone-marked vowels, not just ASCII: 阿 romanises
 * to "ā" and 饿 to "è", and a naive /[a-z]/i drops both. That silently knocks
 * a syllable out of the count and misaligns everything after it in the
 * sentence — which is exactly the bug that made five model answers look
 * broken when they were fine. One definition, exported, so the tools that
 * count syllables cannot drift apart again. */
export const SYLLABLE = /[a-zA-ZüÜāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/;

export function learn(deckPath = "app/questions.js"){
  const w = {};
  new Function("window", readFileSync(deckPath, "utf8"))(w);
  const D = w.__DECK__;
  const map = new Map();          // char -> Map(syllable -> count)
  const phrase = new Map();       // multi-char run -> pinyin, for exact reuse
  let aligned = 0, skipped = 0;

  for(const q of D.q){
    const zh = q[8], py = q[9];
    const chars = [...zh].filter(c => HAN.test(c));
    // Strip the punctuation the pinyin carries, then split into syllables.
    const syl = py.replace(/[.,!?;:"'“”‘’()（）、，。？！；：]/g, " ")
                  .split(/\s+/).filter(Boolean)
                  .filter(s => SYLLABLE.test(s));
    // Latin/number tokens appear in both sides; drop the ones that are not
    // syllables so the two sequences line up.
    const sylClean = syl.filter(s => !/^[A-Z0-9]+$/.test(s));
    if(chars.length !== sylClean.length){ skipped++; continue; }
    aligned++;
    for(let i = 0; i < chars.length; i++){
      const c = chars[i], s = sylClean[i].toLowerCase();
      if(!map.has(c)) map.set(c, new Map());
      const m = map.get(c);
      m.set(s, (m.get(s) || 0) + 1);
    }
    // Remember whole runs of hanzi with their pinyin, so a known phrase keeps
    // the reading it had in the corpus instead of being rebuilt character by
    // character and losing a 多音字 in the process.
    let run = "", runPy = [], k = 0;
    for(const ch of zh){
      if(HAN.test(ch)){ run += ch; runPy.push(sylClean[k++]); }
      else if(run){ if(run.length > 1) phrase.set(run, runPy.join(" ")); run = ""; runPy = []; }
    }
    if(run.length > 1) phrase.set(run, runPy.join(" "));
  }

  const best = new Map();
  for(const [c, m] of map){
    best.set(c, [...m.entries()].sort((a,b) => b[1]-a[1])[0][0]);
  }
  return {best, map, phrase, aligned, skipped};
}

/* Readings this corpus gets wrong when a character is romanised out of
   context, keyed by the phrase that forces the minority reading. */
export const OVERRIDE = [
  /* Single-character fallbacks for every character the table would otherwise
     only be able to read inside one particular phrase. Without these, a word
     the table has not seen — 随便扫 rather than 打扫 — leaves the character
     in the pinyin unromanised. */
  ["锻","duàn"], ["炼","liàn"], ["京","jīng"], ["寓","yù"], ["鸡","jī"],
  ["蔬","shū"], ["川","chuān"], ["椒","jiāo"], ["扫","sǎo"], ["唯","wéi"],
  ["宏","hóng"], ["沙","shā"], ["咪","mī"], ["恰","qià"], ["驳","bó"],
  ["虽","suī"], ["漂","piào"], ["亮","liàng"], ["箭","jiàn"], ["侄","zhí"],
  /* --- readings the longer model answers introduced ---
     Phrases first, for anything whose reading depends on the word it is in:
     笼统 is lǒngtǒng and not the lóng of 笼子; 朝 is cháo facing outward and
     zhāo in 朝夕; 膊, 璃 and 惚 are neutral inside their word and toned alone. */
  ["悄悄","qiāo qiāo"], ["胳膊","gē bo"], ["阿姨","ā yí"], ["敷衍","fū yǎn"],
  ["玻璃","bō li"], ["恍惚","huǎng hū"], ["瓢泼","piáo pō"], ["踉跄","liàng qiàng"],
  ["反馈","fǎn kuì"], ["松弛","sōng chí"], ["笼统","lǒng tǒng"],
  ["朝外","cháo wài"], ["朝阳","cháo yáng"], ["朝夕","zhāo xī"],
  ["单薄","dān bó"], ["罕见","hǎn jiàn"], ["额外","é wài"],
  ["心不在焉","xīn bú zài yān"], ["信誓旦旦","xìn shì dàn dàn"], ["智慧","zhì huì"],
  ["残渣","cán zhā"], ["门槛","mén kǎn"], ["包裹","bāo guǒ"],
  ["添砖加瓦","tiān zhuān jiā wǎ"], ["我们俩","wǒ men liǎ"], ["叙述","xù shù"],
  ["铅笔","qiān bǐ"], ["空旷","kōng kuàng"], ["邮筒","yóu tǒng"],
  ["扁桃体","biǎn táo tǐ"], ["捡到","jiǎn dào"], ["一瘸一拐","yì qué yì guǎi"],
  ["褪色","tuì sè"], ["死胡同","sǐ hú tòng"], ["过滤","guò lǜ"], ["遮住","zhē zhù"],
  ["乘以","chéng yǐ"], ["转悠","zhuàn you"], ["伸手","shēn shǒu"], ["链接","liàn jiē"],
  ["摩擦","mó cā"], ["礁石","jiāo shí"], ["大纲","dà gāng"], ["露馅","lòu xiàn"],
  ["恭喜","gōng xǐ"], ["筛选","shāi xuǎn"], ["出席","chū xí"], ["厘米","lí mǐ"],
  ["卷帘门","juǎn lián mén"], ["报刊亭","bào kān tíng"], ["报刊","bào kān"],
  ["逢人","féng rén"], ["喂食","wèi shí"], ["踏实","tā shi"],
  ["来龙去脉","lái lóng qù mài"], ["稍微","shāo wēi"], ["相框","xiàng kuàng"],
  ["烤面包机","kǎo miàn bāo jī"], ["一连串","yì lián chuàn"], ["罐头","guàn tou"],
  ["盲测","máng cè"], ["稀有","xī yǒu"], ["赶上","gǎn shàng"], ["耳朵","ěr duo"],
  ["雾墙","wù qiáng"], ["瞥一眼","piē yì yǎn"], ["所剩不多","suǒ shèng bù duō"],
  /* Then the plain single-reading characters, as a fallback for any other
     phrase these answers put them in. */
  ["赶","gǎn"], ["悄","qiāo"], ["煮","zhǔ"], ["砸","zá"], ["胳","gē"], ["膊","bó"],
  ["阿","ā"], ["稀","xī"], ["盲","máng"], ["烂","làn"], ["锅","guō"], ["蔫","niān"],
  ["罐","guàn"], ["涨","zhǎng"], ["串","chuàn"], ["烤","kǎo"], ["垮","kuǎ"],
  ["框","kuàng"], ["稍","shāo"], ["摸","mō"], ["脉","mài"], ["踏","tà"], ["喂","wèi"],
  ["饿","è"], ["聋","lóng"], ["逢","féng"], ["栋","dòng"], ["刊","kān"], ["亭","tíng"],
  ["帘","lián"], ["厘","lí"], ["席","xí"], ["筛","shāi"], ["敷","fū"], ["衍","yǎn"],
  ["剩","shèng"], ["恭","gōng"], ["馅","xiàn"], ["纲","gāng"], ["搁","gē"],
  ["礁","jiāo"], ["擦","cā"], ["弛","chí"], ["链","liàn"], ["朝","cháo"], ["伸","shēn"],
  ["夹","jiā"], ["窄","zhǎi"], ["笼","lóng"], ["悠","yōu"], ["遛","liù"], ["乘","chéng"],
  ["黏","nián"], ["遮","zhē"], ["趟","tàng"], ["滤","lǜ"], ["胡","hú"], ["褪","tuì"],
  ["瘸","qué"], ["拐","guǎi"], ["捡","jiǎn"], ["缝","féng"], ["扁","biǎn"], ["桃","táo"],
  ["迁","qiān"], ["踉","liàng"], ["跄","qiàng"], ["膜","mó"], ["沾","zhān"], ["渣","zhā"],
  ["粘","zhān"], ["槛","kǎn"], ["馈","kuì"], ["裹","guǒ"], ["瓦","wǎ"], ["歪","wāi"],
  ["夕","xī"], ["俩","liǎ"], ["叙","xù"], ["趴","pā"], ["铅","qiān"], ["玻","bō"],
  ["璃","lí"], ["旷","kuàng"], ["晴","qíng"], ["堵","dǔ"], ["雾","wù"], ["额","é"],
  ["罕","hǎn"], ["瞥","piē"], ["恍","huǎng"], ["惚","hū"], ["筒","tǒng"], ["瓢","piáo"],
  ["泼","pō"], ["慧","huì"], ["誓","shì"], ["焉","yān"], ["腰","yāo"], ["薄","bó"],
  ["数到","shǔ dào"], ["数一数","shǔ yī shǔ"],
  /* readings the deck never needed but the model answers do */
  ["锻炼","duàn liàn"], ["奶奶","nǎi nai"], ["奶","nǎi"], ["汤","tāng"],
  ["挺","tǐng"], ["九","jiǔ"], ["京都","jīng dū"], ["公寓","gōng yù"],
  ["鸡蛋","jī dàn"], ["蔬菜","shū cài"], ["川菜","chuān cài"], ["辣椒油","là jiāo yóu"],
  ["打扫","dǎ sǎo"], ["盏","zhǎn"], ["唯一","wéi yī"], ["宏大","hóng dà"],
  ["沙发","shā fā"], ["咪咪","mī mī"], ["恰恰","qià qià"], ["恰好","qià hǎo"],
  ["挪","nuó"], ["反驳","fǎn bó"], ["堆","duī"], ["虽然","suī rán"],
  ["饱","bǎo"], ["兔子","tù zi"], ["兔兔","tù tù"], ["兔","tù"],
  ["漂亮","piào liang"], ["猜","cāi"], ["牧羊犬","mù yáng quǎn"], ["羊","yáng"],
  ["犬","quǎn"], ["箭头","jiàn tóu"], ["扇","shàn"], ["踢","tī"],
  ["侄女","zhí nǚ"], ["秒","miǎo"], ["勺","sháo"], ["灯塔","dēng tǎ"],
  ["恐怖分子","kǒng bù fèn zǐ"], ["分子","fèn zǐ"], ["官邸","guān dǐ"],
  ["熟悉","shú xī"], ["卡片","kǎ piàn"], ["俱乐部","jù lè bù"],
  ["谁","shuí"], ["第一名","dì yī míng"], ["之一","zhī yī"], ["团体","tuán tǐ"],
  ["小轮车","xiǎo lún chē"], ["脱口秀","tuō kǒu xiù"], ["议员","yì yuán"],
  ["立法","lì fǎ"], ["军队","jūn duì"], ["富可敌国","fù kě dí guó"],
  ["校徽","xiào huī"], ["剃光头","tì guāng tóu"], ["驱逐","qū zhú"],
  ["长大","zhǎng dà"], ["当作","dàng zuò"], ["看作","kàn zuò"],
  ["照片","zhào piàn"], ["东西","dōng xi"], ["一部分","yí bù fen"],
  ["家长","jiā zhǎng"], ["校长","xiào zhǎng"], ["擅长","shàn cháng"],
  ["长处","cháng chu"], ["相处","xiāng chǔ"], ["处理","chǔ lǐ"], ["到处","dào chù"],
  ["好处","hǎo chù"], ["爱好","ài hào"], ["好奇","hào qí"], ["正好","zhèng hǎo"],
  ["喜好","xǐ hào"], ["教书","jiāo shū"], ["教学","jiào xué"],
  ["分数","fēn shù"], ["身分","shēn fèn"], ["部分","bù fen"], ["充分","chōng fèn"],
  ["多少","duō shao"], ["很少","hěn shǎo"], ["减少","jiǎn shǎo"], ["青少年","qīng shào nián"],
  ["中间","zhōng jiān"], ["其中","qí zhōng"], ["中学","zhōng xué"],
  ["相似","xiāng sì"], ["相比","xiāng bǐ"], ["相信","xiāng xìn"], ["照相","zhào xiàng"],
  ["假期","jià qī"], ["度假","dù jià"], ["假装","jiǎ zhuāng"],
  ["曾经","céng jīng"], ["尽量","jǐn liàng"], ["尽管","jǐn guǎn"],
  ["传统","chuán tǒng"], ["宣传","xuān chuán"], ["传记","zhuàn jì"],
  ["背景","bèi jǐng"], ["背后","bèi hòu"], ["血","xuè"],

  ["为什么","wèi shén me"], ["因为","yīn wèi"], ["认为","rèn wéi"], ["以为","yǐ wéi"],
  ["成为","chéng wéi"], ["作为","zuò wéi"], ["行为","xíng wéi"], ["为了","wèi le"],
  ["还是","hái shì"], ["还有","hái yǒu"], ["还会","hái huì"], ["归还","guī huán"],
  ["得到","dé dào"], ["觉得","jué de"], ["记得","jì de"], ["值得","zhí de"],
  ["得意","dé yì"], ["不得不","bù dé bù"], ["长大","zhǎng dà"], ["成长","chéng zhǎng"],
  ["长时间","cháng shí jiān"], ["很长","hěn cháng"], ["会不会","huì bú huì"],
  ["重要","zhòng yào"], ["重复","chóng fù"], ["重新","chóng xīn"], ["严重","yán zhòng"],
  ["音乐","yīn yuè"], ["快乐","kuài lè"], ["乐趣","lè qù"], ["教育","jiào yù"],
  ["教会","jiào huì"], ["朋友","péng yǒu"], ["地方","dì fāng"], ["方便","fāng biàn"],
  ["便宜","pián yi"], ["银行","yín háng"], ["行业","háng yè"], ["一行","yì háng"],
  ["旅行","lǚ xíng"], ["空间","kōng jiān"], ["有空","yǒu kòng"], ["空闲","kòng xián"],
  ["种类","zhǒng lèi"], ["一种","yì zhǒng"], ["种植","zhòng zhí"], ["数学","shù xué"],
  ["数字","shù zì"], ["无数","wú shù"], ["数一数","shǔ yī shǔ"], ["睡觉","shuì jiào"],
  ["感觉","gǎn jué"],
];

/* ------------------------------------------------------------------
   romanise() — pinyin for Chinese written for this app.
   ------------------------------------------------------------------
   Longest match first against, in order of trust:
     1. the vocabulary bank, whose readings are hand-checked
     2. whole runs remembered from the corpus
     3. the per-character majority reading
   then the two sandhi rules that a per-character table cannot express:
   一 and 不 change tone according to what follows them.
*/
const NEUTRAL = /[^āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/;
const toneOf = s => {
  if(/[āēīōūǖ]/.test(s)) return 1;
  if(/[áéíóúǘ]/.test(s)) return 2;
  if(/[ǎěǐǒǔǚ]/.test(s)) return 3;
  if(/[àèìòùǜ]/.test(s)) return 4;
  return 0;                       // neutral
};

export function makeRomaniser(deckPath = "app/questions.js", vocabPath = "app/vocab.js"){
  const {best, phrase} = learn(deckPath);
  const words = new Map();
  if(vocabPath){
    const w = {};
    new Function("window", readFileSync(vocabPath, "utf8"))(w);
    for(const [hz, py] of w.__VOCAB__.w) words.set(hz, py);
  }
  const over = new Map(OVERRIDE);
  // OVERRIDE first: these are the readings a frequency table gets wrong.
  const lookup = s => over.get(s) || words.get(s) || phrase.get(s) || null;

  return function romanise(zh){
    const out = [];                     // [syllable, sourceChar]
    for(let i = 0; i < zh.length; ){
      const ch = zh[i];
      if(!HAN.test(ch)){
        /* The em dash is written doubled in Chinese (——) and singly in a
           romanisation, spaced both sides. Consume the pair at once, or it is
           emitted twice and then padded on one side only. */
        if(ch === "—"){
          while(zh[i] === "—") i++;
          out.push([" — ", null, true]);
          continue;
        }
        // other punctuation and Latin pass through, mapped to what pinyin uses
        const map = {"，":", ", "。":". ", "？":"?", "！":"!", "、":", ",
                     "：":": ", "；":"; ", "（":" (", "）":") ", "“":" \u201c", "”":"\u201d "};
        out.push([map[ch] !== undefined ? map[ch] : ch, null, true]);
        i++; continue;
      }
      let hit = null, n = 0;
      for(n = Math.min(6, zh.length - i); n >= 1; n--){
        const seg = zh.substr(i, n);
        if(!/^[\u4e00-\u9fff]+$/.test(seg)) continue;
        hit = lookup(seg);
        if(hit) break;
      }
      if(hit){
        const syl = hit.trim().split(/\s+/);
        const chars = [...zh.substr(i, n)];
        // Locked: a multi-character hit is a checked reading, and the sandhi
        // pass below must not second-guess it — 之一 is zhī yī whatever follows,
        // and 第一名 is dì yī míng, not dì yì míng.
        // Only a MULTI-character hit is locked. A single-character entry is
        // just the citation form of that character and still needs the sandhi.
        syl.forEach((s, k) => out.push([s, chars[k], n > 1]));
        i += n;
      }else{
        out.push([best.get(ch) || ch, ch, false]);
        i++;
      }
    }

    /* sandhi: 一 and 不 take their tone from the syllable after them */
    for(let k = 0; k < out.length; k++){
      const [syl, ch, locked] = out[k];
      if(locked) continue;
      if(ch !== "一" && ch !== "不") continue;
      let nxt = null;
      for(let j = k + 1; j < out.length; j++){ if(out[j][1]){ nxt = out[j][0]; break; } }
      const t = nxt ? toneOf(nxt) : 0;
      if(ch === "不") out[k][0] = t === 4 ? "bú" : "bù";
      else if(ch === "一"){
        // A bare 一 at the end, or 一 read as the numeral itself, stays yī.
        if(!nxt) out[k][0] = "yī";
        else out[k][0] = t === 4 ? "yí" : t === 0 ? "yī" : "yì";
      }
    }

    let s = "";
    for(let k = 0; k < out.length; k++){
      const [tok, ch] = out[k];
      if(ch === null){ s = s.replace(/ $/, "") + tok; continue; }
      if(s && !/[\s(\u201c]$/.test(s)) s += " ";
      s += tok;
    }
    return s.replace(/\s+/g, " ").replace(/\s+([,.?!;:])/g, "$1").trim();
  };
}
