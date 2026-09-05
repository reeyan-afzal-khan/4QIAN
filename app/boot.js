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
toggle("#sw-tn","turns", () => { if(S.running) renderTurn(); });
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
$("#turn").addEventListener("click", e => {
  const b = e.target.closest("button[data-t]"); if(!b) return;
  S.turn = +b.dataset.t;
  renderTurn(); save();
});
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
/* The copy button on the card uses whatever format you set in Decks, so the
   one-tap path and the four-button path put the same thing on the clipboard. */
async function copyCurrent(){
  if(!S.cur) return;
  try{ await navigator.clipboard.writeText(copyText(S.cur, S.copyAs)); }
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

/* ---------------- the Words view ---------------- */
let vt;
$("#voc-q").addEventListener("input", e => {
  clearTimeout(vt);
  vt = setTimeout(() => { vocTerm = e.target.value; vocShown = 60; renderVocab(); }, 140);
});
$("#voc-lv").addEventListener("click", e => {
  const b = e.target.closest("button[data-l]"); if(!b) return;
  const n = +b.dataset.l;
  vocLevel.has(n) ? vocLevel.delete(n) : vocLevel.add(n);
  b.setAttribute("aria-pressed", vocLevel.has(n));
  vocShown = 60; renderVocab();
});
$("#voc-st").addEventListener("click", e => {
  const b = e.target.closest("button[data-w]"); if(!b) return;
  vocStatus = b.dataset.w;
  [...$("#voc-st").querySelectorAll("button")].forEach(x =>
    x.setAttribute("aria-pressed", x.dataset.w === vocStatus));
  vocShown = 60; renderVocab();
});
$("#voc-more").addEventListener("click", () => { vocShown += 60; renderVocab(); });
$("#voc-list").addEventListener("click", e => {
  const w = e.target.closest(".wrow"); if(w) showWord(w.dataset.w);
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

/* ---------------- send it ---------------- */
$("#sendbar").addEventListener("click", e => {
  const b = e.target.closest("button[data-send]"); if(!b) return;
  sendCopy(b.dataset.send);
});

seg("#copyas", "c", v => { S.copyAs = v; renderCopyPreview(); });
seg("#learning", "l", v => applyLearning(v));

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
  const jump = {"1":"setup","2":"dash","3":"browse","4":"words","5":"saved"}[e.key];
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
  else if(k==="t"){ S.turn ^= 1; renderCard(); save(); }
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
$("#sw-tn").setAttribute("aria-pressed", S.turns);
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
  renderDecks(); renderTopics(); renderFilters(); renderVocFilters();
  renderQOTD(); renderAbout();
  setPartner(S.partner); renderPeople(); renderPartner();
  applyLearning(S.learning); renderCopyPreview();
  wireDashboard();
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
