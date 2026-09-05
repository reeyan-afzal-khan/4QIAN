/* insights.js — the interactive half of the record.
 *
 * The Dashboard answers "how am I doing" in panels you read top to bottom.
 * This answers "what does my record actually look like" in charts you can
 * interrogate: one filter row scopes every chart on the page, every mark has
 * a tooltip, and a table view carries the same figures as text.
 *
 * WHY EVERYTHING HERE COMES FROM THE EVENT LOG
 * Every figure on this page is derived from TRACK.events(), never from the
 * per-question counts. The counts are all-time and cannot be sliced by person,
 * deck or date; the log can. Deriving all of it from one source is what lets
 * the filter row promise that no two panels disagree — and the log is a
 * 6,000-entry ring buffer, so the scope line says so once it is full rather
 * than quietly reporting a subset as a total.
 *
 * COLOUR
 * Two jobs, two treatments. Outcome and person are identity, so they take the
 * fixed categorical slots --s1..--s4 in a stable order — the same outcome is
 * the same hue in the donut and in the stacked bars, and a filter that removes
 * a series never repaints the survivors. Topic volume, hour-of-day and depth
 * are magnitude, so each takes a single hue (--acc) stepped light to dark.
 * No rainbow, and no hue standing in for a number.
 *
 * Not the app's --h1..--h5 heat ramp, tempting though it is for depth: that
 * ramp encodes sensitivity as an identity, is not monotonic in lightness, and
 * opens on a desaturated grey-brown that a 20px bar cannot carry.
 */

/* ---------------- filter state ---------------- */

const INS = {range: 0, person: "", deck: "", table: false};

const OUTCOME = ["Asked", "Warmer", "Cooler", "Skipped"];
const OUT_VAR = ["--s1", "--s2", "--s3", "--s4"];
const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const cssv = name => getComputedStyle(document.documentElement)
  .getPropertyValue(name).trim() || "#888";

/* ---------------- tiny SVG builder ----------------
   Attributes go on as attributes and text goes on as text, so a category or a
   person's name can never be read as markup. */
const NS = "http://www.w3.org/2000/svg";
function el(tag, attrs, text){
  const n = document.createElementNS(NS, tag);
  for(const k in (attrs || {})) if(attrs[k] != null) n.setAttribute(k, attrs[k]);
  if(text != null) n.textContent = text;
  return n;
}
function svg(w, h){
  const s = el("svg", {viewBox: `0 0 ${w} ${h}`, role: "img",
                       preserveAspectRatio: "xMidYMid meet"});
  return s;
}

/* ---------------- the slice ---------------- */

/* One pass over the log, honouring the filter row. Everything on the page is
   built from what this returns. */
function insSlice(){
  const ev = TRACK.events();
  const cut = INS.range
    ? Math.floor(Date.now() / 1000) - INS.range * 86400
    : 0;
  const pid = INS.person === "" ? null : +INS.person;
  const deck = INS.deck === "" ? null : +INS.deck;

  const rows = [];
  for(const e of ev){
    if(cut && e[1] < cut) continue;
    if(pid !== null && (e.length > 6 ? e[6] : -1) !== pid) continue;
    if(deck !== null && e[4] !== deck) continue;
    rows.push(e);
  }
  return rows;
}

function insAgg(rows){
  const a = {
    n: rows.length,
    ranks: new Set(),
    outcome: [0, 0, 0, 0],
    depth: [0, 0, 0, 0, 0],
    byDay: new Map(),                 // dayKey -> count
    byTopic: new Map(),               // topic name -> count
    byPerson: new Map(),              // pid -> [asked, warmer, cooler, skipped]
    when: Array.from({length: 7}, () => new Array(24).fill(0)),
    dwell: [], score: 0, scored: 0
  };
  for(const e of rows){
    a.ranks.add(e[0]);
    if(e[2] >= 0 && e[2] < 4) a.outcome[e[2]]++;
    if(e[3] >= 1 && e[3] <= 5) a.depth[e[3] - 1]++;
    if(e[5] > 0 && e[5] < 900) a.dwell.push(e[5]);

    const d = new Date(e[1] * 1000);
    const key = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    a.byDay.set(key, (a.byDay.get(key) || 0) + 1);
    a.when[d.getDay()][d.getHours()]++;

    const q = byRank.get(e[0]);
    if(q){
      const t = DATA.categories[q[CA]];
      a.byTopic.set(t, (a.byTopic.get(t) || 0) + 1);
      a.score += q[SC]; a.scored++;
    }
    const p = e.length > 6 ? e[6] : -1;
    if(p >= 0){
      const row = a.byPerson.get(p) || [0, 0, 0, 0];
      if(e[2] >= 0 && e[2] < 4) row[e[2]]++;
      a.byPerson.set(p, row);
    }
  }
  a.dwell.sort((x, y) => x - y);
  return a;
}

