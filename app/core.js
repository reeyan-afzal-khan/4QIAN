/* core.js — the deck itself: setup, the session loop, browse and saved. */

const DATA = window.__DECK__;
window.DATA = DATA;
const HC = ["--h1","--h2","--h3","--h4","--h5"];
const STAGE_NAME = ["Icebreaker","Warm-up","Getting to know","Deep","Intimate / Debate"];
const SENS_NAME = ["Safe","Light","Personal","Sensitive","Very sensitive"];
const GATE_TEXT = {
  4:"The next level includes money, health, faith, politics and past relationships. Sent cold to somebody you met an hour ago, these read as an interrogation rather than a conversation.",
  5:"The last level includes sex, addiction, grief and loss. Only open this with somebody who already trusts you, or where you have both explicitly agreed to debate it."
};
// q = [rank, score, sens, stage, catIdx, frameIdx, isPrompt, en, zh, py]
const R=0,SC=1,SE=2,ST=3,CA=4,FR=5,PR=6,EN=7,ZH=8,PY=9;

/* The frequency score is the one number in the data nothing used to surface.
   These bands are what the dashboard reports coverage against. */
const BANDS = [
  {lo:90, hi:100, nm:"90–100 · core",      why:"The questions you will actually hear"},
  {lo:80, hi:89,  nm:"80–89 · very common",why:"Everyday small talk"},
  {lo:70, hi:79,  nm:"70–79 · common",     why:"Turns up regularly"},
  {lo:50, hi:69,  nm:"50–69 · occasional", why:"Depends who you are with"},
  {lo:25, hi:49,  nm:"25–49 · uncommon",   why:"Specific situations"},
  {lo:0,  hi:24,  nm:"0–24 · rare",        why:"The long tail"}
];
const bandOf = s => BANDS.findIndex(b => s >= b.lo && s <= b.hi);

/* Every skin declares whether it is a dark or a light ground, because the
   picker groups on it and "follow the system" needs to know which half of
   the list it is allowed to choose from. */
const SKINS = [
  {id:"hazard",   nm:"Hazard",    dark:true,  bg:"#08080A", ac:"#FFCE1F",
   rp:["#7D7869","#9C8433","#D9A81C","#FFC220","#FF7A18"]},
  {id:"gruvbox",  nm:"Gruvbox",   dark:true,  bg:"#1D2021", ac:"#FABD2F",
   rp:["#928374","#83A598","#8EC07C","#FABD2F","#FE8019"]},
  {id:"ember",    nm:"Ember",     dark:true,  bg:"#000000", ac:"#FF6B18",
   rp:["#7A6A62","#A85A20","#E2731A","#FF6B18","#FFB03A"]},
  {id:"discord",  nm:"Discord",   dark:true,  bg:"#1E1F22", ac:"#5865F2",
   rp:["#949BA4","#23A559","#5865F2","#EB459F","#F0B232"]},
  {id:"blurple",  nm:"Blurple",   dark:true,  bg:"#161622", ac:"#7A6BFF",
   rp:["#8B8BA7","#43C59E","#7A6BFF","#E86AC4","#F5B944"]},
  {id:"terminal", nm:"Terminal",  dark:true,  bg:"#050805", ac:"#4AE84A",
   rp:["#6E8A6A","#4A8A4A","#35C335","#4AE84A","#B6FF7A"]},
  {id:"blueprint",nm:"Blueprint", dark:true,  bg:"#0A1220", ac:"#4FC3F7",
   rp:["#5B7A99","#3E86AC","#35A8D4","#4FC3F7","#A8E6FF"]},
  {id:"gruvbox-light", nm:"Gruvbox Light", dark:false, bg:"#FBF1C7", ac:"#AF3A03",
   rp:["#928374","#427B58","#B57614","#AF3A03","#9D0006"]},
  {id:"sky",      nm:"Sky",       dark:false, bg:"#F2F5F9", ac:"#1573E6",
   rp:["#7C8AA0","#1FA97A","#1573E6","#7A4FE0","#E0518A"]},
  {id:"cinnabar", nm:"Cinnabar",  dark:false, bg:"#EFEBE0", ac:"#C1272D",
   rp:["#8A8270","#B08A3E","#C46A2A","#C1272D","#7E1014"]},
  {id:"sounding", nm:"Sounding",  dark:false, bg:"#EEF2F4", ac:"#2F7D8C",
   rp:["#2F7D70","#2F6E8C","#3D5A8C","#4A4080","#5E3260"]},
  {id:"daylight", nm:"Daylight",  dark:false, bg:"#F4F5F7", ac:"#3D3BC4",
   rp:["#767D8A","#6A72B4","#5055B8","#3D3BC4","#6B2894"]},
];
const skinOf = id => SKINS.find(x => x.id === id) || SKINS[0];

const $ = s => document.querySelector(s);
const LS = "4qian.v1";
const LS_OLD = "cdg.v3";          // pre-rename key; read once, then retired
let S = {
  deck:0, depth:1, sensOK:3, mode:"both", pinyin:true, frame:true,
  score:true, track:true,
  muted:[], seen:[], saved:[], asked:0, topics:[], deepest:1, skin:"hazard",
  cur:null, revealed:false, running:false, turn:0, view:"setup",
  /* added after the first release; every one of these has to survive an old
     settings blob that predates it, which is why they are plain defaults
     merged over rather than read positionally anywhere. */
  autoTheme:false, skinDark:"hazard", skinLight:"gruvbox-light",
  speak:"off", autoSpeak:false, rate:0.85, text:"m", goal:0,
  customIds:null, customName:"",
  vocab:true, answer:true, studyOpen:false,
  nameA:"", nameB:"", toured:false,
  /* The app is a sidecar to a chat window, one stranger at a time, so the
     live conversation is a person rather than a mode. `partner` is who you
     are talking to right now; the record keeps a list of everyone. */
  partner:"", learning:"zh"
};
try{
  const raw = localStorage.getItem(LS) || localStorage.getItem(LS_OLD);
  if(raw) Object.assign(S, JSON.parse(raw));
}catch(e){}
S.running = false; S.view = "setup";
const save = () => {
  try{
    localStorage.setItem(LS, JSON.stringify(S));
    localStorage.removeItem(LS_OLD);   // settings now live under the new key
  }catch(e){}
};

/* ---------------- who you are talking to ----------------
 *
 * `seen` used to be one global set, which was right for a deck two people
 * share and wrong for this: a good icebreaker should come back for the next
 * stranger and should never come back for the same one. It is now the seen
 * list of whoever is in the partner box, loaded from the record and written
 * back to it. With nobody named it falls back to the old global list, so the
 * app still works for someone who does not want to name anyone.
 */
let PID = -1;                       // person id in the record, -1 for nobody
let seen = new Set(S.seen);

function setPartner(name){
  S.partner = String(name || "").trim().slice(0, 24);
  PID = S.partner ? TRACK.personId(S.partner) : -1;
  seen = new Set(PID >= 0 ? TRACK.seenBy(PID) : S.seen);
  save();
}
/* Called wherever a question is consumed. Writes to whichever list is live. */
function markSeen(rank){
  seen.add(rank);
  if(PID >= 0) TRACK.markSeen(PID, rank);
  else S.seen = [...seen].slice(-4300);
}

const muted = new Set(S.muted);
const saved = new Set(S.saved);
const byRank = new Map(DATA.q.map(q => [q[R], q]));

/* A deck built on the spot from a Browse filter or the saved list. It has
   the same shape as a shipped deck — a name, a rationale and a list of
   indices into DATA.q — so nothing downstream needs to know the difference.
   S.deck is -1 while it is the live one. */
