/* dashboard.js — everything under the Dashboard tab.
 *
 * All of it is derived on render from TRACK; nothing here keeps its own copy
 * of the record. Charts are inline SVG or flex bars rather than a charting
 * library, so the app stays a folder of files that runs offline from a phone,
 * an .exe or a file:// URL with no build step in between.
 */

/* ---------------- aggregation ---------------- */

/* One pass over the durable per-question counts, reused by every panel below.
   Counts rather than events, because events get trimmed and these totals
   are meant to be all-time. */
function aggregate(){
  const cnt = TRACK.counts();
  const a = {
    askedRanks: new Set(),
    totalAsks: 0, repeats: 0,
    stage: [0,0,0,0,0], sens: [0,0,0,0,0],
    cat: DATA.categories.map(() => 0),        // distinct questions asked
    catHits: DATA.categories.map(() => 0),    // total asks
    band: BANDS.map(() => 0),
    scoreSum: 0
  };
  for(const k in cnt){
    const r = +k, n = cnt[k] | 0;
    const q = byRank.get(r); if(!q || !n) continue;
    a.askedRanks.add(r);
    a.totalAsks += n;
    if(n > 1) a.repeats += n - 1;
    a.stage[q[ST]-1] += n;
    a.sens[q[SE]-1]  += n;
    a.cat[q[CA]]     += 1;
    a.catHits[q[CA]] += n;
    const b = bandOf(q[SC]); if(b >= 0) a.band[b] += 1;
    a.scoreSum += q[SC] * n;
  }
  return a;
}

/* Corpus totals never change, so they are computed once and kept. */
const CORPUS = (() => {
  const c = {band: BANDS.map(()=>0), cat: DATA.categories.map(()=>0), n: DATA.q.length};
  for(const q of DATA.q){
    const b = bandOf(q[SC]); if(b >= 0) c.band[b]++;
    c.cat[q[CA]]++;
  }
  return c;
})();

const pct = (n, d) => d ? Math.round(n / d * 100) : 0;
const nf  = n => (n|0).toLocaleString();

/* ---------------- KPI tiles ---------------- */
function renderKPIs(a){
  const st = TRACK.streak();
  const uniq = a.askedRanks.size;
  const avgDepth = a.totalAsks
    ? (a.stage.reduce((s,n,i) => s + n*(i+1), 0) / a.totalAsks).toFixed(1) : "—";
  const avgScore = a.totalAsks ? Math.round(a.scoreSum / a.totalAsks) : "—";

  const tiles = [
    {k:"Questions asked", v:nf(a.totalAsks), sub: a.repeats ? nf(a.repeats)+" were repeats" : "no repeats yet"},
    {k:"Corpus covered",  v:pct(uniq, CORPUS.n), unit:"%", sub:`${nf(uniq)} of ${nf(CORPUS.n)}`},
    {k:"Sessions",        v:nf(TRACK.sessions().length), sub:`${st.activeDays} active day${st.activeDays===1?"":"s"}`},
    {k:"Day streak",      v:nf(st.cur), sub:`best ${st.best}`},
    {k:"Average depth",   v:avgDepth, unit:"/5", sub: a.totalAsks ? STAGE_NAME[Math.round(a.stage.reduce((s,n,i)=>s+n*(i+1),0)/a.totalAsks)-1] || "" : ""},
    {k:"Average freq",    v:avgScore, unit:"/100", sub:"how common your questions are"}
  ];
  $("#kpis").innerHTML = tiles.map(t => `
    <div class="kpi">
      <div class="v">${t.v}${t.unit ? `<small>${t.unit}</small>` : ""}</div>
      <div class="k">${esc(t.k)}</div>
      <div class="sub">${esc(t.sub || "")}</div>
    </div>`).join("");

  const f = TRACK.first();
  $("#dash-since").textContent = f
    ? "since " + new Date(f*1000).toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"})
    : "no sessions yet";
}

/* ---------------- activity calendar ---------------- */
const WEEKS = 26, CELL = 11, GAP = 3, TOP = 16;

