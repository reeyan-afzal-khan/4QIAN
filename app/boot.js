/* boot.js — event wiring and start-up. Loaded last, after every function it
   points at exists. */

/* ---------------- navigation ---------------- */
$("#nav").addEventListener("click", e => {
  const b = e.target.closest("button[data-v]");
  if(b) show(b.dataset.v);
});
$("#decks").addEventListener("click", e => {
  const b = e.target.closest(".deck"); if(b) start(+b.dataset.d);
});
$("#skins").addEventListener("click", e => {
  const b = e.target.closest(".skin"); if(b) applySkin(b.dataset.k);
});
$("#topics").addEventListener("click", e => {
  const b = e.target.closest(".topic"); if(!b) return;
  const c = +b.dataset.c;
  muted.has(c) ? muted.delete(c) : muted.add(c);
  b.setAttribute("aria-pressed", muted.has(c));
  S.muted = [...muted]; $("#mutedn").textContent = muted.size; save();
});
$("#mode").addEventListener("click", e => {
  const b = e.target.closest("button[data-m]"); if(!b) return;
  S.mode = b.dataset.m;
  [...$("#mode").children].forEach(x => x.setAttribute("aria-pressed", x===b));
  save(); if(S.running) renderCard();
});

/* A segmented control is the same three lines every time: mark the pressed
   button, write the value, run whatever the setting needs afterwards. */
function seg(sel, attr, apply, cast){
  const host = $(sel);
  host.addEventListener("click", e => {
    const b = e.target.closest("button[data-" + attr + "]"); if(!b) return;
    [...host.children].forEach(x => x.setAttribute("aria-pressed", x === b));
    apply(cast ? cast(b.dataset[attr]) : b.dataset[attr]);
    save();
  });
}
const segMark = (sel, attr, val) => [...$(sel).children].forEach(x =>
  x.setAttribute("aria-pressed", String(x.dataset[attr]) === String(val)));

seg("#goal", "g", v => { S.goal = v; if(S.running) renderGoal(); }, Number);
seg("#textsize", "t", v => applyText(v));
seg("#speakmode", "s", v => {
  S.speak = v;
  if(v === "off") SPEAK.stop();
  else if(S.cur && S.view === "session") SPEAK.card(S.cur);
});
seg("#rate", "r", v => { S.rate = v; }, Number);

$("#sw-auto-speak").addEventListener("click", () => {
  S.autoSpeak = !S.autoSpeak;
  $("#sw-auto-speak").setAttribute("aria-pressed", S.autoSpeak);
  if(S.autoSpeak && S.speak === "off"){
    S.speak = "zh";
    segMark("#speakmode", "s", "zh");
    toast("Speaking the Chinese on each new card");
  }
  save();
});

/* Follow the system. Turning it on adopts whatever the device is set to
   right now, using the current skin as one half of the pair so the change
   is never a jump to something the user has not chosen. */
$("#sw-auto").addEventListener("click", () => {
  S.autoTheme = !S.autoTheme;
  $("#sw-auto").setAttribute("aria-pressed", S.autoTheme);
  if(S.autoTheme){
    const sk = skinOf(S.skin);
    if(sk.dark) S.skinDark = sk.id; else S.skinLight = sk.id;
    syncSystemSkin();
    toast("Following the system · " + skinOf(S.skinDark).nm + " / " + skinOf(S.skinLight).nm);
  }else{
    paintSkin(S.skin);
  }
  save();
});
if(window.matchMedia){
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onFlip = () => syncSystemSkin();
  if(mq.addEventListener) mq.addEventListener("change", onFlip);
  else if(mq.addListener) mq.addListener(onFlip);
}
const toggle = (el, key, after) => $(el).addEventListener("click", () => {
  S[key] = !S[key]; $(el).setAttribute("aria-pressed", S[key]); save();
  if(after) after();
  if(S.running) renderCard();
});
toggle("#sw-py","pinyin", renderQOTD);   // the daily card shows pinyin too
toggle("#sw-fr","frame");
toggle("#sw-sc","score");
toggle("#sw-tr","track", () => {
  TRACK.setEnabled(S.track);
  toast(S.track ? "Tracking on" : "Tracking paused — the record is kept, just not added to");
});

/* ---------------- the card ---------------- */
$("#reveal").addEventListener("click", e => { e.stopPropagation(); S.revealed=true; renderCard(); });
$("#card").addEventListener("click", e => {
  if(e.target.closest("button")) return;
  if(S.mode!=="both" && !S.revealed){ S.revealed=true; renderCard(); }
});
/* Tapping a name sets whose turn it is, rather than blindly flipping — with
   two names on screen, tapping the one you mean should select it. */
$("#b-warm").addEventListener("click", () => move(1));
$("#b-cool").addEventListener("click", () => move(-1));
$("#b-skip").addEventListener("click", () => next(3));
$("#b-next").addEventListener("click", () => next(0));
$("#b-end").addEventListener("click", () => finishSession(true));
$("#b-save").addEventListener("click", e => {
  e.stopPropagation(); if(!S.cur) return;
  const r = S.cur[R];
  saved.has(r) ? saved.delete(r) : saved.add(r);
  S.saved = [...saved]; save(); renderCard();
});
$("#b-copy").addEventListener("click", e => { e.stopPropagation(); copyCurrent(); });
/* Chinese and English, always. Both the four-button "Send it" panel above the
   card and the format picker in Decks offered the same choice; a choice made
   once and then never again is a setting, and a setting nobody changes is
   just a default with a control attached. */