const CUSTOM = {name:"Your selection", why:"Built from what you picked.", ids:[]};
if(Array.isArray(S.customIds) && S.customIds.length){
  CUSTOM.ids = S.customIds.filter(i => DATA.q[i]);
  if(S.customName) CUSTOM.name = S.customName;
}
if(S.deck < 0 && !CUSTOM.ids.length) S.deck = 0;   // stale custom deck, gone
const deck = () => S.deck < 0 ? CUSTOM : DATA.decks[S.deck];
const deckName = i => i < 0 ? (S.customName || "Your selection")
                            : ((DATA.decks[i] || {}).name || "Deck");
const stagesOf = d => [...new Set(d.ids.map(i => DATA.q[i][ST]))].sort();
const hc = stage => `var(${HC[stage-1]})`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

/* A one-line confirmation that does not steal focus or need dismissing. */
let toastTimer;
function toast(msg){
  const t = $("#toast");
  t.textContent = msg; t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("on"), 2200);
}

/* ---------------- pool & draw ---------------- */
function pool(depth, exact){
  const d = deck(), out = [];
  for(const i of d.ids){
    const q = DATA.q[i];
    if(exact ? q[ST]!==depth : q[ST]>depth) continue;
    /* The profile ceiling is the hardest cap in the app: below the run depth
       and below whatever the consent prompt agreed to. */
    if(q[SE] > Math.min(depth, S.sensOK, ((S.profile || {}).ceiling) || 5)) continue;
    // A muted topic is a standing preference about the shipped decks. It does
    // not override a selection you just made by hand.
    if(S.deck >= 0 && muted.has(q[CA])) continue;
    if(seen.has(q[R])) continue;
    out.push(q);
  }
  return out;
}
/* The last few topics and grammar frames dealt, so the draw can avoid them.
   In-memory and per-run: this is about how a sequence feels, not something
   worth remembering between sessions. */
let recentCat = [], recentFrame = [];
const RECENT_CAP = 8;

/* How much a topic is held back for having just come up, by how many cards
   ago it was. Uniform random over a pool where one category holds a third of
   the questions deals that category a third of the time, in clumps — measured
   at 21% back-to-back with runs of nine before this existed. The sequence was
   random and did not feel it, which for a conversation deck is the same thing
   as being broken. */
const CAT_PENALTY   = [0.06, 0.20, 0.40, 0.60, 0.78, 0.90, 0.96, 1];
const FRAME_PENALTY = [0.35, 0.60, 0.80, 0.92, 1];

const penaltyFor = (list, val, table) => {
  const k = list.lastIndexOf(val);
  if(k < 0) return 1;
  const ago = list.length - 1 - k;
  return table[ago] != null ? table[ago] : 1;
};

/* Weighted toward the common end. Two questions at the same depth are not
   equally worth asking, and the score says which one a learner should meet
   first — but a pure sort would make every session identical, so the score
   only tilts the dice. On top of that the dice are tilted away from whatever
   just came up, which is what stops eight of twenty cards being about films. */
function draw(){
  let p = pool(S.depth, true);
  if(!p.length) p = pool(S.depth, false);
  if(!p.length){ seen.clear(); if(PID >= 0) TRACK.forgetSeen(PID); else S.seen = []; p = pool(S.depth, false); }
  if(!p.length) return null;

  let total = 0;
  const w = p.map(q => {
    let x = 1 + (q[SC]|0)/20;
    x *= penaltyFor(recentCat, q[CA], CAT_PENALTY);
    x *= penaltyFor(recentFrame, q[FR], FRAME_PENALTY);
    total += x;
    return x;
  });

  let hit = p[p.length - 1];
  let r = Math.random() * total;
  for(let i = 0; i < p.length; i++){ r -= w[i]; if(r <= 0){ hit = p[i]; break; } }

  // Remember what was dealt, so the next draw can steer around it.
  recentCat.push(hit[CA]);   if(recentCat.length   > RECENT_CAP) recentCat.shift();
  recentFrame.push(hit[FR]); if(recentFrame.length > RECENT_CAP) recentFrame.shift();
  return hit;
}

/* ---------------- views ---------------- */
function show(v){
  // Leaving a live session banks it, so the record does not lose a run just
  // because someone tapped Dashboard instead of End session.
  if(S.view === "session" && v !== "session"){
    if(S.running) finishSession(false);
    SPEAK.stop(); stopRunClock();
  }
  S.view = v;
  for(const n of ["setup","session","dash","insights","settings","browse","saved"])
    $("#v-"+n).classList.toggle("hidden", n!==v);
  /* No inline display here. `.hidden` is display:none!important, so it wins
     while a view is hidden, and when it is not the stylesheet decides — which
     it has to, because the session view is a grid on a wide screen and an
     inline `display:flex` would silently beat that rule. */
  [...$("#nav").children].forEach(b => b.setAttribute("aria-pressed", b.dataset.v===v));
  /* The rail card counts today's questions, so it is stale the moment a run
     ends. A view change is the cheapest honest moment to repaint it. */
  if(window.renderRail) renderRail();
  if(v==="browse") runSearch();
  if(v==="saved")  renderSaved();
  if(v==="dash")   renderDash();
  if(v==="insights") renderInsights();
  if(v==="settings") renderProfile();
  if(v==="setup"){ renderQOTD(); renderPeople(); }  // both cheap, both go stale
  scrollTo(0,0);
  save();
}

/* ---------------- setup ---------------- */
function renderDecks(){
  $("#decks").innerHTML = DATA.decks.map((d,i)=>{
    const lo = stagesOf(d)[0];
    return `<button class="deck" data-d="${i}" style="--dc:${hc(lo)}">
      <span class="spine"></span><b>${esc(d.name)}</b>
      <span class="cnt">${d.ids.length}<br>cards</span>
      <small>${esc(d.why)}</small></button>`;
  }).join("");
}
const prefersDark = () => !window.matchMedia
  || window.matchMedia("(prefers-color-scheme: dark)").matches;

/* Paint a palette. Called for a tap on the picker and again whenever the
   system flips, so it only ever writes the attribute and the chrome colour —
   which half of the picker the choice came from is decided by the caller. */
function paintSkin(id){
  const sk = skinOf(id);
  S.skin = sk.id;
  // Hazard is the bare :root palette, so it carries no attribute.
  if(sk.id==="hazard") document.documentElement.removeAttribute("data-skin");
  else document.documentElement.dataset.skin = sk.id;
  /* The categorical chart palette has a light and a dark stepping, and which
     one applies depends on the skin's ground rather than on the OS. Stamped
     here so the charts are one CSS lookup away from the right set instead of
     each one asking. */
  document.documentElement.dataset.mode = sk.dark ? "dark" : "light";
  $("#skinname").textContent = sk.nm + (S.autoTheme ? " · auto" : "");
  [...$("#skins").querySelectorAll(".skin")]
    .forEach(b => b.setAttribute("aria-pressed", b.dataset.k === sk.id));
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute("content", sk.bg);
  if(window.cdgNativeTheme) window.cdgNativeTheme(sk);
  if(S.view === "dash") renderDash();   // the charts are painted, not tokenised
}

/* A tap on the picker. With "follow the system" on it stores the choice into
   the light or the dark slot depending on the skin's own ground, so picking
   Gruvbox in the dark and Gruvbox Light in the daytime sets up the pair in
   the obvious way rather than needing two separate controls. */
