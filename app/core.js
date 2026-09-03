/* core.js — the deck itself: setup, the session loop, browse and saved. */

const DATA = window.__DECK__;
window.DATA = DATA;
const HC = ["--h1","--h2","--h3","--h4","--h5"];
const STAGE_NAME = ["Icebreaker","Warm-up","Getting to know","Deep","Intimate / Debate"];
const SENS_NAME = ["Safe","Light","Personal","Sensitive","Very sensitive"];
const GATE_TEXT = {
  4:"The next rung includes money, health, faith, politics and past relationships. These land badly with someone who did not expect them.",
  5:"The last rung includes sex, addiction, grief and loss. Only open this with someone you already trust, or as a debate you have both signed up for."
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

const SKINS = [
  {id:"hazard",   nm:"Hazard",    bg:"#08080A", ac:"#FFCE1F",
   rp:["#7D7869","#9C8433","#D9A81C","#FFC220","#FF7A18"]},
  {id:"terminal", nm:"Terminal",  bg:"#050805", ac:"#4AE84A",
   rp:["#6E8A6A","#4A8A4A","#35C335","#4AE84A","#B6FF7A"]},
  {id:"blueprint",nm:"Blueprint", bg:"#0A1220", ac:"#4FC3F7",
   rp:["#5B7A99","#3E86AC","#35A8D4","#4FC3F7","#A8E6FF"]},
  {id:"cinnabar", nm:"Cinnabar",  bg:"#EFEBE0", ac:"#C1272D",
   rp:["#8A8270","#B08A3E","#C46A2A","#C1272D","#7E1014"]},
  {id:"sounding", nm:"Sounding",  bg:"#EEF2F4", ac:"#2F7D8C",
   rp:["#2F7D70","#2F6E8C","#3D5A8C","#4A4080","#5E3260"]},
  {id:"daylight", nm:"Daylight",  bg:"#F4F5F7", ac:"#3D3BC4",
   rp:["#767D8A","#6A72B4","#5055B8","#3D3BC4","#6B2894"]},
];

const $ = s => document.querySelector(s);
const LS = "4qian.v1";
const LS_OLD = "cdg.v3";          // pre-rename key; read once, then retired
let S = {
  deck:0, depth:1, sensOK:3, mode:"both", pinyin:true, frame:true, turns:true,
  score:true, track:true,
  muted:[], seen:[], saved:[], asked:0, topics:[], deepest:1, skin:"hazard",
  cur:null, revealed:false, running:false, turn:0, view:"setup"
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

const seen  = new Set(S.seen);
const muted = new Set(S.muted);
const saved = new Set(S.saved);
const byRank = new Map(DATA.q.map(q => [q[R], q]));
const deck = () => DATA.decks[S.deck];
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
    if(q[SE] > Math.min(depth, S.sensOK)) continue;
    if(muted.has(q[CA]) || seen.has(q[R])) continue;
    out.push(q);
  }
  return out;
}
/* Weighted toward the common end. Two questions at the same depth are not
   equally worth asking, and the score says which one a learner should meet
   first — but a pure sort would make every session identical, so the score
   only tilts the dice. */
function draw(){
  let p = pool(S.depth, true);
  if(!p.length) p = pool(S.depth, false);
  if(!p.length){ seen.clear(); S.seen = []; p = pool(S.depth, false); }
  if(!p.length) return null;
  let total = 0;
  const w = p.map(q => { const x = 1 + (q[SC]|0)/20; total += x; return x; });
  let r = Math.random() * total;
  for(let i=0;i<p.length;i++){ r -= w[i]; if(r <= 0) return p[i]; }
  return p[p.length-1];
}