async function copyCurrent(){
  if(!S.cur) return;
  try{ await navigator.clipboard.writeText(copyText(S.cur)); }
  catch(_){ return toast("Could not reach the clipboard"); }
  const b = $("#b-copy"); b.setAttribute("aria-pressed","true");
  setTimeout(()=>b.setAttribute("aria-pressed","false"), 900);
  toast("Copied — paste it into your chat");
}
$("#b-speak").addEventListener("click", e => {
  e.stopPropagation();
  if(SPEAK.speaking()) return SPEAK.stop();
  SPEAK.card(S.cur, true);
});
$("#b-back").addEventListener("click", goBack);

/* ---------------- question of the day ---------------- */
$("#qotd").addEventListener("click", e => {
  const go = e.target.closest("button[data-qotd]");
  if(go) return openQuestion(+go.dataset.qotd);
  const say = e.target.closest("button[data-qsay]");
  if(say) SPEAK.card(byRank.get(+say.dataset.qsay), true);
});

/* ---------------- ad-hoc decks ---------------- */
$("#b-practice").addEventListener("click", () => {
  if(!RESULTS.length) return;
  const term = $("#q").value.trim();
  practise(RESULTS, term ? `“${term}”` : "Your filter");
});
$("#b-random").addEventListener("click", () => {
  if(!RESULTS.length) return;
  openQuestion(RESULTS[Math.floor(Math.random()*RESULTS.length)][R]);
});
$("#b-clearf").addEventListener("click", () => {
  fSens.clear(); fStage.clear(); fFreq = 0; fSort = "freq";
  $("#q").value = "";
  $("#f-sens").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed","false"));
  $("#f-stage").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed","false"));
  $("#f-freq").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b.dataset.q==="0"));
  $("#f-sort").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b.dataset.o==="freq"));
  runSearch();
});

/* ---------------- saved ---------------- */
$("#b-practice-saved").addEventListener("click", () => {
  const list = [...saved].map(r => byRank.get(r)).filter(Boolean);
  if(!list.length) return toast("Nothing saved yet");
  practise(list, "Saved questions");
});
$("#b-exp-saved").addEventListener("click", () => {
  const list = [...saved].map(r => byRank.get(r)).filter(Boolean);
  if(!list.length) return toast("Nothing saved yet");
  // Plain text rather than JSON: this one is meant to be pasted into a
  // message or printed, not re-imported.
  const out = ["4QIAN — saved questions", new Date().toLocaleDateString(), ""];
  for(const q of list){
    out.push(`Q${String(q[R]).padStart(4,"0")} · freq ${q[SC]} · ${DATA.categories[q[CA]]}`);
    out.push(q[EN]); out.push(q[ZH]); out.push(q[PY]); out.push("");
  }
  saveFile(`4qian-saved-${stamp()}.txt`, "text/plain", out.join("\r\n"));
});
$("#b-clear-saved").addEventListener("click", () => {
  const c = $("#confirm");
  $("#cf-h").textContent = "Clear your saved questions?";
  $("#cf-p").textContent = `This removes all ${saved.size} bookmarks. Your record and settings `
    + `are untouched, and the questions themselves are obviously still in the deck.`;
  c.returnValue = "";
  c.onclose = () => {
    if(c.returnValue !== "yes") return;
    saved.clear(); S.saved = []; save(); renderSaved(); toast("Saved list cleared");
  };
  c.showModal();
});
$("#savedlist").addEventListener("click", e => {
  const go = e.target.closest("button[data-go]");
  if(go) show(go.dataset.go);
});

/* ---------------- shortcuts sheet ---------------- */
$("#b-help").addEventListener("click", () => $("#help").showModal());

/* ---------------- browse ---------------- */
let tmr;
$("#q").addEventListener("input", () => { clearTimeout(tmr); tmr = setTimeout(runSearch, 140); });
$("#f-sens").addEventListener("click", e => {
  const b = e.target.closest("button[data-s]"); if(!b) return;
  const n = +b.dataset.s; fSens.has(n) ? fSens.delete(n) : fSens.add(n);
  b.setAttribute("aria-pressed", fSens.has(n)); runSearch();
});
$("#f-stage").addEventListener("click", e => {
  const b = e.target.closest("button[data-t]"); if(!b) return;
  const n = +b.dataset.t; fStage.has(n) ? fStage.delete(n) : fStage.add(n);
  b.setAttribute("aria-pressed", fStage.has(n)); runSearch();
});
$("#f-freq").addEventListener("click", e => {
  const b = e.target.closest("button[data-q]"); if(!b) return;
  fFreq = +b.dataset.q;
  [...$("#f-freq").querySelectorAll("button")].forEach(x =>
    x.setAttribute("aria-pressed", +x.dataset.q === fFreq));
  runSearch();
});
$("#f-sort").addEventListener("click", e => {
  const b = e.target.closest("button[data-o]"); if(!b) return;
  fSort = b.dataset.o;
  [...$("#f-sort").querySelectorAll("button")].forEach(x =>
    x.setAttribute("aria-pressed", x.dataset.o === fSort));
  runSearch();
});
const hitClick = e => {
  if(e.target.closest("#more")){ shown = Math.min(shown + PAGE, RESULTS.length); renderHits(); return; }
  const b = e.target.closest(".hit"); if(b) openQuestion(+b.dataset.r);
};
$("#hits").addEventListener("click", hitClick);
$("#savedlist").addEventListener("click", hitClick);