/* ---------------- tooltip ---------------- */

let tipEl = null;
function tipFor(host){
  if(!tipEl){ tipEl = document.createElement("div"); tipEl.className = "tip"; }
  if(tipEl.parentNode !== host) host.appendChild(tipEl);
  return tipEl;
}
function showTip(host, x, y, key, value, rows){
  const t = tipFor(host);
  t.textContent = "";
  const k = document.createElement("div"); k.className = "tk"; k.textContent = key;
  const v = document.createElement("div"); v.className = "tv"; v.textContent = value;
  t.append(k, v);
  for(const r of (rows || [])){
    const line = document.createElement("div"); line.className = "trow";
    const i = document.createElement("i"); i.style.background = r.color;
    const nm = document.createElement("span"); nm.textContent = r.label;
    const b = document.createElement("b"); b.textContent = r.value;
    line.append(i, nm, b); t.appendChild(line);
  }
  const w = host.clientWidth;
  t.style.left = Math.max(58, Math.min(w - 58, x)) + "px";
  t.style.top = Math.max(46, y - 10) + "px";
  t.classList.add("on");
}
const hideTip = () => { if(tipEl) tipEl.classList.remove("on"); };

/* Attach hover + keyboard focus to a hit area. Same readout for both, because
   a tooltip that only answers to a mouse is not a tooltip on a phone. */
function wireHit(node, host, fn){
  const go = ev => fn(ev);
  node.addEventListener("pointerenter", go);
  node.addEventListener("pointermove", go);
  node.addEventListener("focus", go);
  node.addEventListener("pointerleave", hideTip);
  node.addEventListener("blur", hideTip);
}

/* ---------------- legend ---------------- */

function legendInto(host, items){
  const w = document.createElement("div");
  w.className = "legend";
  for(const it of items){
    const s = document.createElement("span");
    const i = document.createElement("i"); i.style.background = it.color;
    const nm = document.createElement("span"); nm.textContent = it.label;
    s.append(i, nm);
    if(it.value != null){ const b = document.createElement("b"); b.textContent = it.value; s.appendChild(b); }
    w.appendChild(s);
  }
  host.appendChild(w);
}

const emptyInto = (host, msg) => {
  const p = document.createElement("div");
  p.className = "vempty"; p.textContent = msg;
  host.appendChild(p);
};

/* ---------------- questions per day ----------------
   One series, so no legend: the panel title names it. A crosshair snaps to the
   nearest day so the reader aims at a date rather than at a 2px line. */