function renderHeat(){
  const day = TRACK.days();
  const today = new Date(); today.setHours(0,0,0,0);
  // Start on the Sunday that begins the window, so columns are whole weeks.
  const start = new Date(today);
  start.setDate(start.getDate() - (WEEKS*7 - 1) - today.getDay());

  let max = 1, sum = 0, active = 0;
  const cells = [];
  for(let w = 0; w < WEEKS + 1; w++){
    for(let d = 0; d < 7; d++){
      const dt = new Date(start); dt.setDate(start.getDate() + w*7 + d);
      if(dt > today) continue;
      const n = day[TRACK.dayKey(dt.getTime())] | 0;
      if(n > max) max = n;
      sum += n; if(n) active++;
      cells.push({w, d, n, dt});
    }
  }
  /* One hue at rising opacity rather than four named tokens. The palettes
     vary their hues, so a token ramp that climbs in Hazard can read as
     non-monotonic in Sounding — indigo darker than the teal above it. Opacity
     on a single accent is monotonic in every theme, and unlike color-mix it
     works on any WebView this could land on. */
  const level = n => !n ? 0 : n <= max*0.25 ? 0.35 : n <= max*0.6 ? 0.65 : 1;

  const W = (WEEKS+1)*(CELL+GAP), H = TOP + 7*(CELL+GAP);
  let months = "";
  let lastMonth = -1;
  for(let w = 0; w < WEEKS+1; w++){
    const dt = new Date(start); dt.setDate(start.getDate() + w*7);
    if(dt.getMonth() !== lastMonth && dt <= today){
      lastMonth = dt.getMonth();
      months += `<text x="${w*(CELL+GAP)}" y="10" fill="var(--muted)" font-size="9"
        font-family="Archivo,system-ui,sans-serif">${dt.toLocaleDateString(undefined,{month:"short"})}</text>`;
    }
  }
  const rects = cells.map(c => {
    const x = c.w*(CELL+GAP), y = TOP + c.d*(CELL+GAP), o = level(c.n);
    const label = `${c.dt.toLocaleDateString(undefined,{weekday:"short",day:"numeric",month:"short"})}: ${c.n} question${c.n===1?"":"s"}`;
    // Base tile always painted, so a translucent accent never blends with
    // whatever the panel behind it happens to be.
    return `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="var(--surface-3)"/>`
      + (o ? `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2"
           fill="var(--acc)" fill-opacity="${o}"/>` : ``)
      + `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="transparent"
           ><title>${esc(label)}</title></rect>`;
  }).join("");

  const host = $("#heat");
  host.innerHTML =
    `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img"
       aria-label="Questions asked per day over the last ${WEEKS} weeks">${months}${rects}</svg>`;
  // 26 weeks is wider than a phone: open on this week, not six months ago.
  host.scrollLeft = host.scrollWidth;
  $("#heat-sum").textContent = sum
    ? `${nf(sum)} in ${active} day${active===1?"":"s"} · busiest ${max}`
    : "nothing yet";
}

/* ---------------- high-frequency panel ---------------- */
let freqMode = "corpus", freqFilter = "all", freqShown = 25;

function renderFreq(a){
  const body = $("#freq-body");

  if(freqMode === "mine"){
    const cnt = TRACK.counts();
    const rows = Object.keys(cnt)
      .map(k => ({q: byRank.get(+k), n: cnt[k]|0}))
      .filter(x => x.q)
      .sort((x,y) => y.n - x.n || y.q[SC] - x.q[SC]);

    if(!rows.length){
      body.innerHTML = `<div class="empty">You have not asked anything yet.<br>
        Start a deck and this fills up on its own.</div>`;
      return;
    }
    const top = rows.slice(0, freqShown);
    const maxN = rows[0].n;
    const catRank = DATA.categories.map((c,i) => ({c, i, n: a.catHits[i]}))
      .filter(x => x.n).sort((x,y) => y.n - x.n).slice(0, 6);

    body.innerHTML = `
      <p class="pmeta">${nf(rows.length)} distinct questions asked · ${nf(a.repeats)} repeat
        ask${a.repeats===1?"":"s"} (${pct(a.repeats, a.totalAsks)}% of the total).</p>
      <div class="freqlist">
        ${top.map((x,i) => frow(x.q, i+1, x.n + "×", x.n / maxN)).join("")}
      </div>
      ${rows.length > freqShown ? `<button class="more" id="freq-more" style="margin-top:8px">Show more</button>` : ""}
      <div class="lbl" style="margin:16px 0 4px">Your busiest topics</div>
      <div class="blist">
        ${catRank.map(x => brow(x.c, `${nf(x.n)} asks`, x.n / catRank[0].n)).join("")}
      </div>`;
    return;
  }

  /* Corpus mode: the built-in 0–100 score, which is the whole reason the
     deck can claim to teach high-frequency language rather than trivia. */
  const list = DATA.q
    .filter(q => freqFilter === "all" ? true
               : freqFilter === "todo" ? !a.askedRanks.has(q[R])
               : a.askedRanks.has(q[R]))
    .sort((x,y) => y[SC] - x[SC] || x[R] - y[R]);

  const top = list.slice(0, freqShown);
  const core = CORPUS.band[0], coreDone = a.band[0];

  body.innerHTML = `
    <p class="pmeta">Every question carries a frequency score from 0 to 100 — how often a
      question like it actually comes up. You have covered <b>${coreDone} of ${core}</b>
      in the 90–100 core band (${pct(coreDone, core)}%).</p>
    <div class="filters" style="margin-bottom:10px">
      <button class="fchip" data-ff="all"    aria-pressed="${freqFilter==="all"}">All</button>
      <button class="fchip" data-ff="todo"   aria-pressed="${freqFilter==="todo"}">Not asked yet</button>
      <button class="fchip" data-ff="done"   aria-pressed="${freqFilter==="done"}">Already asked</button>
    </div>
    ${top.length ? `<div class="freqlist">
      ${top.map((q,i) => frow(q, i+1, q[SC], q[SC]/100, a.askedRanks.has(q[R]))).join("")}
    </div>` : `<div class="empty">Nothing in that filter.</div>`}
    ${list.length > freqShown ? `<button class="more" id="freq-more" style="margin-top:8px">Show more · ${nf(list.length - freqShown)} left</button>` : ""}`;
}