/* ---------------- study panel ---------------- */
$("#study-toggle").addEventListener("click", () => {
  const body = $("#study-body");
  const open = body.classList.toggle("hidden");
  $("#study-toggle").setAttribute("aria-expanded", String(!open));
  // Opening it by hand is a preference about every card, not just this one.
  S.studyOpen = !open;
  $("#sw-studyopen").setAttribute("aria-pressed", S.studyOpen);
  save(); renderStudy();
});
$("#study-tabs").addEventListener("click", e => {
  const b = e.target.closest("button[data-s]"); if(!b) return;
  studyTab = b.dataset.s; renderStudy();
});
$("#study-pane").addEventListener("click", e => {
  const say = e.target.closest("button[data-say]");
  if(say){ e.preventDefault(); SPEAK.say([{lang:"zh", text: say.dataset.say}]); return; }
  const w = e.target.closest(".wrow");
  if(w) showWord(w.dataset.w);
});

toggle("#sw-vocab",  "vocab",  renderStudy);
toggle("#sw-answer", "answer", renderStudy);
$("#sw-studyopen").addEventListener("click", () => {
  S.studyOpen = !S.studyOpen;
  $("#sw-studyopen").setAttribute("aria-pressed", S.studyOpen);
  $("#study-body").classList.toggle("hidden", !S.studyOpen);
  $("#study-toggle").setAttribute("aria-expanded", String(S.studyOpen));
  save(); renderStudy();
});

$("#word-uses").addEventListener("click", e => {
  const u = e.target.closest(".wuse"); if(!u) return;
  $("#word").close();
  openQuestion(+u.dataset.r);
});

/* ---------------- who you are talking to ---------------- */
let partnerTimer;
$("#partner").addEventListener("input", e => {
  const v = e.target.value;
  clearTimeout(partnerTimer);
  // Debounced, because setPartner touches the record and swaps the seen set,
  // and doing that on every keystroke of a name would be wasteful.
  partnerTimer = setTimeout(() => {
    setPartner(v);
    renderPeople(); renderPartner();
    if(S.running) renderGauge();
  }, 300);
});
$("#recent-people").addEventListener("click", e => {
  const b = e.target.closest(".person"); if(!b) return;
  $("#partner").value = b.dataset.p;
  setPartner(b.dataset.p);
  renderPeople(); renderPartner();
  const st = TRACK.personStats(PID);
  toast(st.covered
    ? `${b.dataset.p} — ${nf(st.covered)} questions already used, they won't come round again`
    : `${b.dataset.p} — nothing asked yet`);
  if(S.running) renderGauge();
});

seg("#learning", "l", v => applyLearning(v));

/* ---------------- Settings: the profile ----------------
 *
 * Four fields, and every one of them changes what the app does. A profile that
 * only remembers a name is a form pretending to be a feature.
 *
 *   name     the turn bar says "Reeyan", not "You"
 *   daily    a per-day target, shown against today on the Dashboard
 *   ceiling  the hardest cap in the app: the deck may never offer above it,
 *            and the consent prompt cannot raise past it
 *
 * Which language you are practising already existed and keeps its own panel;
 * it moves here rather than being duplicated.
 */

/* core.js already names the five levels; a second table here would be one
   more thing to keep in step for no gain. Only the top of the scale needs a
   different word, because "Very sensitive" as a ceiling means no ceiling. */
const ceilingLabel = c => (c >= 5 ? "No limit" : SENS_NAME[c - 1] || String(c));

function profile(){
  S.profile = S.profile || {};
  const p = S.profile;
  if(p.name == null)    p.name = "";
  if(p.daily == null)   p.daily = 0;
  /* 5 is "no limit", which is what the app did before this existed — an
     upgrade must not quietly start withholding questions. */
  if(p.ceiling == null) p.ceiling = 5;
  return p;
}

/* The one-glyph face. Not decoration: at a glance it is the difference between
   "this is my record" and "this is somebody's record", which matters on a
   shared laptop. */
function profileInitial(){
  const n = (profile().name || "").trim();
  if(!n) return "4";
  const ch = n.replace(/^@+/, "").trim().charAt(0);
  return (ch || "4").toUpperCase();
}

function renderProfile(){
  const p = profile();
  $("#prof-face").textContent = profileInitial();
  if($("#prof-name").value !== p.name) $("#prof-name").value = p.name;

  $("#prof-name-note").textContent = p.name
    ? `Turn prompts will say “${p.name}” instead of “You”.`
    : "Left blank, the app just says “You”.";

  for(const b of $("#prof-daily").children)
    b.setAttribute("aria-pressed", String(+b.dataset.d === (p.daily | 0)));
  const doneToday = TRACK.days()[TRACK.dayKey(Date.now())] | 0;
  $("#prof-daily-note").textContent = p.daily
    ? `${nf(doneToday)} of ${nf(p.daily)} today.` +
      (doneToday >= p.daily ? " Done — anything more is extra." : "")
    : "Without a target the Dashboard just counts what you did.";

  for(const b of $("#prof-ceiling").children)
    b.setAttribute("aria-pressed", String(+b.dataset.c === (p.ceiling | 5)));
  $("#prof-ceiling-note").textContent = p.ceiling >= 5
    ? "Every level is available, with the usual confirmation before 4 and 5."
    : `Nothing above ${ceilingLabel(p.ceiling)} is ever offered, on any deck, ` +
      "and the confirmation cannot raise past it.";

  const bits = [];
  if(p.name) bits.push(p.name);
  if(p.daily) bits.push(p.daily + " a day");
  if(p.ceiling < 5) bits.push("max " + ceilingLabel(p.ceiling).toLowerCase());
  $("#prof-meta").textContent = bits.join(" · ");

  renderRail();

  const f = TRACK.first();
  $("#settings-since").textContent = f
    ? "practising since " + new Date(f * 1000).toLocaleDateString(undefined,
        {month: "short", year: "numeric"})
    : "";
}