function applySkin(id){
  const sk = skinOf(id);
  if(sk.dark) S.skinDark = sk.id; else S.skinLight = sk.id;
  if(S.autoTheme && sk.dark !== prefersDark()){
    // The pick belongs to the half of the day that is not on right now.
    // Painting it would be a lie the next system flip undoes, so bank it
    // and say where it went.
    syncSystemSkin();
    toast(sk.nm + " saved as your " + (sk.dark ? "dark" : "light") + " theme");
    return;
  }
  paintSkin(sk.id);
  save();
}
/* The system said light or dark. Only meaningful with autoTheme on. */
function syncSystemSkin(){
  if(!S.autoTheme) return;
  paintSkin(prefersDark() ? S.skinDark : S.skinLight);
  save();
}
function renderSkins(){
  const group = (label, list) => `<div class="skingroup"><span class="lbl">${label}</span>
    <div class="skins">${list.map(sk => `
      <button class="skin" data-k="${sk.id}" aria-pressed="${sk.id===S.skin}">
        <span class="prev" style="background:${sk.bg}">
          ${sk.rp.map((c,i)=>`<i style="background:${c};height:${5+i*4}px"></i>`).join("")}
          <span class="dot" style="background:${sk.ac}"></span>
        </span>
        <span class="nm">${esc(sk.nm)}</span>
      </button>`).join("")}</div></div>`;
  $("#skins").innerHTML =
      group("Dark",  SKINS.filter(s => s.dark))
    + group("Light", SKINS.filter(s => !s.dark));
}

/* ---------------- text scale ---------------- */
function applyText(size){
  S.text = ["s","m","l"].includes(size) ? size : "m";
  if(S.text === "m") document.documentElement.removeAttribute("data-text");
  else document.documentElement.dataset.text = S.text;
  [...$("#textsize").children].forEach(b =>
    b.setAttribute("aria-pressed", b.dataset.t === S.text));
  save();
}
function renderTopics(){
  $("#topics").innerHTML = DATA.categories.map((c,i)=>
    `<button class="topic" data-c="${i}" aria-pressed="${muted.has(i)}">${esc(c)}</button>`).join("");
  $("#mutedn").textContent = muted.size;
}

/* ---------------- whose turn it is ----------------
 *
 * This used to be a single button reading "You answer first", which was wrong
 * in two ways. It looked like a status line rather than a control, so nobody
 * pressed it; and with two people sharing one screen, "you" does not identify
 * anybody. Naming the two players and showing them as a two-option control
 * fixes both — a segmented control is unmistakably a thing you tap, and a
 * name is unmistakably a person.
 */
/* Slot 0 is always you — you do not need to be told your own name. Slot 1 is
   whoever you are talking to right now, which changes conversation to
   conversation, so it reads off the partner box rather than off a second name
   field nobody would keep up to date. */
/* ---------------- session ---------------- */
let cardShownAt = 0;

function renderGauge(){
  const st = stagesOf(deck()), lo = st[0], hi = st[st.length-1];
  $("#rungs").innerHTML = [1,2,3,4,5].map(n=>{
    const inDeck = n>=lo && n<=hi;
    const cls = [ inDeck && n<=S.depth ? "reached":"", n===S.depth?"here":"", !inDeck?"locked":"" ].join(" ");
    return `<div class="rung ${cls}" style="--rc:${hc(n)}">
      <span class="bar" style="width:${40+(n-1)*15}%"></span><span class="name">${STAGE_NAME[n-1]}</span>
      <span class="n">${inDeck ? pool(n,true).length+" more" : "not in this deck"}</span></div>`;
  }).join("");
  $("#deck-name").textContent = deck().name;
  /* Said in words rather than as "sensitivity ≤ 3". The number means nothing
     to somebody who has not read the manual, and there is no manual. */
  const cap = Math.min(S.sensOK, S.depth);
  $("#deck-rule").textContent = cap <= 1
    ? "safe questions only"
    : "nothing past " + SENS_NAME[cap-1].toLowerCase();
}
function renderCard(){
  const q = S.cur;
  if(!q){
    $("#card-top").innerHTML = "";
    $("#q-en").textContent = "You have been through every question at this depth.";
    $("#q-zh").textContent = ""; $("#q-py").textContent = "";
    $("#q-frame").textContent = ""; $("#q-id").textContent = "";
    return;
  }
  const times = TRACK.counts()[q[R]] | 0;
  $("#card").style.setProperty("--dc", hc(q[ST]));
  $("#card-top").innerHTML =
    `<span class="chip depth">${STAGE_NAME[q[ST]-1]}</span>`+
    `<span class="chip sens${q[SE]}">${q[SE]} · ${SENS_NAME[q[SE]-1]}</span>`+
    `<span class="chip">${esc(DATA.categories[q[CA]])}</span>`+
    (S.score ? `<span class="chip" title="How common this question is, 0–100">freq ${q[SC]}</span>` : ``)+
    (q[PR] ? `<span class="chip">Prompt</span>` : ``)+
    (times ? `<span class="chip">asked ${times}×</span>` : ``);
  $("#q-en").textContent = q[EN];
  $("#q-zh").textContent = q[ZH];
  $("#q-py").textContent = q[PY];
  $("#q-py").classList.toggle("hidden", !S.pinyin);
  $("#q-frame").textContent = S.frame && q[FR]!=null ? DATA.frames[q[FR]] : "";
  $("#q-id").textContent = "Q"+String(q[R]).padStart(4,"0");
  $("#b-save").setAttribute("aria-pressed", saved.has(q[R]));

  // Language order via flex `order` — no nodes are ever moved.
  const one = S.mode!=="both", zhFirst = S.mode==="zh";
  $("#q-en").style.order    = zhFirst ? 3 : 1;
  $("#zh-block").style.order = zhFirst ? 1 : 3;
  $("#q-en").classList.toggle("hidden", zhFirst && one && !S.revealed);
  $("#zh-block").classList.toggle("hidden", !zhFirst && one && !S.revealed);
  $("#reveal").classList.toggle("hidden", !one || S.revealed);
  // Name what is behind the reveal, so it is an invitation to try rather than
  // an unlabelled button. Which language that is depends on what you are learning.
  $("#reveal").textContent = zhFirst ? "Show the English" : "Show the 中文";
  renderPartner();

  $("#s-asked").textContent = S.asked;
  $("#s-depth").textContent = S.depth;
  $("#s-left").textContent  = pool(S.depth,true).length;
  $("#s-saved").textContent = saved.size;
  $("#b-back").disabled = !HIST.length;
  renderStudy();
  $("#b-speak").classList.toggle("hidden", !SPEAK.available());
}

/* Cards already dealt in this run, so "Previous card" can walk back through
   them. In memory only: it is a within-session convenience, and the durable
   answer to "what have I been through" is the record, not this. */
let HIST = [];
const HIST_CAP = 40;

/* how: 0 asked · 1 warmer · 2 cooler · 3 skipped */
function next(how){
  if(S.cur){
    TRACK.record(S.cur[R], how|0, S.depth, S.deck, Date.now() - cardShownAt, PID);
    markSeen(S.cur[R]); S.asked++;
    if(!S.topics.includes(S.cur[CA])) S.topics.push(S.cur[CA]);
    HIST.push({q: S.cur, depth: S.depth});
    if(HIST.length > HIST_CAP) HIST.shift();
  }
  S.deepest = Math.max(S.deepest, S.depth);
  S.cur = draw(); S.revealed = false; cardShownAt = Date.now();
  renderCard(); renderGauge(); renderGoal(); save();
  if(S.autoSpeak) SPEAK.card(S.cur);
}