function frow(q, i, val, ratio, done){
  return `<button class="frow ${done ? "done" : ""}" data-r="${q[R]}">
    <span class="rank">${i}</span>
    <span class="fe">${esc(q[EN])}</span>
    <span class="fz">${esc(q[ZH])}</span>
    <span class="fs">
      <span class="score">${val}</span>
      <span class="fbar"><i style="width:${Math.round(Math.max(0,Math.min(1,ratio))*100)}%"></i></span>
      ${done === undefined ? "" : `<span class="tick ${done?"":"no"}">${done?"asked":"new"}</span>`}
    </span></button>`;
}
function brow(name, val, ratio, color){
  return `<div class="brow"${color ? ` style="--bc:${color}"` : ""}>
    <span class="bn">${esc(name)}</span><span class="bv">${esc(val)}</span>
    <span class="btrack"><span class="bfill" style="width:${Math.round(Math.max(0,Math.min(1,ratio))*100)}%"></span></span>
  </div>`;
}

/* ---------------- band coverage ---------------- */
function renderBands(a){
  $("#bands").innerHTML = BANDS.map((b,i) => {
    const tot = CORPUS.band[i], got = a.band[i];
    return `<div class="brow" style="--bc:${hc(Math.max(1, 5 - i))}">
      <span class="bn">${esc(b.nm)} <span style="color:var(--muted)">· ${esc(b.why)}</span></span>
      <span class="bv">${nf(got)} / ${nf(tot)} · ${pct(got,tot)}%</span>
      <span class="btrack"><span class="bfill" style="width:${pct(got,tot)}%"></span></span>
    </div>`;
  }).join("");
  const done = a.band.reduce((s,n)=>s+n,0);
  $("#band-sum").textContent = `${pct(done, CORPUS.n)}% of 4,228`;
}

/* ---------------- column charts ---------------- */
function renderCols(el, labels, values, colorFn){
  const max = Math.max(1, ...values);
  el.innerHTML = values.map((v,i) => `
    <div class="col" style="--cc:${colorFn(i)}">
      <span class="cv">${v ? nf(v) : ""}</span>
      <span class="stack"><span class="fill" style="height:${Math.round(v/max*100)}%"></span></span>
      <span class="cl" title="${esc(labels[i])}">${esc(labels[i])}</span>
    </div>`).join("");
}

/* ---------------- topic coverage ---------------- */
let catsAll = false;
function renderCats(a){
  const rows = DATA.categories.map((c,i) => ({
    c, i, got: a.cat[i], tot: CORPUS.cat[i], hits: a.catHits[i]
  })).sort((x,y) => (y.got/y.tot) - (x.got/x.tot) || y.hits - x.hits);

  const list = catsAll ? rows : rows.slice(0, 8);
  $("#cats").innerHTML = list.map(r =>
    brow(r.c, `${nf(r.got)} / ${nf(r.tot)} · ${pct(r.got,r.tot)}%`, r.got/r.tot)).join("");
  $("#cats-more").textContent = catsAll ? "Show fewer" : `Show all ${rows.length} topics`;
  const touched = rows.filter(r => r.got).length;
  $("#topic-sum").textContent = `${touched} of ${rows.length} touched`;
}