$("#prof-name").addEventListener("input", e => {
  profile().name = e.target.value.slice(0, 24);
  save();
  renderProfile();
});

$("#prof-daily").addEventListener("click", e => {
  const b = e.target.closest("button[data-d]"); if(!b) return;
  profile().daily = +b.dataset.d;
  save(); renderProfile();
  if(S.view === "dash") renderDash();
});

$("#prof-ceiling").addEventListener("click", e => {
  const b = e.target.closest("button[data-c]"); if(!b) return;
  const c = +b.dataset.c;
  profile().ceiling = c;
  /* Lowering the ceiling has to bite immediately, including on a run that is
     already open above it — otherwise the setting is a promise the current
     session does not keep. */
  if(S.sensOK > c) S.sensOK = c;
  if(S.depth > c) S.depth = c;
  save(); renderProfile();
  if(typeof renderGauge === "function") renderGauge();
  if(S.view === "session" && typeof renderCard === "function") renderCard();
});

/* Settings owns the app's configuration, so the panels that were scattered
   through Decks and the Dashboard are moved here at boot rather than copied.
   Moving the real elements keeps every handler already bound to them; a second
   copy would need every one of those wired again and kept in step. */
function buildSettings(){
  const host = $("#settings-body");
  if(!host) return;
  const inside = [
    "#learning", "#goal", "#skins", "#speakmode", "#sw-vocab",
    "#textsize", "#mode", "#mutedn", "#b-install", "#about",
    ".datarow", "#drive-panel"
  ];
  for(const sel of inside){
    const el = document.querySelector(sel);
    if(!el) continue;
    const panel = el.closest(".panel");
    if(panel && panel.parentNode !== host) host.appendChild(panel);
  }
}

/* ---------------- collapsible panels ----------------
 *
 * Every panel with a heading folds away, and what is folded is remembered.
 * The Dashboard alone is a dozen panels tall; being able to shut the ones you
 * are not reading is the difference between scrolling past them every visit
 * and not.
 *
 * Done here rather than in the markup: thirty-five panels would otherwise each
 * need a wrapper, a button and an id by hand, and every panel added later
 * would need someone to remember. This walks the DOM once at boot, so a new
 * panel is collapsible the moment it exists.
 */

/* A key that survives a rename of the visible label. Panel ids where they
   exist; otherwise the section plus the heading's own text, because "People"
   is a heading on both the Dashboard and Insights and one key for the two of
   them would fold them together. */
function foldKey(panel, h3){
  if(panel.id) return panel.id;
  const section = panel.closest("section");
  const label = [...h3.childNodes]
    .filter(n => n.nodeType === 3).map(n => n.textContent).join("")
    .trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return (section ? section.id + ":" : "") + (label || "panel");
}

const CHEVRON =
  '<svg class="pfold" width="14" height="14" viewBox="0 0 24 24" fill="none" ' +
  'stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
  'stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

function setFolded(panel, folded){
  const body = panel.querySelector(":scope > .panel-body");
  const h3 = panel.querySelector(":scope > h3");
  if(!body || !h3) return;
  panel.classList.toggle("folded", folded);
  body.hidden = folded;
  h3.setAttribute("aria-expanded", String(!folded));
  S.folded = S.folded || {};
  if(folded) S.folded[panel.dataset.foldKey] = 1;
  else delete S.folded[panel.dataset.foldKey];
  save();
}

function toggleFold(panel){
  const folded = !panel.classList.contains("folded");
  setFolded(panel, folded);
  /* A chart drawn inside a hidden panel measures zero and comes back the wrong
     size, so the view is redrawn when a panel opens rather than when it
     closes. Cheap: both renderers derive everything on the spot anyway. */
  if(!folded){
    if(S.view === "dash") renderDash();
    else if(S.view === "insights") renderInsights();
  }
}

function makeCollapsible(){
  S.folded = S.folded || {};
  for(const panel of document.querySelectorAll(".panel")){
    const h3 = panel.querySelector(":scope > h3");
    if(!h3 || panel.dataset.foldKey) continue;

    const key = foldKey(panel, h3);
    panel.dataset.foldKey = key;

    /* Everything after the heading becomes the body, so one flag hides the
       whole panel without touching what is inside it. */
    const body = document.createElement("div");
    body.className = "panel-body";
    while(h3.nextSibling) body.appendChild(h3.nextSibling);
    panel.appendChild(body);

    h3.setAttribute("role", "button");
    h3.setAttribute("tabindex", "0");
    h3.insertAdjacentHTML("beforeend", CHEVRON);
    h3.addEventListener("click", () => toggleFold(panel));
    h3.addEventListener("keydown", e => {
      if(e.key === "Enter" || e.key === " "){ e.preventDefault(); toggleFold(panel); }
    });

    setFolded(panel, !!S.folded[key]);
  }
  wireFoldAll();
}

/* One control per long view, because folding twelve panels one at a time to
   get to the bottom of the Dashboard is its own kind of tedium. */
function wireFoldAll(){
  for(const id of ["v-dash", "v-insights"]){
    const head = document.querySelector("#" + id + " .dash-h");
    if(!head || head.querySelector(".foldall")) continue;
    const b = document.createElement("button");
    b.className = "ghost sm foldall";
    b.addEventListener("click", () => {
      const panels = [...document.querySelectorAll("#" + id + " .panel[data-fold-key]")];
      const anyOpen = panels.some(p => !p.classList.contains("folded"));
      for(const p of panels) setFolded(p, anyOpen);
      if(!anyOpen){
        if(S.view === "dash") renderDash();
        else if(S.view === "insights") renderInsights();
      }
      paintFoldAll();
    });
    head.appendChild(b);
  }
  paintFoldAll();
}