/* Step back to the card before this one. It is deliberately not an undo:
   the record already has that question and re-asking it would double-count,
   so this only changes what is on screen. */
function goBack(){
  const prev = HIST.pop();
  if(!prev) return;
  SPEAK.stop();
  seen.delete(prev.q[R]); if(PID < 0) S.seen = [...seen];
  S.cur = prev.q; S.depth = prev.depth; S.revealed = false;
  cardShownAt = Date.now();
  renderCard(); renderGauge(); renderGoal(); save();
}

/* ---------------- the run's shape ---------------- */
let runStart = 0, runTimer = null;
const mmss = ms => {
  const s = Math.max(0, Math.floor(ms/1000));
  return Math.floor(s/60) + ":" + String(s%60).padStart(2,"0");
};
function renderGoal(){
  const goal = S.goal|0;
  const el = $("#goalbar"), pctDone = goal ? Math.min(1, S.asked/goal) : 0;
  const time = runStart ? mmss(Date.now() - runStart) : "0:00";
  $("#goal-l").textContent = goal ? "Goal · " + goal + " questions" : "This run";
  $("#goal-v").textContent = (goal ? S.asked + " / " + goal : S.asked + " asked") + " · " + time;
  $("#goal-fill").style.width = goal
    ? Math.round(pctDone*100) + "%"
    // With no goal the bar still has a job: it fills toward a 20-card run so
    // an open session is not a dead strip of grey.
    : Math.round(Math.min(1, S.asked/20)*100) + "%";
  el.classList.toggle("done", !!goal && S.asked >= goal);
}
function startRunClock(){
  runStart = Date.now();
  clearInterval(runTimer);
  runTimer = setInterval(() => { if(S.view === "session") renderGoal(); }, 1000);
}
function stopRunClock(){ clearInterval(runTimer); runTimer = null; }

/* ---------------- depth & consent ---------------- */
function askConsent(level, yes, no){
  const g = $("#gate");
  $("#gate-h").textContent = level===5 ? "The deepest rung" : "This is where it gets personal";
  $("#gate-p").textContent = GATE_TEXT[level];
  g.returnValue = "";
  g.onclose = () => (g.returnValue==="yes" ? yes() : no());
  g.showModal();
}
function move(dir){
  const st = stagesOf(deck()), lo=st[0], hi=st[st.length-1];
  const want = Math.min(hi, Math.max(lo, S.depth+dir));
  const how = dir > 0 ? 1 : 2;
  if(want===S.depth && dir>0){ next(how); return; }
  const cap = ((S.profile || {}).ceiling) || 5;
  if(want > cap){ toast("Your profile keeps the deck at " + (SENS_NAME[cap - 1] || cap) + "."); return; }
  if(dir>0 && want>=4 && S.sensOK<want){
    askConsent(want, ()=>{ S.sensOK=want; S.depth=want; next(how); }, renderGauge);
    return;
  }
  S.depth = want; next(how);
}

/* ---------------- start / end ---------------- */
function start(i, jumpTo){
  const d = i < 0 ? CUSTOM : DATA.decks[i];
  if(!d || !d.ids.length) return toast("That deck is empty");
  const lo = stagesOf(d)[0];
  const deckMax = Math.max(...d.ids.map(x=>DATA.q[x][SE]));
  const open = () => {
    S.deck=i; S.depth=lo; S.asked=0; S.topics=[]; S.deepest=lo;
    S.cur=null; S.running=true;
    HIST = []; recentCat = []; recentFrame = []; startRunClock();
    TRACK.sessionStart(i, PID);
    show("session");
    if(jumpTo){
      S.cur=jumpTo; S.revealed=false; cardShownAt=Date.now();
      renderCard(); renderGauge(); renderGoal();
      if(S.autoSpeak) SPEAK.card(S.cur);
    }
    else next(0);
    // The second half of the tour waits for a real card to point at.
    if(typeof maybeSessionTour === "function") maybeSessionTour();
  };
  // A deck starting at depth 4+ needs the consent check up front, or its
  // opening pool would be empty.
  if(lo>=4 && deckMax>=4) askConsent(lo, ()=>{ S.sensOK=Math.max(lo,deckMax); open(); }, ()=>{});
  else { S.sensOK = Math.min(3, deckMax); open(); }
}

/* Banks the session into the record. The recap is optional because leaving
   via the nav bar should still count the run. */
function finishSession(showRecap){
  if(!S.running) return;
  const ran = runStart ? Date.now() - runStart : 0;
  SPEAK.stop(); stopRunClock();
  TRACK.sessionEnd(S.asked, S.deepest, S.topics.length);
  S.running = false; save();
  if(!showRecap) return;

  const r = $("#recap");
  const hitGoal = S.goal && S.asked >= S.goal;
  $("#recap-h").textContent = hitGoal          ? "Goal reached"
                            : S.asked >= 12    ? "That was a long one"
                            : S.asked >= 4     ? "That was a good run" : "A short one";
  const st = TRACK.streak();
  const perCard = S.asked ? Math.round(ran/1000/S.asked) : 0;
  $("#recap-body").innerHTML =
    `<div class="rstat"><span>Questions asked</span><b>${S.asked}${S.goal ? " / " + S.goal : ""}</b></div>`+
    `<div class="rstat"><span>Time on the deck</span><b>${mmss(ran)}</b></div>`+
    (perCard ? `<div class="rstat"><span>Average per card</span><b>${perCard}s</b></div>` : ``)+
    `<div class="rstat"><span>Deepest rung reached</span><b>${STAGE_NAME[S.deepest-1]}</b></div>`+
    `<div class="rstat"><span>Topics touched</span><b>${S.topics.length}</b></div>`+
    `<div class="rstat"><span>Day streak</span><b>${st.cur}</b></div>`+
    `<div class="rstat" style="border:none"><span>Saved for later</span><b>${saved.size}</b></div>`;
  r.returnValue = "";
  r.onclose = () => show(r.returnValue === "dash" ? "dash" : "setup");
  r.showModal();
}

/* ---------------- browse ---------------- */
const strip = s => s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
let INDEX = null;
const buildIndex = () => INDEX || (INDEX = DATA.q.map(q =>
  strip(q[EN]) + " " + q[ZH] + " " + strip(q[PY])));
let fSens = new Set(), fStage = new Set(), fFreq = 0, fSort = "freq";
let RESULTS = [], shown = 0;
const PAGE = 60;

function renderFilters(){
  $("#f-sens").insertAdjacentHTML("beforeend", [1,2,3,4,5].map(n=>
    `<button class="fchip" data-s="${n}" aria-pressed="false">${n} ${SENS_NAME[n-1]}</button>`).join(""));
  $("#f-stage").insertAdjacentHTML("beforeend", [1,2,3,4,5].map(n=>
    `<button class="fchip" data-t="${n}" aria-pressed="false">${STAGE_NAME[n-1]}</button>`).join(""));
  $("#f-freq").insertAdjacentHTML("beforeend", [0,50,70,80,90].map(n=>
    `<button class="fchip" data-q="${n}" aria-pressed="${n===0}">${n===0?"Any":n+"+"}</button>`).join(""));
  $("#f-sort").insertAdjacentHTML("beforeend",
    [["freq","Most common"],["order","Deck order"],["asked","Least asked"]].map(([k,l])=>
      `<button class="fchip" data-o="${k}" aria-pressed="${k===fSort}">${l}</button>`).join(""));
}
/* Mark the run of text the search actually matched. The offset is found in
   the stripped copy but the three pieces are escaped individually, so a
   question containing an angle bracket still cannot inject markup and the
   split can never land inside an entity. */