function insTrend(a){
  const host = $("#ins-trend");
  host.textContent = "";
  const keys = [...a.byDay.keys()].sort((x, y) => x - y);
  if(keys.length < 2){
    emptyInto(host, keys.length ? "One day so far — come back tomorrow." : "Nothing in this slice.");
    $("#ins-trend-sum").textContent = "";
    return;
  }

  const dateOf = k => new Date(Math.floor(k / 10000), Math.floor(k / 100) % 100 - 1, k % 100);
  const from = dateOf(keys[0]), to = dateOf(keys[keys.length - 1]);
  const span = Math.round((to - from) / 86400000) + 1;

  /* Every day in the range, not only the ones with events: a gap in practice
     is information, and joining across it would draw a line that never
     happened. */
  const pts = [];
  for(let i = 0; i < span; i++){
    const d = new Date(from); d.setDate(d.getDate() + i);
    const key = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    pts.push({d, n: a.byDay.get(key) || 0});
  }

  const W = 720, H = 220, L = 34, R = 10, T = 12, B = 26;
  const iw = W - L - R, ih = H - T - B;
  const max = Math.max(1, ...pts.map(p => p.n));

  /* Ticks land on 1, 2, 5 or 10 x a power of ten rather than on max/4, so the
     axis reads 0 5 10 15 20 rather than 0 7 14 20 27. The plot is scaled to
     the same top the ticks use, or the line would drift off its own gridlines. */
  const step = (() => {
    const rough = max / 4, pow = Math.pow(10, Math.floor(Math.log10(rough) || 0));
    for(const m of [1, 2, 5, 10]) if(rough <= m * pow) return m * pow;
    return 10 * pow;
  })();
  const top = Math.max(step, Math.ceil(max / step) * step);

  const x = i => L + (pts.length === 1 ? iw / 2 : (i / (pts.length - 1)) * iw);
  const y = n => T + ih - (n / top) * ih;

  const s = svg(W, H);
  s.setAttribute("aria-label", `Questions per day, ${pts.length} days, peak ${max}`);

  for(let v = 0; v <= top; v += step){
    const gy = T + ih - (v / top) * ih;
    s.appendChild(el("line", {class: "vgrid", x1: L, x2: W - R, y1: gy, y2: gy}));
    s.appendChild(el("text", {class: "vaxis", x: L - 7, y: gy + 3.5, "text-anchor": "end"},
                     String(v)));
  }

  const area = pts.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.n)}`).join("") +
               `L${x(pts.length - 1)},${T + ih}L${x(0)},${T + ih}Z`;
  const grad = el("linearGradient", {id: "insgrad", x1: 0, y1: 0, x2: 0, y2: 1});
  grad.appendChild(el("stop", {offset: "0%", "stop-color": cssv("--acc"), "stop-opacity": ".34"}));
  grad.appendChild(el("stop", {offset: "100%", "stop-color": cssv("--acc"), "stop-opacity": "0"}));
  const defs = el("defs"); defs.appendChild(grad); s.appendChild(defs);
  s.appendChild(el("path", {d: area, fill: "url(#insgrad)"}));
  s.appendChild(el("path", {
    d: pts.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.n)}`).join(""),
    fill: "none", stroke: cssv("--acc"), "stroke-width": 2,
    "stroke-linejoin": "round", "stroke-linecap": "round"}));

  const fmt = d => d.toLocaleDateString(undefined, {day: "numeric", month: "short"});
  [0, pts.length - 1].forEach((i, k) => s.appendChild(el("text",
    {class: "vaxis", x: x(i), y: H - 8, "text-anchor": k ? "end" : "start"}, fmt(pts[i].d))));

  const hair = el("line", {class: "vcross", y1: T, y2: T + ih, opacity: 0});
  const dot = el("circle", {class: "vdot", r: 4.5, fill: cssv("--acc"), opacity: 0});
  s.append(hair, dot);

  const hit = el("rect", {class: "vhit", x: L, y: T, width: iw, height: ih, tabindex: 0});
  s.appendChild(hit);
  const at = i => {
    const p = pts[i];
    hair.setAttribute("x1", x(i)); hair.setAttribute("x2", x(i)); hair.setAttribute("opacity", 1);
    dot.setAttribute("cx", x(i)); dot.setAttribute("cy", y(p.n)); dot.setAttribute("opacity", 1);
    const box = host.getBoundingClientRect();
    showTip(host, (x(i) / W) * box.width, (y(p.n) / H) * box.height,
            p.d.toLocaleDateString(undefined, {weekday: "short", day: "numeric", month: "short"}),
            p.n + (p.n === 1 ? " question" : " questions"));
  };
  let cur = pts.length - 1;
  wireHit(hit, host, ev => {
    const box = s.getBoundingClientRect();
    if(ev.clientX != null && box.width){
      const rel = ((ev.clientX - box.left) / box.width) * W;
      cur = Math.max(0, Math.min(pts.length - 1,
        Math.round(((rel - L) / iw) * (pts.length - 1))));
    }
    at(cur);
  });
  hit.addEventListener("pointerleave", () => { hair.setAttribute("opacity", 0); dot.setAttribute("opacity", 0); });
  hit.addEventListener("blur", () => { hair.setAttribute("opacity", 0); dot.setAttribute("opacity", 0); });
  hit.addEventListener("keydown", e => {
    if(e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    cur = Math.max(0, Math.min(pts.length - 1, cur + (e.key === "ArrowRight" ? 1 : -1)));
    at(cur);
  });

  host.appendChild(s);
  const active = pts.filter(p => p.n).length;
  $("#ins-trend-sum").textContent =
    `${nf(active)} active of ${nf(pts.length)} days · peak ${nf(max)}`;
}

/* ---------------- outcome donut ----------------
   Identity, so the fixed categorical slots. Legend always present, and each
   slice over 6% is directly labelled with its share — which is also the relief
   the light-mode contrast warning asks for. */