function paintFoldAll(){
  for(const id of ["v-dash", "v-insights"]){
    const b = document.querySelector("#" + id + " .foldall");
    if(!b) continue;
    const panels = [...document.querySelectorAll("#" + id + " .panel[data-fold-key]")];
    const anyOpen = panels.some(p => !p.classList.contains("folded"));
    b.textContent = anyOpen ? "Collapse all" : "Expand all";
  }
}

/* ---------------- the rail card ---------------- */
/* Everything here is already true somewhere else in the app; the point is not
   to compute it but to put it where you can see it without navigating. Read
   straight off TRACK and the two connectors, so it cannot drift out of step
   with the panels it summarises. */
function renderRail(){
  const card = $("#railcard");
  if(!card) return;
  const p = profile();

  $("#rc-face").textContent = profileInitial();
  $("#rc-name").textContent = p.name || "You";

  const bits = [];
  bits.push(p.ceiling >= 5 ? "Every level" : "Max " + ceilingLabel(p.ceiling).toLowerCase());
  bits.push(S.mode === "en" ? "learning English" : "learning 中文");
  $("#rc-sub").textContent = bits.join(" · ");

  /* Today, against the target if there is one. */
  const done = TRACK.days()[TRACK.dayKey(Date.now())] | 0;
  $("#rc-today").textContent = p.daily ? done + " / " + p.daily : nf(done);
  const bar = $("#rc-bar");
  bar.hidden = !p.daily;
  if(p.daily) $("#rc-fill").style.width =
    Math.min(100, Math.round(done / p.daily * 100)) + "%";

  $("#rc-streak").textContent = nf(TRACK.streak().cur);
  $("#rc-cover").textContent  = pct(TRACK.uniques(), CORPUS.n) + "%";

  /* Where a CSV actually lands. Three states, because "picked a folder" and
     "the browser still has permission for it" are not the same thing. */
  const fdot = $("#rc-fdot"), fs = $("#rc-folder-s");
  const fReady = window.FOLDER && FOLDER.ready();
  const fPerm  = card.dataset.perm;           // last permission renderFolder saw
  fdot.className = "rc-dot" + (fReady && fPerm !== "prompt" ? " on"
                             : fReady ? " warn" : "");
  fs.textContent = !fReady ? "Downloads"
    : fPerm === "prompt" ? "Needs reconnecting"
    : FOLDER.name();

  const ddot = $("#rc-ddot"), ds = $("#rc-drive-s");
  const c = window.DRIVE ? DRIVE.get() : {};
  const dOn = window.DRIVE && DRIVE.configured();
  ddot.className = "rc-dot" + (dOn ? (c.last ? " on" : " warn") : "");
  ds.textContent = !dOn ? "Not connected"
    : c.last ? "Synced " + new Date(c.last).toLocaleDateString(undefined,
        {day: "numeric", month: "short"})
    : "Never synced";
}

/* A tap goes to the panel that owns the thing, opening it if it was folded —
   landing on a collapsed heading would look like the link did nothing. */
function railJump(sel){
  show("settings");
  const el = $(sel);
  if(!el) return;
  const panel = el.closest(".panel");
  if(panel && panel.classList.contains("folded")) setFolded(panel, false);
  el.scrollIntoView({block: "center", behavior: "smooth"});
  el.classList.add("flash");
  setTimeout(() => el.classList.remove("flash"), 1200);
}
$("#rc-you").addEventListener("click",    () => railJump("#profile-panel"));
$("#rc-folder").addEventListener("click", () => railJump("#fold-row"));
$("#rc-drive").addEventListener("click",  () => railJump("#drive-panel"));

/* ---------------- where exports go ---------------- */

function renderFolder(perm){
  const row = $("#fold-row");
  /* Stashed for renderRail, which needs it and is not passed it. */
  if($("#railcard")) $("#railcard").dataset.perm = perm || "";
  if(!FOLDER.supported()){
    /* Nothing to offer: no picker here. Say where files go rather than
       showing a button that cannot work. */
    $("#fold-name").textContent = window.Capacitor
      ? "Exports go to Documents" : "Exports go to your downloads";
    $("#fold-note").textContent = window.Capacitor ? ""
      : "Choosing a folder needs Chrome or Edge.";
    $("#b-fold-pick").classList.add("hidden");
    $("#b-fold-forget").classList.add("hidden");
    $("#b-fold-reconnect").classList.add("hidden");
    renderRail();
    return;
  }

  const on = FOLDER.ready() && perm !== "prompt";
  $("#fold-name").textContent = on
    ? "Exports go to " + FOLDER.name()
    : perm === "prompt"
      ? "Folder needs reconnecting: " + FOLDER.name()
      : "Exports go to your downloads";
  $("#fold-note").textContent = on
    ? "If that folder is inside your Google Drive, Drive syncs it for you — nothing else to do."
    : perm === "prompt"
      ? "The browser forgets folder permission when it restarts. One click restores it."
      : "Pick a folder and the CSV is written straight there instead of downloaded.";

  $("#b-fold-reconnect").classList.toggle("hidden", perm !== "prompt");
  $("#b-fold-pick").classList.toggle("hidden", on);
  $("#b-fold-forget").classList.toggle("hidden", !FOLDER.ready());
  renderRail();
}

