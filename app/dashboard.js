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

/* ---------------- rhythm: days, weeks, hours ----------------
 *
 * The calendar above answers "did I show up". This answers "when, and is it
 * holding up" — the last fortnight at a glance, twelve weeks of volume, and
 * the hour of day the habit actually lives at. Days and weeks come from the
 * per-day totals, which are never trimmed; the hour histogram can only come
 * from the events, which are, so it is labelled as recent rather than
 * all-time.
 */
function renderRhythm(){
  const day = TRACK.days();
  const today = new Date(); today.setHours(0,0,0,0);

  /* --- last 14 days --- */
  const last14 = [];
  for(let i = 13; i >= 0; i--){
    const dt = new Date(today); dt.setDate(dt.getDate() - i);
    last14.push({dt, n: day[TRACK.dayKey(dt.getTime())] | 0});
  }
  const busiest = Math.max(1, ...last14.map(d => d.n));
  $("#ribbon").innerHTML = last14.map(d => {
    const cls = !d.n ? "" : d.n >= busiest*0.5 ? "on" : "half";
    return `<i class="${cls}" title="${esc(d.dt.toLocaleDateString(undefined,
      {weekday:"short",day:"numeric",month:"short"}))}: ${d.n}"></i>`;
  }).join("");
  const fmtDay = d => d.toLocaleDateString(undefined,{day:"numeric",month:"short"});
  $("#ribbonx").innerHTML = `<span>${esc(fmtDay(last14[0].dt))}</span><span>today</span>`;

  /* --- 12 weeks of volume --- */
  const weeks = [];
  for(let w = 11; w >= 0; w--){
    const end = new Date(today); end.setDate(end.getDate() - w*7);
    const startOfWeek = new Date(end); startOfWeek.setDate(end.getDate() - 6);
    let n = 0;
    for(let k = 0; k < 7; k++){
      const dt = new Date(startOfWeek); dt.setDate(startOfWeek.getDate() + k);
      if(dt > today) break;
      n += day[TRACK.dayKey(dt.getTime())] | 0;
    }
    weeks.push({n, label: startOfWeek});
  }
  const wMax = Math.max(1, ...weeks.map(w => w.n));
  $("#spark").innerHTML = weeks.map(w =>
    `<span class="sb ${w.n ? "" : "zero"}" title="week of ${esc(w.label.toLocaleDateString(undefined,
       {day:"numeric",month:"short"}))}: ${w.n}">
       <i style="height:${w.n ? Math.max(4, Math.round(w.n/wMax*100)) : 3}%"></i></span>`).join("");
  $("#sparkx").innerHTML = weeks.map((w,i) =>
    `<span>${i % 3 === 0 ? esc(w.label.toLocaleDateString(undefined,{month:"short",day:"numeric"})) : ""}</span>`).join("");

  /* --- hour of day --- */
  const hours = new Array(24).fill(0);
  for(const e of TRACK.events()) hours[new Date(e[TRACK.TS]*1000).getHours()]++;
  const hMax = Math.max(1, ...hours);
  const nowH = new Date().getHours();
  $("#clock").innerHTML = hours.map((n,h) =>
    `<span class="cb ${h===nowH ? "now" : ""}" title="${String(h).padStart(2,"0")}:00 — ${n}">
       <i style="height:${n ? Math.max(6, Math.round(n/hMax*100)) : 0}%"></i></span>`).join("");

  const peak = hours.indexOf(hMax);
  const fortnight = last14.reduce((s,d) => s + d.n, 0);
  $("#rhythm-sum").textContent = fortnight
    ? `${nf(fortnight)} in 14 days${hMax > 1 ? " · peak around " + String(peak).padStart(2,"0") + ":00" : ""}`
    : "nothing in the last fortnight";
}

/* ---------------- outcome mix and pace ---------------- */
const MIX_COLORS = ["var(--acc)", "var(--h5)", "var(--h2)", "var(--muted)"];