function hilite(text, term){
  if(!term) return esc(text);
  const i = strip(text).indexOf(term);
  if(i < 0) return esc(text);
  return esc(text.slice(0, i)) + "<mark>" + esc(text.slice(i, i + term.length))
       + "</mark>" + esc(text.slice(i + term.length));
}

function hitHTML(q, term){
  const times = TRACK.counts()[q[R]] | 0;
  return `<button class="hit" data-r="${q[R]}" style="--dc:${hc(q[ST])}">
    <span class="spine"></span>
    <span><span class="he">${hilite(q[EN], term)}</span>
      <span class="hz">${esc(q[ZH])}</span>
      <span class="hm">Q${String(q[R]).padStart(4,"0")} · freq ${q[SC]} · sens ${q[SE]} · ${esc(DATA.categories[q[CA]])}${times?" · asked "+times+"×":""}</span>
    </span></button>`;
}

function runSearch(){
  const idx = buildIndex();
  const term = strip($("#q").value.trim());
  const cnt = TRACK.counts();
  RESULTS = [];
  for(let i=0;i<DATA.q.length;i++){
    const q = DATA.q[i];
    if(fSens.size && !fSens.has(q[SE])) continue;
    if(fStage.size && !fStage.has(q[ST])) continue;
    if(fFreq && q[SC] < fFreq) continue;
    if(term && !idx[i].includes(term)) continue;
    RESULTS.push(q);
  }
  if(fSort === "freq")       RESULTS.sort((a,b) => b[SC]-a[SC] || a[R]-b[R]);
  else if(fSort === "asked") RESULTS.sort((a,b) => ((cnt[a[R]]|0)-(cnt[b[R]]|0)) || b[SC]-a[SC]);
  shown = Math.min(PAGE, RESULTS.length);
  renderHits();
}
// Results are paged rather than truncated, so every match stays reachable.
function renderHits(){
  const n = RESULTS.length;
  $("#hitcount").textContent = n.toLocaleString() + " question" + (n===1?"":"s")
    + (shown < n ? " · showing " + shown : "");
  if(!n){
    $("#hits").innerHTML = `<div class="empty">Nothing matches that.<br>Try fewer filters, or search the Chinese instead.</div>`;
    return;
  }
  const more = n - shown;
  const term = strip($("#q").value.trim());
  $("#hits").innerHTML = RESULTS.slice(0, shown).map(q => hitHTML(q, term)).join("")
    + (more > 0 ? `<button class="more" id="more">Show ${Math.min(PAGE, more)} more · ${more} left</button>` : "");
  $("#b-practice").disabled = !n;
  $("#b-practice").textContent = n ? `Practice these ${nf(n)}` : "Practice these";
  $("#b-random").disabled = !n;
}
function renderSaved(){
  const list = [...saved].map(r => byRank.get(r)).filter(Boolean);
  $("#savedcount").textContent = list.length
    ? `${list.length} saved · tap one to ask it`
    : "Nothing saved yet";
  $("#saved-acts").classList.toggle("hidden", !list.length);
  $("#savedlist").innerHTML = list.length ? list.map(q => hitHTML(q, "")).join("")
    : `<div class="empty">Tap the bookmark on a card to keep it here.<br>
       Useful for questions you want to come back to.
       <br><button class="btn sm" data-go="browse">Find some in Browse</button></div>`;
}
// Opening a specific question straight from Browse, Saved or the dashboard.
// Deliberately does not route through start(), whose consent path is async.
function openQuestion(rank){
  const q = byRank.get(rank); if(!q) return;
  let di = DATA.decks.findIndex(d => d.ids.includes(rank-1));
  const wasCustom = S.deck < 0 && CUSTOM.ids.includes(rank-1);
  if(wasCustom) di = -1;   // stay inside the selection you were practising
  if(di < 0 && !wasCustom){   // a few questions sit outside every deck; fall back on stage range
    di = DATA.decks.findIndex(d => { const t = stagesOf(d);
      return q[ST] >= t[0] && q[ST] <= t[t.length-1]; });
    if(di < 0) di = 0;
  }
  const st = stagesOf(di < 0 ? CUSTOM : DATA.decks[di]);
  S.deck = di;
  S.depth = Math.min(st[st.length-1], Math.max(st[0], q[ST]));
  S.sensOK = Math.max(3, q[SE]);
  S.asked = 0; S.topics = []; S.deepest = S.depth;
  S.cur = q; S.revealed = false; S.running = true; cardShownAt = Date.now();
  HIST = []; recentCat = []; recentFrame = []; startRunClock();
  TRACK.sessionStart(di, PID);
  show("session"); renderCard(); renderGauge(); renderGoal(); save();
  if(S.autoSpeak) SPEAK.card(q);
}
window.openQuestion = openQuestion;

/* ================================================================
   SPEECH — the deck is bilingual, so it should be able to say the
   Chinese out loud. Web Speech is used directly rather than shipping
   audio: 4,228 questions of recorded Mandarin is a gigabyte, and every
   platform this ships on already has a zh-CN voice or can install one.
   Everything degrades to a hidden button when it does not.
   ================================================================ */