$("#b-fold-pick").addEventListener("click", async () => {
  try{
    const nm = await FOLDER.pick();
    toast("Exports will be written to " + nm);
    renderFolder("granted"); renderDrive();
  }catch(err){
    /* An abandoned file dialog throws; that is a choice, not a fault. */
    if(err && err.name === "AbortError") return;
    toast(err.message || "Could not use that folder");
  }
});

$("#b-fold-reconnect").addEventListener("click", async () => {
  try{
    const ok = await FOLDER.reconnect();
    toast(ok ? "Folder reconnected" : "Permission was not granted");
    renderFolder(ok ? "granted" : "prompt"); renderDrive();
  }catch(err){ toast(err.message || "Could not reconnect"); }
});

$("#b-fold-forget").addEventListener("click", async () => {
  await FOLDER.forget();
  toast("Exports go to your downloads again");
  renderFolder(""); renderDrive();
});

/* ---------------- Google Drive folder ---------------- */

function renderDrive(){
  const c = DRIVE.get();
  const on = DRIVE.configured();
  $("#dr-state").textContent = !on ? "off"
    : c.last ? "synced " + new Date(c.last).toLocaleString(undefined,
        {day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"})
    : c.folder ? "connected to " + c.folder
    : "set up, not synced yet";
  /* A wrong URL is the single most common way this fails, and the browser's
     own error for it says nothing. Say it here, as soon as it is typed. */
  const bad = c.url ? DRIVE.urlProblem(c.url) : "";
  const viaFolder = window.FOLDER && FOLDER.ready();
  $("#dr-mine").textContent = bad ? bad
    : on ? (viaFolder
        ? `Sync writes into ${FOLDER.name()}, mirrors it with the Drive folder both ways, ` +
          `and merges in anything new.`
        : `Each sync writes a new ${DRIVE.snapshotName()} and merges in every file it ` +
          `has not taken yet.`)
    : "";
  $("#dr-mine").classList.toggle("bad", !!bad);
  for(const id of ["dr-sync", "dr-upload", "dr-test", "dr-refresh"])
    $("#" + id).disabled = !on;
  renderRail();
}

function driveBusy(btn, on, label){
  btn.disabled = on;
  if(on){ btn.dataset.was = btn.textContent; btn.textContent = label; }
  else if(btn.dataset.was){ btn.textContent = btn.dataset.was; delete btn.dataset.was; }
}

const driveSay = (msg, bad) => {
  const n = $("#dr-note");
  n.textContent = msg || "";
  n.classList.toggle("bad", !!bad);
};

function renderDriveFiles(files){
  const host = $("#dr-files");
  host.textContent = "";
  if(!files) return;
  if(!files.length){
    const p = document.createElement("p");
    p.className = "pmeta"; p.style.margin = "12px 0 0";
    p.textContent = "The folder has no CSVs in it yet.";
    host.appendChild(p);
    return;
  }
  const taken = DRIVE.imported();
  for(const f of files){
    const row = document.createElement("div");
    row.className = "drive-file";

    const nm = document.createElement("span");
    nm.className = "dfn";
    nm.textContent = f.name;                 // a filename is data: text, never markup
    /* Files already folded in are marked, so the folder reads as "what is new"
       rather than as an undifferentiated pile. */
    if(taken.has(f.id)){
      const tag = document.createElement("b");
      tag.textContent = "  merged";
      tag.style.color = "var(--muted)"; tag.style.fontWeight = "600";
      nm.appendChild(tag);
    }

    const meta = document.createElement("span");
    meta.className = "dfm";
    const kb = f.size ? Math.max(1, Math.round(f.size / 1024)) + " KB" : "";
    const when = f.modified ? new Date(f.modified).toLocaleDateString(undefined,
      {day: "numeric", month: "short"}) : "";
    meta.textContent = [kb, when].filter(Boolean).join(" · ");

    const acts = document.createElement("div");
    acts.className = "dfa";

    const imp = document.createElement("button");
    imp.textContent = "Import";
    imp.addEventListener("click", async () => {
      driveBusy(imp, true, "…");
      try{
        const got = TRACK.importCSV(await DRIVE.read(f.id), deckIndex);
        toast(`Merged · ${nf(got.events)} entries, ${nf(got.sessions)} sessions`);
        renderDash();
        driveSay("");
      }catch(err){ driveSay(err.message, true); }
      driveBusy(imp, false);
    });

    const del = document.createElement("button");
    del.className = "dfx"; del.textContent = "Delete";
    del.addEventListener("click", async () => {
      driveBusy(del, true, "…");
      try{
        await DRIVE.remove(f.id);
        driveSay("Deleted " + f.name + ".");
        renderDriveFiles(await DRIVE.list());
      }catch(err){ driveSay(err.message, true); }
      driveBusy(del, false);
    });

    acts.append(imp, del);
    row.append(nm, meta, acts);
    host.appendChild(row);
  }
}

for(const [sel, key] of [["#dr-url", "url"], ["#dr-token", "token"], ["#dr-device", "device"]])
  $(sel).addEventListener("input", e => {
    DRIVE.set({[key]: e.target.value.trim()});
    renderDrive();
  });

$("#dr-test").addEventListener("click", async () => {
  const b = $("#dr-test");
  driveBusy(b, true, "Testing…");
  try{
    const out = await DRIVE.test();
    driveSay(`Connected to “${out.folder}”.`);
    renderDriveFiles(await DRIVE.list());
  }catch(err){ driveSay(err.message, true); }
  driveBusy(b, false);
  renderDrive();
});

$("#dr-upload").addEventListener("click", async () => {
  const b = $("#dr-upload");
  if(!TRACK.events().length) return driveSay("Nothing to upload yet.", true);
  driveBusy(b, true, "Uploading…");
  try{
    const f = await DRIVE.upload(TRACK.toCSV(csvLookup, deckName));
    driveSay(`Uploaded ${f.name}.`);
    renderDriveFiles(await DRIVE.list());
  }catch(err){ driveSay(err.message, true); }
  driveBusy(b, false);
  renderDrive();
});

$("#dr-sync").addEventListener("click", async () => {
  const b = $("#dr-sync");
  driveBusy(b, true, "Syncing…");
  try{
    const out = await DRIVE.sync(
      TRACK.toCSV(csvLookup, deckName),
      text => TRACK.importCSV(text, deckIndex),
      window.FOLDER);
    const bits = [`Wrote ${out.mine}`];
    if(out.up || out.down)
      bits.push(`mirrored ${nf(out.up)} up, ${nf(out.down)} down`);
    bits.push(out.merged
      ? `merged ${nf(out.merged)} new ${out.merged === 1 ? "file" : "files"}`
      : "nothing new to merge");
    if(out.skipped) bits.push(`${nf(out.skipped)} unreadable and skipped`);
    driveSay(bits.join(" · ") + ".");
    renderDash();
    renderDriveFiles(await DRIVE.list());
  }catch(err){ driveSay(err.message, true); }
  driveBusy(b, false);
  renderDrive();
});

$("#dr-refresh").addEventListener("click", async () => {
  const b = $("#dr-refresh");
  driveBusy(b, true, "…");
  try{ renderDriveFiles(await DRIVE.list()); driveSay(""); }
  catch(err){ driveSay(err.message, true); }
  driveBusy(b, false);
  renderDrive();
});

/* ---------------- the tour ---------------- */
$("#tour-next").addEventListener("click", () => TOUR.next());
$("#tour-back").addEventListener("click", () => TOUR.back());
$("#tour-skip").addEventListener("click", () => { S.toured = true; save(); TOUR.stop(); });
$("#tour-dim").addEventListener("click", () => { S.toured = true; save(); TOUR.stop(); });

$("#b-tour").addEventListener("click", () => {
  // Running it by hand restarts the whole thing, session half included.
  sessionTourPending = true;
  TOUR.start("setup");
});

/* The session half fires once, on the first card of the first run, because
   that is the only moment every element it points at is actually on screen. */
let sessionTourPending = false;
function maybeSessionTour(){
  if(!sessionTourPending || TOUR.open()) return;
  sessionTourPending = false;
  setTimeout(() => TOUR.start("session", () => { S.toured = true; save(); }), 420);
}

/* ---------------- quick start ---------------- */
/* Coffee chat, because it is the widest deck that still opens on safe ground:
   2,300 cards starting at small talk. Somebody who has not chosen a deck yet
   is best served by the one that cannot go wrong. */
$("#b-quickstart").addEventListener("click", () => {
  const i = DATA.decks.findIndex(d => d.name === "Coffee chat");
  start(i < 0 ? 0 : i);
});

/* ---------------- card legend ---------------- */
$("#b-legend").addEventListener("click", e => {
  e.stopPropagation();
  $("#legend").showModal();
});

/* ---------------- swipe ---------------- */
let sx=0, sy=0, sw=false;
const card = $("#card");
card.addEventListener("touchstart", e => {
  sx = e.touches[0].clientX; sy = e.touches[0].clientY; sw = true;
}, {passive:true});
card.addEventListener("touchmove", e => {
  if(!sw) return;
  const dx = e.touches[0].clientX - sx;
  card.classList.toggle("swipe-w", dx > 40);
  card.classList.toggle("swipe-c", dx < -40);
}, {passive:true});
card.addEventListener("touchend", e => {
  if(!sw) return; sw = false;
  card.classList.remove("swipe-w","swipe-c");
  const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
  if(Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 1 : -1);
  else if(dy < -55 && Math.abs(dy) > Math.abs(dx)) next(3);
}, {passive:true});

/* ---------------- keyboard ---------------- */
const anyDialogOpen = () =>
  $("#gate").open || $("#recap").open || $("#confirm").open ||
  $("#help").open || $("#word").open || $("#legend").open || TOUR.open();

document.addEventListener("keydown", e => {
  if(anyDialogOpen()) return;
  if(e.metaKey || e.ctrlKey || e.altKey) return;

  // Inside a text field only Escape means anything. Guarded rather than
  // called straight: a keydown can be retargeted at something that is not an
  // Element, and a throw here would take the whole shortcut map down with it.
  const t = e.target;
  if(t && typeof t.matches === "function" && t.matches("input,textarea")){
    if(e.key === "Escape"){
      t.value = ""; t.blur();
      // Two search boxes, two lists to redraw.
      if(t.id === "log-q"){ logTerm = ""; logShown = 40; renderLog(); }
      else runSearch();
    }
    return;
  }
  if(e.key === "Escape" && S.view !== "setup"){ show("setup"); return; }

  /* --- anywhere --- */
  if(e.key === "?" || (e.key === "/" && e.shiftKey)){ e.preventDefault(); $("#help").showModal(); return; }
  if(e.key === "/"){ e.preventDefault(); show("browse"); $("#q").focus(); return; }
  const jump = {"1":"setup","2":"dash","3":"insights","4":"browse",
                "5":"saved","6":"settings"}[e.key];
  if(jump){ show(jump); return; }

  /* --- in a session --- */
  if(S.view !== "session") return;
  const k = e.key.toLowerCase();
  if(e.key==="ArrowRight") move(1);
  else if(e.key==="ArrowLeft") move(-1);
  else if(e.key===" "){ e.preventDefault(); next(0); }
  else if(k==="x") next(3);
  else if(k==="s") $("#b-save").click();
  else if(k==="c") copyCurrent();
  else if(k==="p") $("#b-speak").click();
  else if(k==="b") goBack();
  else if(k==="r"){ if(!S.revealed){ S.revealed = true; renderCard(); } }
});

/* Android's back button, forwarded by the Capacitor shell. Backs out of a
   session rather than closing the app mid-conversation. */
window.cdgBack = function(){
  if(anyDialogOpen()) return true;
  if(S.view !== "setup"){ show("setup"); return true; }
  return false;   // already home: let the shell close the app
};

/* ---------------- install prompt ----------------
   Chrome fires this instead of showing its own banner once the PWA criteria
   are met. There is nothing to show until it does, so the panel starts
   hidden and the browsers that never fire it never advertise a button that
   would do nothing. */
let installPrompt = null;
addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  installPrompt = e;
  $("#install-panel").classList.remove("hidden");
});
addEventListener("appinstalled", () => {
  installPrompt = null;
  $("#install-panel").classList.add("hidden");
  toast("Installed");
});
$("#b-install").addEventListener("click", async () => {
  if(!installPrompt) return;
  installPrompt.prompt();
  try{ await installPrompt.userChoice; }catch(e){}
  installPrompt = null;
  $("#install-panel").classList.add("hidden");
});