function insOutcome(a){
  const host = $("#ins-outcome");
  host.textContent = "";
  const total = a.outcome.reduce((s, n) => s + n, 0);
  if(!total){ emptyInto(host, "Nothing in this slice."); return; }

  const W = 320, H = 200, cx = 108, cy = H / 2, rO = 76, rI = 46;
  const s = svg(W, H);
  s.setAttribute("aria-label", "What you did with each card");

  let ang = -Math.PI / 2;
  const arc = (from, to) => {
    const x1 = cx + rO * Math.cos(from), y1 = cy + rO * Math.sin(from);
    const x2 = cx + rO * Math.cos(to),   y2 = cy + rO * Math.sin(to);
    const x3 = cx + rI * Math.cos(to),   y3 = cy + rI * Math.sin(to);
    const x4 = cx + rI * Math.cos(from), y4 = cy + rI * Math.sin(from);
    const big = to - from > Math.PI ? 1 : 0;
    return `M${x1},${y1}A${rO},${rO} 0 ${big} 1 ${x2},${y2}L${x3},${y3}` +
           `A${rI},${rI} 0 ${big} 0 ${x4},${y4}Z`;
  };

  const items = [];
  a.outcome.forEach((n, i) => {
    if(!n) { items.push({label: OUTCOME[i], color: cssv(OUT_VAR[i]), value: "0"}); return; }
    const to = ang + (n / total) * Math.PI * 2;
    const colour = cssv(OUT_VAR[i]);
    const g = el("g", {class: "vrow"});
    const p = el("path", {d: arc(ang, to), fill: colour, class: "vmark", tabindex: 0,
                          role: "img"});
    p.appendChild(el("title", null, `${OUTCOME[i]}: ${n} (${Math.round(n / total * 100)}%)`));
    g.appendChild(p);
    s.appendChild(g);

    const share = n / total;
    if(share > 0.06){
      const mid = (ang + to) / 2, rl = (rO + rI) / 2;
      s.appendChild(el("text", {class: "vlabel", x: cx + rl * Math.cos(mid),
        y: cy + rl * Math.sin(mid) + 3.5, "text-anchor": "middle",
        fill: "#fff", style: "paint-order:stroke;stroke:rgba(0,0,0,.45);stroke-width:3px"},
        Math.round(share * 100) + "%"));
    }
    wireHit(p, host, () => {
      const box = host.getBoundingClientRect();
      showTip(host, (cx / W) * box.width, (cy - rO) / H * box.height,
              OUTCOME[i], nf(n), [{color: colour, label: "of " + nf(total),
              value: Math.round(share * 100) + "%"}]);
    });
    items.push({label: OUTCOME[i], color: colour, value: nf(n)});
    ang = to;
  });

  s.appendChild(el("text", {class: "vlabel", x: cx, y: cy - 4, "text-anchor": "middle",
                            style: "font-size:23px;font-family:Fraunces,Georgia,serif"}, nf(total)));
  s.appendChild(el("text", {class: "vaxis", x: cx, y: cy + 14, "text-anchor": "middle"}, "cards"));
  host.appendChild(s);
  legendInto(host, items);
}

/* ---------------- depth ----------------
   Magnitude on an ordered scale, so one hue stepped light to dark. It is NOT
   the app's --h1..--h5 heat ramp, which is tempting because the rest of the
   app uses it for sensitivity — but that ramp encodes identity, not
   magnitude: it is not monotonic in lightness and its first step is a
   desaturated grey-brown that a 20px bar cannot carry on a dark panel. One
   accent hue, palest at level 1, full at level 5. The level is named on the
   axis and the value sits at the end of every bar, so no legend. */
function insDepth(a){
  const host = $("#ins-depth");
  host.textContent = "";
  const total = a.depth.reduce((s, n) => s + n, 0);
  if(!total){ emptyInto(host, "Nothing in this slice."); return; }

  const W = 320, H = 200, L = 96, R = 44, T = 10, rowH = 32;
  const iw = W - L - R;
  const max = Math.max(...a.depth);
  const s = svg(W, H);
  s.setAttribute("aria-label", "How deep you went, by sensitivity level");

  a.depth.forEach((n, i) => {
    const y = T + i * rowH, bh = 20;
    const w = max ? (n / max) * iw : 0;
    const colour = cssv("--acc");
    const op = 0.42 + 0.58 * (i / 4);
    const g = el("g", {class: "vrow"});
    g.appendChild(el("rect", {class: "vlift", x: 0, y: y - 4, width: W, height: bh + 8,
                              fill: cssv("--ink"), rx: 6}));
    g.appendChild(el("text", {class: "vaxis-strong", x: L - 10, y: y + 14,
                              "text-anchor": "end"}, SENS_NAME[i]));
    /* The track is drawn at a fraction of a hairline, not as a filled slab.
       The heat ramp is deliberately dull at level 1 — the same grey-brown the
       cards use for safe ground — and a --surface-3 track was reading louder
       than the bar sitting on it. */
    g.appendChild(el("rect", {x: L, y, width: iw, height: bh, rx: 4,
                              fill: cssv("--line"), opacity: .5}));
    if(n) g.appendChild(el("rect", {class: "vmark vflat", x: L, y, width: Math.max(3, w),
                                    height: bh, rx: 4, fill: colour, opacity: op}));
    g.appendChild(el("text", {class: "vlabel", x: L + iw + 8, y: y + 14}, nf(n)));
    const hit = el("rect", {class: "vhit", x: 0, y: y - 4, width: W, height: bh + 8, tabindex: 0});
    g.appendChild(hit);
    wireHit(hit, host, () => {
      const box = host.getBoundingClientRect();
      showTip(host, (L + Math.max(w, 40) / 2) / W * box.width, (y / H) * box.height,
              `Level ${i + 1} · ${SENS_NAME[i]}`, nf(n),
              [{color: colour, label: "of " + nf(total), value: Math.round(n / total * 100) + "%"}]);
    });
    s.appendChild(g);
  });
  host.appendChild(s);
}