/* ---------------- views ---------------- */
function show(v){
  // Leaving a live session banks it, so the record does not lose a run just
  // because someone tapped Dashboard instead of End session.
  if(S.view === "session" && v !== "session" && S.running) finishSession(false);
  S.view = v;
  for(const n of ["setup","session","dash","browse","saved"])
    $("#v-"+n).classList.toggle("hidden", n!==v);
  $("#v-"+v).style.display = "flex";
  [...$("#nav").children].forEach(b => b.setAttribute("aria-pressed", b.dataset.v===v));
  if(v==="browse") runSearch();
  if(v==="saved")  renderSaved();
  if(v==="dash")   renderDash();
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
function applySkin(id){
  const sk = SKINS.find(x=>x.id===id) || SKINS[0];
  S.skin = sk.id;
  // Hazard is the bare :root palette, so it carries no attribute.
  if(sk.id==="hazard") document.documentElement.removeAttribute("data-skin");
  else document.documentElement.dataset.skin = sk.id;
  $("#skinname").textContent = sk.nm;
  [...$("#skins").children].forEach(b=>b.setAttribute("aria-pressed", b.dataset.k===sk.id));
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute("content", sk.bg);
  save();
  if(S.view === "dash") renderDash();   // the charts are painted, not tokenised
}
function renderSkins(){
  $("#skins").innerHTML = SKINS.map(sk=>`
    <button class="skin" data-k="${sk.id}" aria-pressed="${sk.id===S.skin}">
      <span class="prev" style="background:${sk.bg}">
        ${sk.rp.map((c,i)=>`<i style="background:${c};height:${5+i*4}px"></i>`).join("")}
        <span class="dot" style="background:${sk.ac}"></span>
      </span>
      <span class="nm">${sk.nm}</span>
    </button>`).join("");
}
function renderTopics(){
  $("#topics").innerHTML = DATA.categories.map((c,i)=>
    `<button class="topic" data-c="${i}" aria-pressed="${muted.has(i)}">${esc(c)}</button>`).join("");
  $("#mutedn").textContent = muted.size;
}

/* ---------------- session ---------------- */
let cardShownAt = 0;

function renderGauge(){
  const st = stagesOf(deck()), lo = st[0], hi = st[st.length-1];
  $("#rungs").innerHTML = [1,2,3,4,5].map(n=>{
    const inDeck = n>=lo && n<=hi;
    const cls = [ inDeck && n<=S.depth ? "reached":"", n===S.depth?"here":"", !inDeck?"locked":"" ].join(" ");
    return `<div class="rung ${cls}" style="--rc:${hc(n)}">
      <span class="bar" style="width:${40+(n-1)*15}%"></span><span class="name">${STAGE_NAME[n-1]}</span>
      <span class="n">${inDeck ? pool(n,true).length+" left" : "locked"}</span></div>`;
  }).join("");
  $("#deck-name").textContent = deck().name;
  $("#deck-rule").textContent = "sensitivity ≤ " + Math.min(S.sensOK, S.depth);
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

  $("#turn").classList.toggle("hidden", !S.turns);
  $("#turn-t").textContent = S.turn ? "They answer first" : "You answer first";
  $("#s-asked").textContent = S.asked;
  $("#s-depth").textContent = S.depth;
  $("#s-left").textContent  = pool(S.depth,true).length;
  $("#s-saved").textContent = saved.size;
}

/* how: 0 asked · 1 warmer · 2 cooler · 3 skipped */
function next(how){
  if(S.cur){
    TRACK.record(S.cur[R], how|0, S.depth, S.deck, Date.now() - cardShownAt);
    seen.add(S.cur[R]); S.seen = [...seen].slice(-4300); S.asked++;
    if(!S.topics.includes(S.cur[CA])) S.topics.push(S.cur[CA]);
    if(S.turns) S.turn ^= 1;
  }
  S.deepest = Math.max(S.deepest, S.depth);
  S.cur = draw(); S.revealed = false; cardShownAt = Date.now();
  renderCard(); renderGauge(); save();
}

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
  if(dir>0 && want>=4 && S.sensOK<want){
    askConsent(want, ()=>{ S.sensOK=want; S.depth=want; next(how); }, renderGauge);
    return;
  }
  S.depth = want; next(how);
}

/* ---------------- start / end ---------------- */
function start(i, jumpTo){
  const d = DATA.decks[i], lo = stagesOf(d)[0];
  const deckMax = Math.max(...d.ids.map(x=>DATA.q[x][SE]));
  const open = () => {
    S.deck=i; S.depth=lo; S.asked=0; S.topics=[]; S.deepest=lo;
    S.cur=null; S.running=true; S.turn=0;
    TRACK.sessionStart(i);
    show("session");
    if(jumpTo){ S.cur=jumpTo; S.revealed=false; cardShownAt=Date.now(); renderCard(); renderGauge(); }
    else next(0);
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
  TRACK.sessionEnd(S.asked, S.deepest, S.topics.length);
  S.running = false; save();
  if(!showRecap) return;

  const r = $("#recap");
  $("#recap-h").textContent = S.asked >= 12 ? "That was a long one"
                            : S.asked >= 4  ? "That was a good run" : "A short one";
  const st = TRACK.streak();
  $("#recap-body").innerHTML =
    `<div class="rstat"><span>Questions asked</span><b>${S.asked}</b></div>`+
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
function hitHTML(q){
  const times = TRACK.counts()[q[R]] | 0;
  return `<button class="hit" data-r="${q[R]}" style="--dc:${hc(q[ST])}">
    <span class="spine"></span>
    <span><span class="he">${esc(q[EN])}</span>
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
  $("#hits").innerHTML = RESULTS.slice(0, shown).map(hitHTML).join("")
    + (more > 0 ? `<button class="more" id="more">Show ${Math.min(PAGE, more)} more · ${more} left</button>` : "");
}
function renderSaved(){
  const list = [...saved].map(r => byRank.get(r)).filter(Boolean);
  $("#savedcount").textContent = list.length
    ? `${list.length} saved · tap one to ask it`
    : "Nothing saved yet";
  $("#savedlist").innerHTML = list.length ? list.map(hitHTML).join("")
    : `<div class="empty">Tap the bookmark on a card to keep it here.<br>
       Useful for questions you want to come back to.</div>`;
}
// Opening a specific question straight from Browse, Saved or the dashboard.
// Deliberately does not route through start(), whose consent path is async.
function openQuestion(rank){
  const q = byRank.get(rank); if(!q) return;
  let di = DATA.decks.findIndex(d => d.ids.includes(rank-1));
  if(di < 0){   // a few questions sit outside every deck; fall back on stage range
    di = DATA.decks.findIndex(d => { const t = stagesOf(d);
      return q[ST] >= t[0] && q[ST] <= t[t.length-1]; });
    if(di < 0) di = 0;
  }
  const st = stagesOf(DATA.decks[di]);
  S.deck = di;
  S.depth = Math.min(st[st.length-1], Math.max(st[0], q[ST]));
  S.sensOK = Math.max(3, q[SE]);
  S.asked = 0; S.topics = []; S.deepest = S.depth; S.turn = 0;
  S.cur = q; S.revealed = false; S.running = true; cardShownAt = Date.now();
  TRACK.sessionStart(di);
  show("session"); renderCard(); renderGauge(); save();
}
window.openQuestion = openQuestion;