/* ---------------- about ---------------- */
function renderAbout(){
  const where = window.Capacitor ? "Android"
              : matchMedia("(display-mode: standalone)").matches ? "Installed web app"
              : location.protocol === "file:" ? "Local files" : "Web";
  const rows = [
    ["Version", esc(APP_VERSION)],
    ["Questions", nf(DATA.q.length)],
    ["Topics", nf(DATA.categories.length)],
    ["Grammar patterns", nf(DATA.frames.length)],
    ["Glossed words", nf(VOCAB.size)],
    /* Every question reaches a full AREC answer; 55 of them are written for
       that exact question rather than for its topic and shape. Reporting only
       the 55 undersells the coverage; reporting only the total oversells it. */
    ["Model answers", "All " + nf(DATA.q.length)],
    ["Question-specific", nf(ANS.count)],
    ["Decks", nf(DATA.decks.length)],
    ["Deck version", esc(String(DATA.version || "—"))],
    ["Running as", esc(where)],
    ["Storage", "This device only"]
  ];
  $("#about").innerHTML = rows.map(([k,v]) =>
    `<div><span>${esc(k)}</span><b>${v}</b></div>`).join("");
}

/* ---------------- boot ---------------- */
$("#sw-py").setAttribute("aria-pressed", S.pinyin);
$("#sw-fr").setAttribute("aria-pressed", S.frame);
$("#sw-sc").setAttribute("aria-pressed", S.score);
$("#partner").value = S.partner || "";
$("#sw-tr").setAttribute("aria-pressed", S.track);
$("#sw-auto").setAttribute("aria-pressed", S.autoTheme);
$("#sw-auto-speak").setAttribute("aria-pressed", S.autoSpeak);
$("#sw-vocab").setAttribute("aria-pressed", S.vocab);
$("#sw-answer").setAttribute("aria-pressed", S.answer);
$("#sw-studyopen").setAttribute("aria-pressed", S.studyOpen);
$("#study-body").classList.toggle("hidden", !S.studyOpen);
$("#study-toggle").setAttribute("aria-expanded", String(S.studyOpen));
[...$("#mode").children].forEach(x => x.setAttribute("aria-pressed", x.dataset.m === S.mode));
segMark("#goal", "g", S.goal|0);
segMark("#speakmode", "s", S.speak);
segMark("#rate", "r", S.rate);