/* ---------------- topics ----------------
   Magnitude again, and there is no ninth hue: past the top eight everything
   folds into Other rather than inventing colours nobody can tell apart. */
function insTopics(a){
  const host = $("#ins-topics");
  host.textContent = "";
  const all = [...a.byTopic.entries()].sort((x, y) => y[1] - x[1]);
  if(!all.length){ emptyInto(host, "Nothing in this slice."); $("#ins-topic-sum").textContent = ""; return; }

  const top = all.slice(0, 8);
  const rest = all.slice(8).reduce((s, r) => s + r[1], 0);
  const rows = rest ? top.concat([["Other topics", rest]]) : top;
  const total = all.reduce((s, r) => s + r[1], 0);

  const W = 720, L = 210, R = 52, T = 6, rowH = 30;
  const H = T + rows.length * rowH + 4, iw = W - L - R;
  const max = rows[0][1];
  const s = svg(W, H);
  s.setAttribute("aria-label", "Busiest topics");

  rows.forEach(([name, n], i) => {
    const y = T + i * rowH, bh = 20;
    const w = (n / max) * iw;
    /* One hue, stepped by rank: the darkest bar is the biggest, and "Other"
       is deliberately the palest thing on the chart. */
    const isOther = rest && i === rows.length - 1;
    const op = isOther ? 0.42 : 1 - (i / (rows.length + 2)) * 0.45;
    const g = el("g", {class: "vrow"});
    g.appendChild(el("rect", {class: "vlift", x: 0, y: y - 4, width: W, height: bh + 8,
                              fill: cssv("--ink"), rx: 6}));
    const label = el("text", {class: "vaxis-strong", x: L - 10, y: y + 14, "text-anchor": "end"});
    label.textContent = name.length > 30 ? name.slice(0, 29) + "…" : name;
    g.appendChild(label);
    g.appendChild(el("rect", {x: L, y, width: iw, height: bh, rx: 4,
                              fill: cssv("--line"), opacity: .5}));
    g.appendChild(el("rect", {class: "vmark vflat", x: L, y, width: Math.max(3, w), height: bh,
                              rx: 4, fill: cssv("--acc"), opacity: op}));
    g.appendChild(el("text", {class: "vlabel", x: L + iw + 8, y: y + 14}, nf(n)));
    const hit = el("rect", {class: "vhit", x: 0, y: y - 4, width: W, height: bh + 8, tabindex: 0});
    g.appendChild(hit);
    wireHit(hit, host, () => {
      const box = host.getBoundingClientRect();
      showTip(host, (L + Math.max(w, 60) / 2) / W * box.width, (y / H) * box.height,
              name, nf(n), [{color: cssv("--acc"),
              label: "of " + nf(total), value: Math.round(n / total * 100) + "%"}]);
    });
    s.appendChild(g);
  });
  host.appendChild(s);
  $("#ins-topic-sum").textContent =
    `${nf(all.length)} of ${nf(DATA.categories.length)} topics touched`;
}

/* ---------------- when you practise ----------------
   A heat grid is the right form for two categorical axes and one magnitude.
   Sequential, one hue, and every cell carries its own tooltip. */