/* ---------------- the record ---------------- */
let logShown = 40, logFilter = new Set(), logTerm = "";

function renderLog(){
  const ev = TRACK.events();
  const term = logTerm.trim().toLowerCase();
  const rows = [];
  for(let i = ev.length - 1; i >= 0; i--){
    const e = ev[i];
    if(logFilter.size && !logFilter.has(e[TRACK.HOW])) continue;
    const q = byRank.get(e[TRACK.R]); if(!q) continue;
    if(term && !(q[EN].toLowerCase().includes(term) || q[ZH].includes(term)
                 || q[PY].toLowerCase().includes(term))) continue;
    rows.push([e, q]);
  }
  $("#log-sum").textContent = rows.length
    ? `${nf(rows.length)} entr${rows.length===1?"y":"ies"}`
    : "empty";

  if(!rows.length){
    $("#log").innerHTML = `<div class="empty">${TRACK.events().length
      ? "Nothing in the record matches that."
      : "Nothing recorded yet.<br>Start a deck and every question you go through lands here."}</div>`;
    $("#log-more").classList.add("hidden");
    return;
  }
  $("#log").innerHTML = rows.slice(0, logShown).map(([e,q]) => {
    const d = new Date(e[TRACK.TS]*1000);
    const how = e[TRACK.HOW];
    return `<button class="lrow" data-r="${q[R]}" style="--dc:${hc(q[ST])}">
      <span class="spine"></span>
      <span><span class="le">${esc(q[EN])}</span>
        <span class="lm"><span class="act a${how===1?1:how===2?2:0}">${TRACK.HOW_NAME[how]}</span>
          · Q${String(q[R]).padStart(4,"0")} · freq ${q[SC]} · depth ${e[TRACK.DEP]}</span></span>
      <span class="lt">${d.toLocaleDateString(undefined,{day:"numeric",month:"short"})}<br>
        ${d.toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"})}</span>
    </button>`;
  }).join("");
  $("#log-more").classList.toggle("hidden", rows.length <= logShown);
  if(rows.length > logShown)
    $("#log-more").textContent = `Show 40 more · ${nf(rows.length - logShown)} left`;
}

function renderSessions(){
  const ss = TRACK.sessions().slice().reverse();
  $("#sess-sum").textContent = ss.length ? `${nf(ss.length)} recorded` : "none yet";
  if(!ss.length){
    $("#sessions").innerHTML = `<div class="empty">No sessions yet.</div>`;
    return;
  }
  $("#sessions").innerHTML = ss.slice(0, 20).map(s => {
    const d = new Date(s[0]*1000);
    const mins = Math.max(1, Math.round((s[1]-s[0])/60));
    return `<div class="lrow" style="--dc:${hc(Math.max(1,Math.min(5,s[4])))};cursor:default">
      <span class="spine"></span>
      <span><span class="le">${esc((DATA.decks[s[2]]||{}).name || "Deck")}</span>
        <span class="lm">${s[3]} question${s[3]===1?"":"s"} · deepest ${esc(STAGE_NAME[Math.max(0,s[4]-1)]||"—")} · ${s[5]} topic${s[5]===1?"":"s"} · ${mins} min</span></span>
      <span class="lt">${d.toLocaleDateString(undefined,{day:"numeric",month:"short"})}<br>
        ${d.toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"})}</span>
    </div>`;
  }).join("");
}

/* ---------------- orchestration ---------------- */
function renderDash(){
  const a = aggregate();
  renderKPIs(a);
  renderHeat();
  renderFreq(a);
  renderBands(a);
  renderCols($("#c-stage"), STAGE_NAME, a.stage, i => hc(i+1));
  renderCols($("#c-sens"),  SENS_NAME,  a.sens,  i => hc(i+1));
  renderCats(a);
  renderLog();
  renderSessions();
}

/* ---------------- file out / in ---------------- */

/* Three hosts, three ways to put a file on disk. The browser path is last
   because it is the only one that cannot report where the file went. */