try{
  if(!DATA || !Array.isArray(DATA.q) || !DATA.q.length)
    throw new Error("The question data did not load.\nIf you opened this from a "
      + "folder, questions.js must sit in the same folder as index.html.");
  TRACK.setEnabled(S.track);
  renderSkins();
  applyText(S.text);
  // Auto-theme decides the palette; otherwise the stored one stands.
  if(S.autoTheme) syncSystemSkin(); else paintSkin(S.skin);
  renderDecks(); renderTopics(); renderFilters();
  renderQOTD(); renderAbout();
  setPartner(S.partner); renderPeople(); renderPartner();
  applyLearning(S.learning);
  wireDashboard(); wireInsights();
  buildSettings(); makeCollapsible(); renderProfile();
  /* The folder handle lives in IndexedDB, so restoring it is async and the
     panel paints twice: once with what is known, once when the answer lands. */
  renderFolder("");
  FOLDER.restore().then(p => { renderFolder(p); renderDrive(); })
              .catch(() => renderFolder(""));
  $("#dr-url").value    = DRIVE.get().url || "";
  $("#dr-token").value  = DRIVE.get().token || "";
  $("#dr-device").value = DRIVE.get().device || DRIVE.defaultDevice();
  renderDrive();
  $("#b-go-insights").addEventListener("click", () => show("insights"));
  show("setup");
  /* First run: offer the tour rather than launching into it, because an
     overlay you did not ask for is the thing people close without reading. */
  if(!S.toured) setTimeout(() => { if(!TOUR.open()){ sessionTourPending = true; TOUR.start("setup"); } }, 500);
}catch(err){
  window.boom("The deck could not start.", (err && (err.stack || err.message)) || String(err));
}

/* Service worker needs a real origin; skipped on file:// and inside the
   native shells, which serve their own copy of these files. */
if("serviceWorker" in navigator && location.protocol.startsWith("http") && !window.Capacitor){
  addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(()=>{}));
}