function insWhen(a){
  const host = $("#ins-when");
  host.textContent = "";
  let max = 0;
  for(const row of a.when) for(const n of row) max = Math.max(max, n);
  if(!max){ emptyInto(host, "Nothing in this slice."); return; }

  const L = 34, T = 16, cell = 26, gap = 3;
  const W = L + 24 * cell, H = T + 7 * cell + 18;
  const s = svg(W, H);
  s.setAttribute("aria-label", "Questions by hour of day and day of week");

  for(let h = 0; h < 24; h += 3)
    s.appendChild(el("text", {class: "vaxis", x: L + h * cell + cell / 2, y: 10,
                              "text-anchor": "middle"}, String(h).padStart(2, "0")));

  for(let d = 0; d < 7; d++){
    s.appendChild(el("text", {class: "vaxis", x: L - 8, y: T + d * cell + cell / 2 + 3.5,
                              "text-anchor": "end"}, DAYS_SHORT[d]));
    for(let h = 0; h < 24; h++){
      const n = a.when[d][h];
      const x = L + h * cell, y = T + d * cell;
      const g = el("g", {class: "vrow"});
      g.appendChild(el("rect", {x, y, width: cell - gap, height: cell - gap, rx: 4,
        fill: n ? cssv("--acc") : cssv("--surface-3"),
        opacity: n ? 0.22 + 0.78 * (n / max) : 1}));
      const hit = el("rect", {class: "vhit", x, y, width: cell - gap, height: cell - gap,
                              tabindex: n ? 0 : -1});
      hit.appendChild(el("title", null,
        `${DAYS_SHORT[d]} ${String(h).padStart(2, "0")}:00 — ${n}`));
      g.appendChild(hit);
      if(n) wireHit(hit, host, () => {
        const box = host.getBoundingClientRect();
        showTip(host, ((x + cell / 2) / W) * box.width, (y / H) * box.height,
                `${DAYS_SHORT[d]} · ${String(h).padStart(2, "0")}:00`,
                n + (n === 1 ? " question" : " questions"));
      });
      s.appendChild(g);
    }
  }

  /* A sequential legend is a ramp, not a list of keys. */
  const ly = T + 7 * cell + 12;
  s.appendChild(el("text", {class: "vaxis", x: L, y: ly}, "less"));
  for(let i = 0; i < 5; i++)
    s.appendChild(el("rect", {x: L + 30 + i * 14, y: ly - 8, width: 11, height: 9, rx: 2,
                              fill: cssv("--acc"), opacity: 0.22 + 0.78 * ((i + 1) / 5)}));
  s.appendChild(el("text", {class: "vaxis", x: L + 106, y: ly}, `more (peak ${max})`));
  host.appendChild(s);
}

/* ---------------- people ----------------
   Stacked by outcome, in the same hues the donut uses: colour follows the
   entity, so "Skipped" is one colour everywhere on the page. */
function insPeople(a){
  const host = $("#ins-people");
  host.textContent = "";
  const rows = [...a.byPerson.entries()]
    .map(([pid, mix]) => ({pid, name: TRACK.personName(pid) || "Someone", mix,
                           total: mix.reduce((s, n) => s + n, 0)}))
    .sort((x, y) => y.total - x.total).slice(0, 12);
  if(!rows.length){
    emptyInto(host, "No questions in this slice were tied to a person.");
    $("#ins-people-sum").textContent = "";
    return;
  }

  const W = 720, L = 150, R = 52, T = 6, rowH = 32;
  const H = T + rows.length * rowH + 4, iw = W - L - R;
  const max = rows[0].total;
  const s = svg(W, H);
  s.setAttribute("aria-label", "Questions per person, stacked by outcome");

  rows.forEach((r, i) => {
    const y = T + i * rowH, bh = 20;
    const g = el("g", {class: "vrow"});
    g.appendChild(el("rect", {class: "vlift", x: 0, y: y - 5, width: W, height: bh + 10,
                              fill: cssv("--ink"), rx: 6}));
    const nm = el("text", {class: "vaxis-strong", x: L - 10, y: y + 14, "text-anchor": "end"});
    nm.textContent = r.name.length > 18 ? r.name.slice(0, 17) + "…" : r.name;
    g.appendChild(nm);
    g.appendChild(el("rect", {x: L, y, width: iw, height: bh, rx: 4,
                              fill: cssv("--line"), opacity: .5}));

    let x = L;
    r.mix.forEach((n, k) => {
      if(!n) return;
      const w = (n / max) * iw;
      g.appendChild(el("rect", {class: "vmark", x, y, width: w, height: bh,
                                fill: cssv(OUT_VAR[k])}));
      x += w;
    });
    g.appendChild(el("text", {class: "vlabel", x: L + iw + 8, y: y + 14}, nf(r.total)));

    const hit = el("rect", {class: "vhit", x: 0, y: y - 5, width: W, height: bh + 10, tabindex: 0});
    hit.setAttribute("role", "button");
    hit.appendChild(el("title", null, "Show only " + r.name));
    /* Clicking a person is the same as choosing them in the filter row — the
       chart you are already looking at is the most natural place to drill in
       from, and clicking the one you are on clears it again. */
    const drill = () => {
      INS.person = INS.person === String(r.pid) ? "" : String(r.pid);
      $("#ins-person").value = INS.person;
      renderInsights();
    };
    hit.addEventListener("click", drill);
    hit.addEventListener("keydown", ev => {
      if(ev.key === "Enter" || ev.key === " "){ ev.preventDefault(); drill(); }
    });
    g.appendChild(hit);
    wireHit(hit, host, () => {
      const box = host.getBoundingClientRect();
      showTip(host, (L + iw / 3) / W * box.width, (y / H) * box.height, r.name, nf(r.total),
        r.mix.map((n, k) => n ? {color: cssv(OUT_VAR[k]), label: OUTCOME[k], value: nf(n)} : null)
             .filter(Boolean));
    });
    s.appendChild(g);
  });
  host.appendChild(s);
  legendInto(host, OUTCOME.map((o, i) => ({label: o, color: cssv(OUT_VAR[i])})));
  $("#ins-people-sum").textContent = `${nf(a.byPerson.size)} ` +
    (a.byPerson.size === 1 ? "person" : "people");
}