async function saveFile(name, mime, text){
  try{
    if(window.cdgDesktop && window.cdgDesktop.saveFile){       // Electron
      const where = await window.cdgDesktop.saveFile(name, text);
      toast(where ? "Saved to " + where : "Save cancelled");
      return;
    }
    const cap = window.Capacitor && window.Capacitor.Plugins;
    if(cap && cap.Filesystem){                                  // Android
      await cap.Filesystem.writeFile({
        path: name, data: text, directory: "DOCUMENTS", encoding: "utf8"
      });
      toast("Saved to Documents/" + name);
      return;
    }
  }catch(err){
    toast("Could not save: " + (err && err.message || err));
    return;
  }
  const blob = new Blob([text], {type: mime});                  // browser
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast("Exported " + name);
}

const stamp = () => new Date().toISOString().slice(0,10);

/* CSV wants the category name and the raw row together; TRACK does not know
   about DATA, so it asks for a lookup. */
function csvLookup(rank){
  const q = byRank.get(rank);
  if(!q) return null;
  const row = q.slice();
  row.cat = DATA.categories[q[CA]];
  return row;
}

/* ---------------- wiring ---------------- */
function wireDashboard(){
  $("#freq-mode").addEventListener("click", e => {
    const b = e.target.closest("button[data-f]"); if(!b) return;
    freqMode = b.dataset.f; freqShown = 25;
    [...$("#freq-mode").children].forEach(x => x.setAttribute("aria-pressed", x === b));
    renderFreq(aggregate());
  });
  $("#freq-body").addEventListener("click", e => {
    const ff = e.target.closest("button[data-ff]");
    if(ff){ freqFilter = ff.dataset.ff; freqShown = 25; renderFreq(aggregate()); return; }
    if(e.target.closest("#freq-more")){ freqShown += 25; renderFreq(aggregate()); return; }
    const row = e.target.closest(".frow");
    if(row) openQuestion(+row.dataset.r);
  });
  $("#cats-more").addEventListener("click", () => { catsAll = !catsAll; renderCats(aggregate()); });

  let lt;
  $("#log-q").addEventListener("input", e => {
    clearTimeout(lt);
    lt = setTimeout(() => { logTerm = e.target.value; logShown = 40; renderLog(); }, 140);
  });
  $("#log-f").addEventListener("click", e => {
    const b = e.target.closest("button[data-a]"); if(!b) return;
    const n = +b.dataset.a;
    logFilter.has(n) ? logFilter.delete(n) : logFilter.add(n);
    b.setAttribute("aria-pressed", logFilter.has(n));
    logShown = 40; renderLog();
  });
  $("#log-more").addEventListener("click", () => { logShown += 40; renderLog(); });
  $("#log").addEventListener("click", e => {
    const b = e.target.closest(".lrow"); if(b && b.dataset.r) openQuestion(+b.dataset.r);
  });

  $("#b-exp-json").addEventListener("click", () =>
    saveFile(`depth-gauge-${stamp()}.json`, "application/json", TRACK.toJSON(S)));
  $("#b-exp-csv").addEventListener("click", () => {
    if(!TRACK.events().length) return toast("Nothing to export yet");
    saveFile(`depth-gauge-record-${stamp()}.csv`, "text/csv", TRACK.toCSV(csvLookup));
  });
  $("#b-imp").addEventListener("click", () => $("#imp-file").click());
  $("#imp-file").addEventListener("change", async e => {
    const f = e.target.files && e.target.files[0]; if(!f) return;
    try{
      const got = TRACK.importJSON(await f.text());
      toast(`Merged · ${nf(got.events)} entries, ${nf(got.sessions)} sessions`);
      renderDash();
    }catch(err){ toast(err.message || "That file could not be read"); }
    e.target.value = "";
  });
  $("#b-wipe").addEventListener("click", () => {
    const c = $("#confirm");
    $("#cf-h").textContent = "Erase your record?";
    $("#cf-p").textContent = `This deletes ${nf(TRACK.total())} recorded questions, `
      + `${nf(TRACK.sessions().length)} sessions and every streak. Your saved questions and `
      + `settings are kept. It cannot be undone — export a backup first if you want one.`;
    c.returnValue = "";
    c.onclose = () => {
      if(c.returnValue !== "yes") return;
      TRACK.wipe(); renderDash(); toast("Record erased");
    };
    c.showModal();
  });
}
