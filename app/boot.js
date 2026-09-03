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
const toggle = (el, key, after) => $(el).addEventListener("click", () => {
  S[key] = !S[key]; $(el).setAttribute("aria-pressed", S[key]); save();
  if(after) after();
  if(S.running) renderCard();
});
toggle("#sw-py","pinyin");
toggle("#sw-fr","frame");
toggle("#sw-sc","score");
toggle("#sw-tn","turns");
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
$("#turn").addEventListener("click", () => { S.turn ^= 1; renderCard(); save(); });
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
$("#b-copy").addEventListener("click", async e => {
  e.stopPropagation(); if(!S.cur) return;
  const t = S.cur[EN] + "\n" + S.cur[ZH] + "\n" + S.cur[PY];
  try{ await navigator.clipboard.writeText(t); }catch(_){ return; }
  const b = $("#b-copy"); b.setAttribute("aria-pressed","true");
  setTimeout(()=>b.setAttribute("aria-pressed","false"), 900);
});

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
document.addEventListener("keydown", e => {
  if($("#gate").open || $("#recap").open || $("#confirm").open) return;
  if(e.target.matches("input,textarea")) return;
  if(e.key === "Escape" && S.view !== "setup"){ show("setup"); return; }
  if(S.view !== "session") return;
  if(e.key==="ArrowRight") move(1);
  else if(e.key==="ArrowLeft") move(-1);
  else if(e.key===" "){ e.preventDefault(); next(0); }
  else if(e.key.toLowerCase()==="s") $("#b-save").click();
});

/* Android's back button, forwarded by the Capacitor shell. Backs out of a
   session rather than closing the app mid-conversation. */
window.cdgBack = function(){
  if($("#gate").open || $("#recap").open || $("#confirm").open) return true;
  if(S.view !== "setup"){ show("setup"); return true; }
  return false;   // already home: let the shell close the app
};

/* ---------------- boot ---------------- */
$("#sw-py").setAttribute("aria-pressed", S.pinyin);
$("#sw-fr").setAttribute("aria-pressed", S.frame);
$("#sw-sc").setAttribute("aria-pressed", S.score);
$("#sw-tn").setAttribute("aria-pressed", S.turns);
$("#sw-tr").setAttribute("aria-pressed", S.track);
[...$("#mode").children].forEach(x => x.setAttribute("aria-pressed", x.dataset.m === S.mode));

try{
  if(!DATA || !Array.isArray(DATA.q) || !DATA.q.length)
    throw new Error("The question data did not load.\nIf you opened this from a "
      + "folder, questions.js must sit in the same folder as index.html.");
  TRACK.setEnabled(S.track);
  renderSkins(); applySkin(S.skin);
  renderDecks(); renderTopics(); renderFilters();
  wireDashboard();
  show("setup");
}catch(err){
  window.boom("The deck could not start.", (err && (err.stack || err.message)) || String(err));
}

/* Service worker needs a real origin; skipped on file:// and inside the
   native shells, which serve their own copy of these files. */
if("serviceWorker" in navigator && location.protocol.startsWith("http") && !window.Capacitor){
  addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(()=>{}));
}