/* ---------------- the table view ----------------
   Not a fallback — the same figures as text, which is what makes the page
   readable without colour, without hover, and by a screen reader. */
function insTable(a){
  const host = $("#ins-table");
  host.textContent = "";
  const total = a.outcome.reduce((s, n) => s + n, 0) || 1;

  const table = (caption, head, rows) => {
    const t = document.createElement("table");
    const cap = document.createElement("caption"); cap.textContent = caption;
    t.appendChild(cap);
    const tr = document.createElement("tr");
    head.forEach((h, i) => { const th = document.createElement("th");
      th.textContent = h; if(i) th.className = "n"; tr.appendChild(th); });
    t.appendChild(tr);
    for(const r of rows){
      const line = document.createElement("tr");
      r.forEach((c, i) => {
        const td = document.createElement("td");
        if(i === 0 && c && c.swatch){
          const sw = document.createElement("i"); sw.style.background = c.swatch;
          td.append(sw, document.createTextNode(c.label));
        } else { td.textContent = c; if(i) td.className = "n"; }
        line.appendChild(td);
      });
      t.appendChild(line);
    }
    host.appendChild(t);
  };

  table("What you did with each card", ["Outcome", "Questions", "Share"],
    a.outcome.map((n, i) => [{swatch: cssv(OUT_VAR[i]), label: OUTCOME[i]},
                             nf(n), Math.round(n / total * 100) + "%"]));

  const dTot = a.depth.reduce((s, n) => s + n, 0) || 1;
  table("How deep you went", ["Level", "Questions", "Share"],
    a.depth.map((n, i) => [{swatch: cssv("--acc"), label: `${i + 1} · ${SENS_NAME[i]}`},
                           nf(n), Math.round(n / dTot * 100) + "%"]));

  const topics = [...a.byTopic.entries()].sort((x, y) => y[1] - x[1]);
  /* Same denominator the topic chart uses: a handful of logged ranks may no
     longer resolve against the deck, and a table that quietly used a different
     total would put two different percentages for one topic on one page. */
  const tTot = topics.reduce((s, r) => s + r[1], 0) || 1;
  table("Topics", ["Topic", "Questions", "Share"],
    topics.map(([nm, n]) => [nm, nf(n), Math.round(n / tTot * 100) + "%"]));

  const people = [...a.byPerson.entries()]
    .map(([pid, mix]) => [TRACK.personName(pid) || "Someone", mix,
                          mix.reduce((s, n) => s + n, 0)])
    .sort((x, y) => y[2] - x[2]);
  if(people.length)
    table("People", ["Person", "Asked", "Warmer", "Cooler", "Skipped", "Total"],
      people.map(([nm, mix, tot]) => [nm, nf(mix[0]), nf(mix[1]), nf(mix[2]), nf(mix[3]), nf(tot)]));

  const days = [...a.byDay.entries()].sort((x, y) => y[0] - x[0]).slice(0, 60);
  table("Questions per day (most recent 60)", ["Date", "Questions"],
    days.map(([k, n]) => [`${Math.floor(k / 10000)}-${String(Math.floor(k / 100) % 100).padStart(2, "0")}-${String(k % 100).padStart(2, "0")}`, nf(n)]));
}

/* ---------------- KPI row ---------------- */

function insKPIs(a){
  const host = $("#ins-kpis");
  host.textContent = "";
  const dwell = a.dwell.reduce((s, n) => s + n, 0);
  const median = a.dwell.length ? a.dwell[Math.floor(a.dwell.length / 2)] : 0;
  const tiles = [
    {k: "Questions", v: nf(a.n), sub: `${nf(a.ranks.size)} different ones`},
    {k: "Topics", v: nf(a.byTopic.size), unit: "/" + DATA.categories.length,
     sub: a.byTopic.size ? [...a.byTopic.entries()].sort((x, y) => y[1] - x[1])[0][0] : "—"},
    {k: "People", v: nf(a.byPerson.size), sub: a.byPerson.size ? "in this slice" : "none tagged"},
    {k: "Time on the deck", v: (Math.round(dwell / 360) / 10).toFixed(1), unit: "h",
     sub: median ? `${median}s median per card` : "—"},
    {k: "Active days", v: nf(a.byDay.size), sub: a.n && a.byDay.size
      ? `${(a.n / a.byDay.size).toFixed(1)} a day` : "—"},
    {k: "Average frequency", v: a.scored ? Math.round(a.score / a.scored) : "—", unit: "/100",
     sub: "how common your questions are"}
  ];
  for(const t of tiles){
    const d = document.createElement("div"); d.className = "kpi";
    const v = document.createElement("div"); v.className = "v";
    v.textContent = t.v;
    if(t.unit){ const u = document.createElement("small"); u.textContent = t.unit; v.appendChild(u); }
    const k = document.createElement("div"); k.className = "k"; k.textContent = t.k;
    const sub = document.createElement("div"); sub.className = "sub"; sub.textContent = t.sub;
    d.append(v, k, sub); host.appendChild(d);
  }
}