const SPEAK = (function(){
  const synth = window.speechSynthesis;
  let voices = [], zh = null, en = null, queue = [], busy = false;

  function pick(){
    try{ voices = synth.getVoices() || []; }catch(e){ voices = []; }
    // A Mandarin voice by any of the tags it ships under, best match first.
    const want = ["zh-cn","zh_cn","zh-hans","cmn","zh"];
    zh = null;
    for(const w of want){
      zh = voices.find(v => (v.lang||"").toLowerCase().replace("_","-").startsWith(w));
      if(zh) break;
    }
    en = voices.find(v => (v.lang||"").toLowerCase().startsWith("en")) || null;
    const el = document.getElementById("voicename");
    const note = document.getElementById("speak-note");
    // Voice names carry a parenthesised locale that never fits the header
    // slot and truncates mid-bracket. The full name is in the note below.
    const short = v => v.name.replace(/\s*[(（].*$/, "").trim().slice(0, 26);
    if(el) el.textContent = zh ? short(zh) : (voices.length ? "no 中文 voice" : "unavailable");
    if(note) note.textContent = !synth
      ? "This device has no speech engine, so the audio controls do nothing."
      : zh ? "Using " + zh.name + " for the Chinese."
           : "No Mandarin voice is installed. Android: Settings → Text-to-speech → install "
             + "the Chinese voice data. Windows: Settings → Time & language → Speech.";
  }

  const available = () => !!synth;

  function stop(){
    queue = []; busy = false;
    try{ synth && synth.cancel(); }catch(e){}
    const b = document.getElementById("b-speak");
    if(b) b.classList.remove("speaking");
  }

  function run(){
    if(!synth || !queue.length){
      busy = false;
      const b = document.getElementById("b-speak");
      if(b) b.classList.remove("speaking");
      return;
    }
    busy = true;
    const job = queue.shift();
    const u = new SpeechSynthesisUtterance(job.text);
    const v = job.lang === "zh" ? zh : en;
    if(v) u.voice = v;
    u.lang = job.lang === "zh" ? (v && v.lang) || "zh-CN" : (v && v.lang) || "en-US";
    u.rate = job.lang === "zh" ? (S.rate || .85) : Math.min(1, (S.rate || .85) + .1);
    u.onend = u.onerror = run;
    try{ synth.speak(u); }catch(e){ run(); }
  }

  function say(parts){
    if(!synth) return;
    stop();
    queue = parts.filter(p => p && p.text);
    if(!queue.length) return;
    const b = document.getElementById("b-speak");
    if(b) b.classList.add("speaking");
    // Chrome drops the first utterance if it lands in the same tick as the
    // cancel() above, so the queue starts on the next one.
    setTimeout(run, 60);
  }

  /* What "speak this card" means depends on the setting. Off still speaks
     on an explicit tap — the button is the user asking for it. */
  function card(q, forced){
    if(!q) return;
    const mode = forced ? (S.speak === "off" ? "zh" : S.speak) : S.speak;
    if(mode === "off") return;
    const parts = [{lang:"zh", text:q[ZH]}];
    if(mode === "both") parts.unshift({lang:"en", text:q[EN]});
    say(parts);
  }

  if(synth){
    pick();
    // Voices load asynchronously in every browser except Safari.
    if(typeof synth.onvoiceschanged !== "undefined") synth.onvoiceschanged = pick;
    setTimeout(pick, 400);
    addEventListener("pagehide", stop);
  }else{
    setTimeout(pick, 0);
  }
  return {say, card, stop, available, speaking: () => busy, refresh: pick};
})();
window.SPEAK = SPEAK;

/* ================================================================
   QUESTION OF THE DAY — one high-frequency question, the same one all
   day on every device, no state to store. The date seeds an index into
   the common band, so it is a genuine rotation rather than a random
   pick that changes every time the page is opened.
   ================================================================ */
const QOTD_POOL = DATA.q.filter(q => q[SC] >= 70 && q[SE] <= 3);
function qotdFor(date){
  if(!QOTD_POOL.length) return DATA.q[0];
  const key = date.getFullYear()*10000 + (date.getMonth()+1)*100 + date.getDate();
  // A small integer hash: consecutive days must not land on neighbours.
  let h = key ^ 0x5F37;
  h = (h * 2654435761) % 2147483647;
  return QOTD_POOL[Math.abs(h) % QOTD_POOL.length];
}
function renderQOTD(){
  const q = qotdFor(new Date());
  const asked = TRACK.counts()[q[R]] | 0;
  $("#qotd-meta").textContent = new Date().toLocaleDateString(undefined,
    {weekday:"long", day:"numeric", month:"long"});
  $("#qotd").innerHTML =
    `<div class="qq">${esc(q[EN])}</div>
     <div class="qz">${esc(q[ZH])}</div>
     ${S.pinyin ? `<div class="qp">${esc(q[PY])}</div>` : ``}
     <div class="qacts">
       <button class="btn sm" data-qotd="${q[R]}">Ask this one</button>
       ${SPEAK.available() ? `<button class="ghost" data-qsay="${q[R]}">Hear it</button>` : ``}
       <span class="lbl" style="margin-left:auto">freq ${q[SC]}${asked ? " · asked "+asked+"×" : ""}</span>
     </div>`;
}

/* ================================================================
   AD-HOC DECKS — practise exactly what is on screen. The Browse filters
   are already a query over the corpus; this turns the result of one into
   something you can run, which is the shortest path from "I want to drill
   the 90+ food questions" to actually drilling them.
   ================================================================ */
function practise(rows, name){
  const ids = rows.map(q => q[R] - 1).filter(i => DATA.q[i]);
  if(!ids.length) return toast("Nothing to practise");
  CUSTOM.ids = ids;
  CUSTOM.name = name;
  CUSTOM.why = ids.length + " questions you picked.";
  S.customIds = ids; S.customName = name;
  // A selection you just made by hand should be fresh, but only it — the
  // seen list is shared with the shipped decks and clearing all of it would
  // silently reset progress you were not touching.
  for(const i of ids) seen.delete(DATA.q[i][R]);
  if(PID < 0) S.seen = [...seen];
  start(-1);
}

/* ================================================================
   VOCABULARY — the word bank, and the segmenter that uses it.

   Chinese is written without spaces, so "where does one word end" is a
   real question, and the honest answer here is: longest match against a
   list we wrote. That is crude next to a statistical segmenter, and it
   is the right crude — the list is hand-glossed words chosen because
   they occur in this corpus, so a match is always a word the app can
   also explain, and a miss degrades to a bare character rather than to
   a confident wrong gloss.
   ================================================================ */
const VOCAB = (function(){
  const src = window.__VOCAB__ || {w: [], levels: []};
  const byWord = new Map();
  let maxLen = 1;
  for(const [hz, py, en, lv] of src.w){
    byWord.set(hz, {hz, py, en, lv});
    if(hz.length > maxLen) maxLen = hz.length;
  }
  const isHan = ch => ch >= "一" && ch <= "鿿";

  /* Split a Chinese sentence into words and leftovers. Leftovers are
     returned too, so a caller can rebuild the whole sentence rather than
     only the parts there is a gloss for. */
  function segment(zh){
    const out = [];
    for(let i = 0; i < zh.length; ){
      if(!isHan(zh[i])){
        let j = i; while(j < zh.length && !isHan(zh[j])) j++;
        out.push({raw: zh.slice(i, j)});
        i = j; continue;
      }
      let hit = null;
      for(let n = Math.min(maxLen, zh.length - i); n >= 1; n--){
        const found = byWord.get(zh.substr(i, n));
        if(found){ hit = found; i += n; break; }
      }
      if(hit) out.push(hit);
      else { out.push({raw: zh[i], unknown: true}); i++; }
    }
    return out;
  }

  /* Only the glossed words, deduplicated, in the order they appear. */
  function wordsIn(zh){
    const seen = new Set(), out = [];
    for(const t of segment(zh)){
      if(!t.hz || seen.has(t.hz)) continue;
      seen.add(t.hz); out.push(t);
    }
    return out;
  }

  /* Which words the record says you have already been through. Cached
     against the size of the count table, because segmenting every asked
     question on every render is work worth doing once. */
  let met = null, metAt = -1;
  function metWords(){
    const cnt = TRACK.counts();
    const n = Object.keys(cnt).length;
    if(met && metAt === n) return met;
    met = new Set(); metAt = n;
    for(const k in cnt){
      const q = byRank.get(+k); if(!q) continue;
      for(const t of segment(q[ZH])) if(t.hz) met.add(t.hz);
    }
    return met;
  }
  const forget = () => { met = null; metAt = -1; };

  return {all: src.w, levels: src.levels, byWord, segment, wordsIn, metWords,
          forget, size: src.w.length};
})();
window.VOCAB = VOCAB;

/* ================================================================
   AREC — model answers, and a scaffold for everything else.
   ================================================================ */
const ANS = (function(){
  const src = window.__ANSWERS__ || {a: [], parts: [], scaffold: {}, frameKind: []};
  const byQ = new Map(src.a.map(row => [row[0], row]));

  /* Three sources, in order of how closely they fit, and the caller is told
     which one it got so the UI can be honest about it:
       exact  written for this question
       topic  a full-length answer for this topic and this question shape —
              not about this exact question, but the right length, register
              and vocabulary, which is the part you copy anyway
       frame  the bare four-move scaffold, only where nothing else exists
     Same shape in every case — four parts of [english, chinese, pinyin] — so
     the renderer does not branch on the source. */
  function forQuestion(q){
    if(!q) return null;

    const row = byQ.get(q[R]);
    if(row) return {source: "exact", parts: [0,1,2,3].map(i => [row[1][i], row[2][i], row[3][i]])};

    const shape = src.frameKind[q[FR]] || "open";
    const cat = src.topic && src.topic[q[CA]];
    if(cat){
      const hit = cat[shape] || cat[(src.topicFallback || {})[q[CA]]];
      if(hit) return {source: "topic", shape, parts: hit,
                      topicName: DATA.categories[q[CA]]};
    }

    const kind = src.scaffold[shape] || src.scaffold.open;
    if(!kind) return null;
    return {source: "frame", kind: kind.nm, parts: [kind.a, kind.r, kind.e, kind.c]};
  }
  return {parts: src.parts, forQuestion, count: src.a.length, has: r => byQ.has(r)};
})();
window.ANS = ANS;


/* Roughly how long a passage takes to say out loud.
   135 words a minute for English and 220 characters a minute for Mandarin are
   both middle-of-the-range conversational rates — the point is not precision,
   it is telling you whether you are looking at a ten-second reply or the two
   minutes an exam actually wants. */
function speakSecs(en, zh){
  const w = en.trim().split(/\s+/).filter(Boolean).length;
  const c = (zh.match(/[一-鿿]/g) || []).length;
  return Math.round(Math.max(w / 135, c / 220) * 60);
}
const mmssShort = s => Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");

/* ---------------- the study panel under the card ---------------- */
let studyTab = "words";
const studyOn = () => S.vocab || S.answer;

function renderStudy(){
  const host = $("#study");
  if(!S.cur || !studyOn()){ host.classList.add("hidden"); return; }
  host.classList.remove("hidden");

  // Offer only the tabs that are switched on, and never leave the panel
  // pointing at one the settings have just taken away.
  const tabs = [["words", S.vocab], ["answer", S.answer]].filter(t => t[1]).map(t => t[0]);
  if(!tabs.includes(studyTab)) studyTab = tabs[0];
  $("#study-tabs").classList.toggle("hidden", tabs.length < 2);
  [...$("#study-tabs").children].forEach(b =>
    b.setAttribute("aria-pressed", b.dataset.s === studyTab));

  const words = S.vocab ? VOCAB.wordsIn(S.cur[ZH]) : [];
  const a = S.answer ? ANS.forQuestion(S.cur) : null;
  const len = a && a.source !== "frame"
    ? mmssShort(a.parts.reduce((s, p) => s + speakSecs(p[0], p[1]), 0))
    : null;
  $("#study-sum").textContent =
    (S.vocab ? words.length + " word" + (words.length === 1 ? "" : "s") : "") +
    (S.vocab && S.answer ? " · " : "") +
    (S.answer ? (len ? (a.source === "exact" ? "model answer " : "topic answer ") + len
                      : "answer frame") : "");

  if($("#study-body").classList.contains("hidden")) return;   // collapsed
  $("#study-pane").innerHTML = studyTab === "words" ? wordsHTML(words) : answerHTML();
}

function wordRow(w, met, big){
  return `<button class="wrow${big ? " big" : ""}" data-w="${esc(w.hz)}">
    <span class="wh">${esc(w.hz)}</span>
    <span class="wp">${esc(w.py)}</span>
    <span class="we">${esc(w.en)}</span>
    <span class="wl lv${w.lv}">${esc(VOCAB.levels[w.lv-1] || "")}${met.has(w.hz) ? " · met" : ""}</span>
  </button>`;
}

function wordsHTML(words){
  if(!words.length) return `<div class="empty">No glossed words in this one.</div>`;
  const met = VOCAB.metWords();
  return `<div class="wlist">${words.map(w => wordRow(w, met)).join("")}</div>`;
}

function answerHTML(){
  const a = ANS.forQuestion(S.cur);
  if(!a) return `<div class="empty">No answer for this one.</div>`;
  const total = a.parts.reduce((s, p) => s + speakSecs(p[0], p[1]), 0);
  const full = a.source !== "frame";
  const note = a.source === "exact"
    ? "A full-length answer to this exact question — about " + mmssShort(total) + " spoken, "
      + "which is the length an examiner is waiting for. Read it, then say your own version. "
      + "The structure and the level of detail are what to copy, not the content."
    : a.source === "topic"
    ? "A full-length answer to a question of this kind — about " + mmssShort(total) + " spoken. "
      + "It is not about this exact question: it is the length, the shape and the vocabulary a "
      + "good answer on " + esc((a.topicName || "").split(/[,&]/)[0].toLowerCase().trim())
      + " needs. Put your own content through it and keep everything else."
    : "There is no written answer for this one, so here is the shape to build one in, chosen "
      + "to fit how the question is asked (" + esc(a.kind) + "). The middle two are yours, "
      + "and the example is the part that should take longest.";
  return `<p class="pmeta">${note}</p><div class="arec">` + a.parts.map((p, i) => {
    const [k, nm, how] = ANS.parts[i];
    const secs = full ? speakSecs(p[0], p[1]) : 0;
    return `<div class="apart${full ? "" : " frame"}">
      <span class="ak">${k}</span>
      <span class="an">${esc(nm)}${secs ? `<i class="asec">${secs}s</i>` : ``}<small>${esc(how)}</small></span>
      ${/* The language you are producing goes first and gets the emphasis:
             the other one is the crib, not the model. */
        targetIsZh()
        ? `<span class="az lead">${esc(p[1])}</span>
           ${S.pinyin ? `<span class="ap">${esc(p[2])}</span>` : ``}
           <span class="ae second">${esc(p[0])}</span>`
        : `<span class="ae lead">${esc(p[0])}</span>
           <span class="az second">${esc(p[1])}</span>
           ${S.pinyin ? `<span class="ap">${esc(p[2])}</span>` : ``}`}
      <button class="mini asay" data-say="${esc(p[1])}" aria-label="Read this part aloud"
        ${SPEAK.available() ? "" : "hidden"}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>
      </button>
    </div>`;
  }).join("") + `</div>`;
}

/* Tapping a word shows where it turns up, which is the whole reason the
   bank was built from this corpus rather than from a dictionary. */
const hiliteWord = (zh, hz) => esc(zh).split(esc(hz)).join(`<mark>${esc(hz)}</mark>`);

function showWord(hz){
  const w = VOCAB.byWord.get(hz); if(!w) return;
  const met = VOCAB.metWords();
  const uses = [];
  for(const q of DATA.q){
    if(!q[ZH].includes(hz)) continue;
    // Only count it where the segmenter agrees it is that word, so 一样
    // does not list every sentence that merely contains 一.
    if(VOCAB.segment(q[ZH]).some(t => t.hz === hz)) uses.push(q);
    if(uses.length >= 12) break;
  }
  $("#word-hz").textContent = hz;
  $("#word-py").textContent = w.py;
  $("#word-en").textContent = w.en;
  $("#word-meta").textContent = (VOCAB.levels[w.lv-1] || "")
    + (met.has(hz) ? " · you have met this" : " · not met yet");
  $("#word-n").textContent = uses.length >= 12 ? "first 12 questions"
    : uses.length + " question" + (uses.length === 1 ? "" : "s");
  $("#word-uses").innerHTML = uses.length
    ? uses.map(q => `<button class="wuse" data-r="${q[R]}">
        <span class="ue">${esc(q[EN])}</span>
        <span class="uz">${hiliteWord(q[ZH], hz)}</span></button>`).join("")
    : `<div class="empty">Not used in the deck.</div>`;
  $("#word").showModal();
}
window.showWord = showWord;

/* ================================================================
   PASTE-READY TEXT

   The app is used next to a chat window, so the single most-used control is
   "give me this question in a form I can paste". There used to be four forms
   and a panel to choose between them, which is a decision made once and then
   never again — and in a language exchange the answer is always the same:
   the Chinese for them to read, the English so you know what you sent.
   ================================================================ */
function copyText(q){
  return q[ZH] + "\n" + q[EN];
}

/* ---------------- who you are talking to ---------------- */

/* Everyone in the record, most recently talked to first. Tapping one loads
   their history, which is the whole point of naming them. */
function renderPeople(){
  const pp = TRACK.people();
  const host = $("#recent-people");
  if(!pp.length){ host.innerHTML = ""; $("#who-meta").textContent = "nobody yet"; return; }

  const rows = pp.map((nm, i) => ({nm, i, ...TRACK.personStats(i)}))
                 .sort((a, b) => b.last - a.last);
  $("#who-meta").textContent = pp.length + (pp.length === 1 ? " person" : " people");
  host.innerHTML = rows.slice(0, 12).map(p => `
    <button class="person${p.nm === S.partner ? " on" : ""}" data-p="${esc(p.nm)}">
      <b>${esc(p.nm)}</b>
      <small>${p.covered ? nf(p.covered) + " asked" : "new"}</small>
    </button>`).join("");
}

function renderPartner(){
  const who = S.partner;
  $("#goal-who").textContent = who ? "with " + who : "";
  $("#goal-who").classList.toggle("hidden", !who);
}

/* ---------------- which language you are practising ----------------
 *
 * This decides which side of the card is the one you should be producing,
 * which is not the same question as which side is shown first. Somebody
 * learning Chinese wants to attempt the Chinese before seeing it; somebody
 * learning English wants the reverse.
 */
function applyLearning(which){
  S.learning = which === "en" ? "en" : "zh";
  [...$("#learning").children].forEach(b =>
    b.setAttribute("aria-pressed", b.dataset.l === S.learning));
  save();
  if(S.running) renderCard();
}
/* The language the user is producing, used to order the model answers. */
const targetIsZh = () => S.learning !== "en";

/* ================================================================
   THE TOUR — a spotlight, a caption, and seven things worth knowing.

   Two sequences rather than one, because a single tour that drove the
   app between screens would have to start a session on the user's
   behalf and then unwind it. Instead the setup tour explains what the
   app is while you are looking at the decks, and the session tour
   fires once, on the first card of the first run, when every element
   it points at is genuinely on screen.

   A step can name a selector to spotlight, or none at all for a plain
   card in the middle of the screen. Nothing is measured until the step
   is shown, so a target that scrolls or resizes still gets a ring in
   the right place.
   ================================================================ */
const TOUR = (function(){
  const SETUP = [
    {h:"A question bank for the chat window next to this one",
     p:"Pick a question, paste it to whoever you are talking to, and answer it yourself as "
      + "well — that is a language exchange. Every question is in English and Chinese, and "
      + "the deck never jumps ahead of where the conversation actually is."},
    {t:"#decks", h:"Pick a starting point",
     p:"Each deck is a situation rather than a topic. Cold open is for people who have just met; "
      + "Deep dive is for someone you already trust. The deck decides how personal the questions "
      + "are allowed to get, so pick the one that matches who you are actually with.",
     scroll:true},
    {t:"#who-panel", h:"Say who you are talking to",
     p:"This is the setting that matters most. Put their handle in and 4QIAN remembers what "
      + "it has already given you for THEM — so you never repeat a question to the same "
      + "person, and your best openers come back fresh for the next stranger.",
     scroll:true},
    {t:"#nav", h:"The other places to look",
     p:"Dashboard is your record of everything you have been through, and Insights is the same "
      + "record as charts you can filter. Browse searches all 4,228 questions. Saved is "
      + "anything you bookmarked. Settings holds the theme, your profile and where exports go."},
    {h:"That's the whole idea",
     p:"Start a deck whenever you are ready — the rest of the tour picks up on your first card. "
      + "You can run this again any time from the ? button at the top."}
  ];

  const SESSION = [
    {t:"#card", h:"The question",
     p:"Tap the speaker to hear the Chinese before you send it, and the ? beside it explains "
      + "every label on the card — including how common the question actually is."},
    {t:"#study", h:"Help with the answer",
     p:"Open this for the Chinese broken into words with meanings, and a full two-minute model "
      + "answer built the way an IELTS examiner wants — answer, reason, example, conclusion."},
    {t:"#controls-wrap", h:"Then read the room",
     p:"Deeper moves one step more personal, Lighter eases back. With somebody you met an "
      + "hour ago, a short reply is a signal — go lighter rather than pushing. The really "
      + "personal levels ask you to confirm they are up for it first."},
    {t:"#rungs", h:"How far you have come",
     p:"Five levels, from small talk to the things you only ask someone you trust. You can only "
      + "ever move one rung at a time, in either direction."}
  ];

  let seq = [], at = 0, onDone = null;
  const el = id => document.getElementById(id);

  function place(step){
    const box = el("tour-box"), ring = el("tour-ring");
    const target = step.t && document.querySelector(step.t);
    const vis = target && target.offsetParent !== null;

    if(!vis){
      ring.classList.add("hidden");
      box.style.top = ""; box.style.bottom = "";
      box.classList.add("mid");
      return;
    }
    box.classList.remove("mid");
    const r = target.getBoundingClientRect();
    const pad = 6;
    ring.classList.remove("hidden");
    ring.style.top    = (r.top - pad) + "px";
    ring.style.left   = (r.left - pad) + "px";
    ring.style.width  = (r.width + pad*2) + "px";
    ring.style.height = (r.height + pad*2) + "px";

    /* Park the caption on whichever side has more room, measuring the box
       itself rather than guessing: a three-line step and a six-line one need
       different amounts, and a caption that covers the thing it is pointing
       at is worse than no caption. */
    const gap = 16;
    const boxH = box.offsetHeight || 200;
    const above = r.top, below = innerHeight - r.bottom;
    if(below >= boxH + gap || below >= above){
      box.style.top = Math.max(gap, Math.min(innerHeight - boxH - gap, r.bottom + gap)) + "px";
      box.style.bottom = "auto";
    }else{
      box.style.top = "auto";
      box.style.bottom = Math.max(gap, Math.min(innerHeight - boxH - gap,
                                                innerHeight - r.top + gap)) + "px";
    }
  }

  function paint(){
    const step = seq[at];
    el("tour-step").textContent = `Step ${at+1} of ${seq.length}`;
    el("tour-h").textContent = step.h;
    el("tour-p").textContent = step.p;
    el("tour-back").disabled = at === 0;
    el("tour-next").textContent = at === seq.length - 1 ? "Done" : "Next";
    el("tour-dots").innerHTML = seq.map((_, i) =>
      `<i class="${i === at ? "on" : ""}"></i>`).join("");

    const target = step.t && document.querySelector(step.t);
    if(target && step.scroll) target.scrollIntoView({block:"center", behavior:"smooth"});
    // Let a smooth scroll settle before measuring, or the ring lands where
    // the target used to be.
    setTimeout(() => place(step), step.scroll ? 320 : 0);
  }

  function start(which, done){
    seq = which === "session" ? SESSION : SETUP;
    at = 0; onDone = done || null;
    el("tour").classList.remove("hidden");
    document.body.classList.add("touring");
    paint();
  }
  function stop(){
    el("tour").classList.add("hidden");
    document.body.classList.remove("touring");
    if(onDone) onDone();
    onDone = null;
  }
  const next = () => { at < seq.length - 1 ? (at++, paint()) : stop(); };
  const back = () => { if(at > 0){ at--; paint(); } };
  const open = () => !el("tour").classList.contains("hidden");

  addEventListener("resize", () => { if(open()) place(seq[at]); });

  return {start, stop, next, back, open};
})();
window.TOUR = TOUR;