function renderMix(){
  const ev = TRACK.events();
  const counts = [0,0,0,0];
  let dwellTotal = 0;
  const dwells = [];
  for(const e of ev){
    counts[e[TRACK.HOW]] = (counts[e[TRACK.HOW]] | 0) + 1;
    const d = e[TRACK.DW] | 0;
    if(d > 0 && d < 900){ dwellTotal += d; dwells.push(d); }
  }
  const total = counts.reduce((s,n) => s+n, 0);

  if(!total){
    $("#mix").innerHTML = "";
    $("#mixkey").innerHTML = `<span>Nothing recorded yet.</span>`;
    $("#pace").innerHTML = "";
    $("#mix-sum").textContent = "";
    return;
  }
  $("#mix-sum").textContent = `${nf(total)} recent card${total===1?"":"s"}`;
  $("#mix").innerHTML = counts.map((n,i) => n
    ? `<i style="flex:${n} 1 0;background:${MIX_COLORS[i]}" title="${TRACK.HOW_NAME[i]}: ${n}"></i>` : ""
  ).join("");
  $("#mixkey").innerHTML = counts.map((n,i) =>
    `<span><i style="background:${MIX_COLORS[i]}"></i>${TRACK.HOW_NAME[i]} ${nf(n)} · ${pct(n,total)}%</span>`
  ).join("");

  dwells.sort((a,b) => a-b);
  const median = dwells.length ? dwells[Math.floor(dwells.length/2)] : 0;
  const mins = Math.round(dwellTotal/60);
  const skipRate = pct(counts[3], total);
  $("#pace").innerHTML =
    `<div><span>Median time on a card</span><b>${median ? median + "s" : "—"}</b></div>`
  + `<div><span>Time on the deck, recent cards</span><b>${mins >= 60
       ? Math.floor(mins/60) + "h " + (mins%60) + "m" : mins + " min"}</b></div>`
  + `<div><span>Longest you sat with one</span><b>${dwells.length ? dwells[dwells.length-1] + "s" : "—"}</b></div>`
  + `<div><span>Skip rate</span><b>${skipRate}%</b></div>`
  + `<div><span>Went deeper vs backed off</span><b>${nf(counts[1])} · ${nf(counts[2])}</b></div>`;
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


/* ---------------- people ----------------
 *
 * The one view that only makes sense for how this app is actually used: a
 * different stranger every session, and a record of what you got through with
 * each of them. Sorted by most recent, because the person you spoke to
 * yesterday is the one you are most likely to be picking back up.
 */
function renderPeoplePanel(){
  const pp = TRACK.people();
  const host = $("#dpeople");
  if(!pp.length){
    $("#dpeople-sum").textContent = "";
    host.innerHTML = `<div class="empty">Nobody yet.<br>
      Put a name in the box on the Decks screen before you start, and 4QIAN will
      remember what you asked them.</div>`;
    return;
  }
  const rows = pp.map((nm, i) => ({nm, i, ...TRACK.personStats(i)}))
                 .sort((a, b) => b.last - a.last);
  const met = rows.filter(r => r.asked).length;
  $("#dpeople-sum").textContent = `${nf(pp.length)} · ${nf(met)} talked to`;

  const when = ts => {
    if(!ts) return "not started";
    const days = Math.floor((Date.now()/1000 - ts) / 86400);
    return days <= 0 ? "today" : days === 1 ? "yesterday" : days + " days ago";
  };
  host.innerHTML = rows.map(p => `
    <button class="prow" data-p="${esc(p.nm)}">
      <span class="pn">${esc(p.nm)}</span>
      <span class="pv">${nf(p.covered)} asked</span>
      <span class="pm">${esc(when(p.last))} · ${nf(p.sessions)} session${p.sessions===1?"":"s"}
        · got to ${esc(STAGE_NAME[Math.max(0, p.deepest-1)] || "—")}</span>
    </button>`).join("");
}

/* ---------------- vocabulary ---------------- */

/* The same numbers as the Words view, summarised. Kept here rather than
   imported so the dashboard stays a single pass over the record: metWords()
   caches on the size of the count table, so calling it from both places
   costs one segmentation run, not two. */
function renderVocabPanel(){
  const met = VOCAB.metWords();
  const tot = [0,0,0,0], got = [0,0,0,0];
  for(const [hz,,,lv] of VOCAB.all){ tot[lv-1]++; if(met.has(hz)) got[lv-1]++; }
  $("#dvoc").innerHTML = VOCAB.levels.map((nm, i) =>
    brow(nm, `${nf(got[i])} / ${nf(tot[i])} · ${pct(got[i], tot[i])}%`,
         tot[i] ? got[i]/tot[i] : 0, hc(Math.min(5, i + 2)))).join("");
  const all = got.reduce((a, b) => a + b, 0);
  $("#dvoc-sum").textContent = all
    ? `${nf(all)} of ${nf(VOCAB.size)} met · ${pct(all, VOCAB.size)}%`
    : "nothing met yet";
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
      <span><span class="le">${esc(deckName(s[2]))}</span>
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
  renderRhythm();
  renderMix();
  renderFreq(a);
  renderBands(a);
  renderCols($("#c-stage"), STAGE_NAME, a.stage, i => hc(i+1));
  renderCols($("#c-sens"),  SENS_NAME,  a.sens,  i => hc(i+1));
  renderCats(a);
  renderVocabPanel();
  renderPeoplePanel();
  renderLog();
  renderSessions();
  renderStorage();
}

/* How much room the record is taking. localStorage is the one resource this
   app can actually run out of, and the failure mode — a silent quota error
   that drops half the events — is worth warning about before it happens. */
function renderStorage(){
  let bytes = 0;
  try{
    for(const k of ["4qian.track.v1", "4qian.v1"])
      bytes += ((localStorage.getItem(k) || "").length) * 2;   // UTF-16 code units
  }catch(e){ return; }
  const kb = Math.max(1, Math.round(bytes/1024));
  const ev = TRACK.events().length;
  $("#storage-note").textContent =
    `Your record is about ${nf(kb)} KB — ${nf(ev)} detailed entries, `
  + `${nf(TRACK.uniques())} questions counted, ${nf(TRACK.sessions().length)} sessions. `
  + (ev >= 6000
      ? "The detailed log is full, so the oldest entries are now rolling off; totals, "
      + "counts and the calendar are unaffected. Export a backup to keep them."
      : "Well inside what the device allows.");
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
  $("#v-dash").addEventListener("click", e => {
    const go = e.target.closest("button[data-go]");
    if(go) return show(go.dataset.go);
    const p = e.target.closest(".prow");
    if(p){
      $("#partner").value = p.dataset.p;
      setPartner(p.dataset.p);
      renderPeople(); renderPartner(); renderPeoplePanel();
      toast("Now talking to " + p.dataset.p);
    }
  });

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
    saveFile(`4qian-${stamp()}.json`, "application/json", TRACK.toJSON(S)));
  $("#b-exp-csv").addEventListener("click", () => {
    if(!TRACK.events().length) return toast("Nothing to export yet");
    saveFile(`4qian-record-${stamp()}.csv`, "text/csv", TRACK.toCSV(csvLookup));
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