/* ---------------- render ---------------- */

function insFillFilters(){
  const p = $("#ins-person");
  const keep = p.value;
  p.textContent = "";
  const all = document.createElement("option"); all.value = ""; all.textContent = "Everyone";
  p.appendChild(all);
  /* Counts in the list, so you can tell who is worth looking at without
     selecting each of them in turn. */
  const per = new Map();
  for(const e of TRACK.events()){
    const id = e.length > 6 ? e[6] : -1;
    if(id >= 0) per.set(id, (per.get(id) || 0) + 1);
  }
  TRACK.people().forEach((nm, i) => {
    const o = document.createElement("option");
    o.value = String(i);
    o.textContent = per.get(i) ? nm + "  (" + nf(per.get(i)) + ")" : nm;
    p.appendChild(o);
  });
  p.value = keep;
  if(p.value !== keep) INS.person = p.value = "";

  const d = $("#ins-deck");
  if(d.children.length <= 1){
    DATA.decks.forEach((deck, i) => {
      const o = document.createElement("option"); o.value = String(i); o.textContent = deck.name;
      d.appendChild(o);
    });
  }
}

function renderInsights(){
  insFillFilters();
  const rows = insSlice();
  const a = insAgg(rows);

  const bits = [];
  bits.push(INS.range ? `last ${INS.range} days` : "all time");
  if(INS.person !== "") bits.push(TRACK.personName(+INS.person) || "someone");
  if(INS.deck !== "") bits.push((DATA.decks[+INS.deck] || {}).name || "a deck");
  /* The log is a ring buffer. Once it is full this page is showing a window,
     not a total, and says so rather than letting the reader assume otherwise. */
  if(TRACK.events().length >= 6000) bits.push("most recent 6,000 questions");
  $("#ins-scope").textContent = bits.join(" · ");

  insKPIs(a);
  insTrend(a);
  insOutcome(a);
  insDepth(a);
  insTopics(a);
  insWhen(a);
  insPeople(a);
  if(INS.table) insTable(a);
  $("#ins-table-panel").classList.toggle("hidden", !INS.table);
}

function wireInsights(){
  $("#ins-range").addEventListener("click", e => {
    const b = e.target.closest("button[data-r]"); if(!b) return;
    INS.range = +b.dataset.r;
    [...$("#ins-range").children].forEach(x => x.setAttribute("aria-pressed", x === b));
    renderInsights();
  });
  $("#ins-person").addEventListener("change", e => { INS.person = e.target.value; renderInsights(); });
  $("#ins-deck").addEventListener("change", e => { INS.deck = e.target.value; renderInsights(); });
  $("#ins-reset").addEventListener("click", () => {
    INS.range = 0; INS.person = ""; INS.deck = "";
    $("#ins-person").value = ""; $("#ins-deck").value = "";
    [...$("#ins-range").children].forEach(x => x.setAttribute("aria-pressed", x.dataset.r === "0"));
    renderInsights();
  });
  /* Export exactly what the filters are showing, named for the slice, so a
     folder of these does not turn into six files called the same thing. */
  $("#ins-export").addEventListener("click", () => {
    const rows = insSlice();
    if(!rows.length) return toast("Nothing in this slice to export");
    const bits = ["4qian"];
    if(INS.person !== "") bits.push((TRACK.personName(+INS.person) || "person")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-"));
    if(INS.deck !== "") bits.push(((DATA.decks[+INS.deck] || {}).name || "deck")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-"));
    if(INS.range) bits.push("last" + INS.range + "d");
    bits.push(stampFull());
    saveFile(bits.join("-") + ".csv", "text/csv;charset=utf-8",
             TRACK.toCSV(csvLookup, deckName, new Set(rows)));
    toast("Exported " + nf(rows.length) + " rows");
  });

  $("#ins-table-toggle").addEventListener("click", e => {
    INS.table = !INS.table;
    e.currentTarget.setAttribute("aria-pressed", INS.table);
    renderInsights();
  });
}
