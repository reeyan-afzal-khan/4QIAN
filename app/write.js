/* write.js — handwriting practice.
 *
 * Two things happen on one square pad: the app can draw a character stroke by
 * stroke so you can watch the order, and you can draw it yourself and have
 * each stroke checked before it is accepted. The second is the point. Copying
 * a character you can see teaches you the shape; being made to produce the
 * next stroke from memory, in order, is what teaches you to write.
 *
 * DATA. app/strokes.js holds, for every Chinese character in the deck, the
 * outline of each stroke and its median — the centre line the brush travels.
 * Both are needed and they do different jobs: the outline is what a character
 * actually looks like, the median is what you are being asked to draw. Its
 * encoding is described in scripts/build-strokes.mjs; the decoder is below.
 * It is 1.8 MB, so it is fetched the first time this tab is opened rather
 * than at launch, and never at all for someone who does not come here.
 *
 * DRAWING. A stroke is animated the way a brush works, not the way an SVG
 * does: the outline becomes a clip path and a very thick line is swept along
 * the median inside it. The visible edge is therefore the real contour of the
 * stroke — tapering, hooks and all — rather than a rounded line pretending.
 */

/* ================================================================
   DECODING
   ================================================================ */

const WR_A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const WR_IDX = {};
for(let i = 0; i < 64; i++) WR_IDX[WR_A[i]] = i;

/* Five payload bits per character, top bit continues, zigzagged so a small
   negative delta costs what a small positive one does. */
function wrNum(s, i){
  let v = 0, sh = 0, c;
  do { c = WR_IDX[s[i++]]; v |= (c & 31) << sh; sh += 5; } while(c & 32);
  return [(v & 1) ? -((v + 1) >> 1) : (v >> 1), i];
}

const WR_ARGS = {M: 1, L: 1, Q: 2, C: 3, Z: 0};

/* Back to an ordinary SVG path string. The cursor runs across the whole path,
   exactly as the encoder left it. */
function wrPath(s){
  let i = 0, cx = 0, cy = 0, out = "";
  while(i < s.length){
    const cmd = s[i++];
    out += cmd;
    const n = WR_ARGS[cmd];
    const parts = [];
    for(let k = 0; k < n; k++){
      let d; [d, i] = wrNum(s, i); cx += d;
      let e; [e, i] = wrNum(s, i); cy += e;
      parts.push(cx + " " + cy);
    }
    out += parts.join(" ");
  }
  return out;
}

function wrMedian(s){
  let i = 0, cx = 0, cy = 0;
  const pts = [];
  while(i < s.length){
    let d; [d, i] = wrNum(s, i); cx += d;
    let e; [e, i] = wrNum(s, i); cy += e;
    pts.push([cx, cy]);
  }
  return pts;
}

const WR_CACHE = new Map();

/* Decoding is cheap but not free, and a character is re-read every time you
   undo a stroke or replay the animation. Held by character. */
function wrChar(ch){
  if(WR_CACHE.has(ch)) return WR_CACHE.get(ch);
  /* A traditional character that is also a simplified one — 我, 好, most of
     them — lives in the main file; only the forms that differ are in the
     second. One lookup, two stores, so nothing has to know which. */
  const src = (window.__STROKES__ || {})[ch] ||
              ((window.__STROKES_TW__ || {}).chars || {})[ch];
  if(!src){ WR_CACHE.set(ch, null); return null; }
  const [outlines, medians] = src.split("~");
  const data = {
    ch,
    strokes: outlines.split("|").map(wrPath),
    medians: medians.split("|").map(wrMedian)
  };
  WR_CACHE.set(ch, data);
  return data;
}

/* The data file is a fifth of the app. Loaded on demand, once. */
let WR_LOADING = null;
function wrLoadData(){
  if(window.__STROKES__) return Promise.resolve(true);
  if(WR_LOADING) return WR_LOADING;
  WR_LOADING = new Promise(resolve => {
    const s = document.createElement("script");
    s.src = "./strokes.js";
    s.onload = () => resolve(!!window.__STROKES__);
    s.onerror = () => { WR_LOADING = null; resolve(false); };
    document.head.appendChild(s);

    /* The glosses come with the strokes. Fired alongside rather than after,
       because the pad does not need them to draw — a character with no gloss
       yet is still writable, and the meaning fills in a moment later. */
    const d = document.createElement("script");
    d.src = "./defs.js";
    d.onerror = () => {};
    document.head.appendChild(d);
  });
  return WR_LOADING;
}

/* A character's readings and meanings, as [{say, mean}]. The word bank knows
   about words; this knows about characters, which is what a pad shows. */
function wrDef(ch){
  const raw = (window.__DEFS__ || {})[ch];
  if(!raw) return [];
  return raw.split("¦").map(part => {
    const i = part.indexOf("|");
    return {say: part.slice(0, i), mean: part.slice(i + 1)};
  });
}

let WR_TW_LOADING = null;
function wrLoadTW(){
  if(window.__STROKES_TW__) return Promise.resolve(true);
  if(WR_TW_LOADING) return WR_TW_LOADING;
  WR_TW_LOADING = new Promise(resolve => {
    const s = document.createElement("script");
    s.src = "./strokes-tw.js";
    s.onload = () => resolve(!!window.__STROKES_TW__);
    s.onerror = () => { WR_TW_LOADING = null; resolve(false); };
    document.head.appendChild(s);
  });
  return WR_TW_LOADING;
}

/* The traditional form of a simplified character, where there is one. Some
   simplified characters stand for two traditional ones — 发 is 發 and 髮 —
   so the map holds every variant and the first is the default. */
function wrTradOf(ch){
  const m = (window.__STROKES_TW__ || {}).map || {};
  return m[ch] || "";
}

/* What to actually put on the pad, given the chosen script. */
function wrForm(ch){
  if(WR.script !== "t") return ch;
  const t = wrTradOf(ch);
  return t ? t[0] : ch;
}

/* ================================================================
   MATCHING — is that the stroke you were asked for?
   ================================================================ */

const WR_BOX = 1024;                 // the coordinate space everything is in

const wrDist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function wrLen(pts){
  let n = 0;
  for(let i = 1; i < pts.length; i++) n += wrDist(pts[i], pts[i - 1]);
  return n;
}

/* n points spread evenly along a polyline, so two strokes drawn at different
   speeds and sample rates can be compared point for point. */
function wrResample(pts, n){
  if(pts.length === 1) return Array.from({length: n}, () => pts[0].slice());
  const seg = [];
  let total = 0;
  for(let i = 1; i < pts.length; i++){
    const d = wrDist(pts[i], pts[i - 1]);
    seg.push(d); total += d;
  }
  if(!total) return Array.from({length: n}, () => pts[0].slice());

  const out = [pts[0].slice()];
  const step = total / (n - 1);
  let i = 1, covered = 0;
  for(let k = 1; k < n - 1; k++){
    const target = step * k;
    while(i < pts.length - 1 && covered + seg[i - 1] < target){ covered += seg[i - 1]; i++; }
    const t = seg[i - 1] ? (target - covered) / seg[i - 1] : 0;
    out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t,
              pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]);
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}

/* Thresholds are in the 1024 box, so they do not move when the pad is
   resized. They are deliberately forgiving on shape and strict on the two
   things stroke-order practice is actually about: where a stroke starts, and
   which way it travels. Writing 一 right to left is wrong even though the
   line it leaves is identical. */
const WR_TOL = {
  ends: 270,        // start and end within this of the median's
  shape: 200,       // mean distance between matched points
  dir: 0.15,        // mean cosine against the median's direction
  minRatio: 0.35,   // length, as a fraction of the median's
  maxRatio: 3.2,
  dotLen: 62,       // a median shorter than this is a dot, not a line
  dotNear: 215,
  minDraw: 26,      // below this the gesture is a tap, not a stroke
  rival: 0.9        // another stroke fitting this much better wins
};

function wrMatchOne(user, med){
  const mLen = wrLen(med);

  /* A dot has no meaningful direction and barely any length; asking for
     either would make 冫 unwinnable. Position is the whole test. */
  if(mLen < WR_TOL.dotLen){
    const c = wrResample(user, 3)[1];
    const m = med[med.length >> 1];
    return wrDist(c, m) < WR_TOL.dotNear
      ? {ok: true}
      : {ok: false, why: "That dot is not where this one goes."};
  }

  const uLen = wrLen(user);
  if(uLen < WR_TOL.minDraw)
    return {ok: false, why: "That is a tap — this stroke is a line."};

  const N = 16;
  const a = wrResample(user, N), b = wrResample(med, N);

  if(wrDist(a[0], b[0]) > WR_TOL.ends)
    return {ok: false, why: "Started in the wrong place."};
  if(wrDist(a[N - 1], b[N - 1]) > WR_TOL.ends)
    return {ok: false, why: "Ended in the wrong place."};

  const ratio = uLen / mLen;
  if(ratio < WR_TOL.minRatio) return {ok: false, why: "Too short."};
  if(ratio > WR_TOL.maxRatio) return {ok: false, why: "Too long."};

  let sum = 0;
  for(let i = 0; i < N; i++) sum += wrDist(a[i], b[i]);
  if(sum / N > WR_TOL.shape) return {ok: false, why: "Not the right shape."};

  let dot = 0;
  for(let i = 1; i < N; i++){
    const ux = a[i][0] - a[i - 1][0], uy = a[i][1] - a[i - 1][1];
    const vx = b[i][0] - b[i - 1][0], vy = b[i][1] - b[i - 1][1];
    const nu = Math.hypot(ux, uy), nv = Math.hypot(vx, vy);
    if(nu && nv) dot += (ux * vx + uy * vy) / (nu * nv);
  }
  if(dot / (N - 1) < WR_TOL.dir)
    return {ok: false, why: "Right line, wrong direction."};

  return {ok: true};
}

/* How well a drawn stroke fits a median: mean separation, with the two ends
   weighted, since a stroke that ends in the wrong place is wrong however
   nicely the middle tracked. */
function wrScore(user, med){
  const N = 16;
  const a = wrResample(user, N), b = wrResample(med, N);
  let sum = 0;
  for(let i = 0; i < N; i++) sum += wrDist(a[i], b[i]);
  return sum / N + (wrDist(a[0], b[0]) + wrDist(a[N - 1], b[N - 1])) / 2;
}

/* Passing on its own merits is not enough. A character often repeats a shape
   — the three horizontals of 三, the verticals of 川 — and a threshold loose
   enough for real handwriting is loose enough to accept the neighbour. So the
   stroke you were asked for also has to be the best fit of any stroke in the
   character; if a different one fits clearly better, that is the one you
   drew. This is what makes the order matter rather than merely the shape. */
function wrMatch(user, data, idx){
  const res = wrMatchOne(user, data.medians[idx]);
  if(!res.ok) return res;

  const med = data.medians[idx];
  const mine = wrScore(user, med);

  /* The same test catches backwards. A hooked stroke that doubles back — the
     sweep in 之, the hook in 倒 — starts and ends close enough together that
     the direction check alone lets a reversal through; scored against its own
     median read the other way, it does not. */
  if(wrScore(user, [...med].reverse()) < mine * WR_TOL.rival)
    return {ok: false, why: "Right line, wrong direction."};

  for(let j = 0; j < data.medians.length; j++){
    if(j === idx) continue;
    if(wrScore(user, data.medians[j]) < mine * WR_TOL.rival)
      return {ok: false, why: "That is a different stroke of this character."};
  }
  return {ok: true};
}

/* ================================================================
   STATE
   ================================================================ */

const WR = {
  ch: "",            // the character on the pad
  data: null,
  step: 0,           // strokes accepted so far
  misses: 0,         // consecutive misses on the current stroke
  drawing: null,     // points of the stroke in progress
  busy: false,       // an animation owns the pad
  outline: true,     // show the character faintly behind
  word: null,        // the word it came from, for context
  ready: false,      // strokes.js has loaded
  script: "s",       // "s" simplified, "t" traditional
  band: [1, 100]     // which slice of the frequency list is on show
};

const WR_NS = "http://www.w3.org/2000/svg";
const wrEl = (n, at) => {
  const e = document.createElementNS(WR_NS, n);
  for(const k in at) e.setAttribute(k, at[k]);
  return e;
};

function wrProgress(){
  S.write = S.write || {done: {}, strokes: 0};
  if(!S.write.done) S.write.done = {};
  return S.write;
}

/* Adopting the stored choices is a one-off, not something wrProgress does on
   every call. It used to: which meant every read of the progress object put
   the *saved* script back over the one the user had just switched to, and the
   pad kept drawing the old form until something else repainted. */
let WR_RESTORED = false;
function wrRestore(){
  if(WR_RESTORED) return;
  WR_RESTORED = true;
  const p = wrProgress();
  if(p.script) WR.script = p.script;
  if(Array.isArray(p.band) && p.band.length === 2) WR.band = p.band;
}

/* ================================================================
   THE PAD
   ================================================================ */

function wrGrid(){
  const g = wrEl("g", {class: "wr-grid"});
  g.appendChild(wrEl("rect", {x: 2, y: 2, width: WR_BOX - 4, height: WR_BOX - 4, rx: 10}));
  const mid = WR_BOX / 2;
  for(const d of [`M${mid} 0V${WR_BOX}`, `M0 ${mid}H${WR_BOX}`,
                  `M0 0L${WR_BOX} ${WR_BOX}`, `M${WR_BOX} 0L0 ${WR_BOX}`])
    g.appendChild(wrEl("path", {d, class: "wr-guide"}));
  return g;
}

function wrPaint(){
  const svg = $("#wr-pad");
  if(!svg) return;
  svg.innerHTML = "";

  const defs = wrEl("defs", {});
  const clip = wrEl("clipPath", {id: "wr-clip"});
  const clipPath = wrEl("path", {id: "wr-clip-p", d: ""});
  clip.appendChild(clipPath); defs.appendChild(clip);
  svg.appendChild(defs);
  svg.appendChild(wrGrid());

  const d = WR.data;
  if(!d){
    svg.appendChild(wrEl("text", {x: WR_BOX / 2, y: WR_BOX / 2, class: "wr-none",
      "text-anchor": "middle"})).textContent = WR.ready ? "no stroke data" : "loading…";
    return;
  }

  /* The whole character, faint, so you can see what you are aiming at. Off is
     the harder and more useful setting once you know it. */
  if(WR.outline){
    const g = wrEl("g", {class: "wr-ghost"});
    for(let i = WR.step; i < d.strokes.length; i++)
      g.appendChild(wrEl("path", {d: d.strokes[i]}));
    svg.appendChild(g);
  }

  const done = wrEl("g", {class: "wr-done", id: "wr-done"});
  for(let i = 0; i < WR.step; i++)
    done.appendChild(wrEl("path", {d: d.strokes[i]}));
  svg.appendChild(done);

  /* The animating stroke lives in its own clipped group. */
  const anim = wrEl("g", {id: "wr-anim", "clip-path": "url(#wr-clip)"});
  anim.appendChild(wrEl("path", {id: "wr-brush", class: "wr-brush", d: ""}));
  svg.appendChild(anim);

  /* After a couple of misses, the median of the stroke you owe appears. */
  svg.appendChild(wrEl("g", {id: "wr-hint", class: "wr-hint"}));

  svg.appendChild(wrEl("path", {id: "wr-ink", class: "wr-ink", d: ""}));
  wrPaintHint();
}

function wrPaintHint(){
  const g = $("#wr-hint");
  if(!g) return;
  g.innerHTML = "";
  const d = WR.data;
  if(!d || WR.misses < 2 || WR.step >= d.medians.length) return;
  const med = d.medians[WR.step];
  g.appendChild(wrEl("path", {
    d: "M" + med.map(p => p.join(" ")).join("L"),
    class: "wr-hint-line"
  }));
  /* Where it starts matters more than anything else about it. */
  g.appendChild(wrEl("circle", {cx: med[0][0], cy: med[0][1], r: 34, class: "wr-hint-dot"}));
}

/* ---------------- animation ---------------- */

const wrReduced = () =>
  window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

function wrAnimateStroke(i){
  const d = WR.data;
  return new Promise(resolve => {
    if(!d || !d.strokes[i]) return resolve();
    const clip = $("#wr-clip-p"), brush = $("#wr-brush");
    if(!clip || !brush) return resolve();

    clip.setAttribute("d", d.strokes[i]);
    brush.setAttribute("d", "M" + d.medians[i].map(p => p.join(" ")).join("L"));
    const len = brush.getTotalLength() || 1;
    brush.style.strokeDasharray = len;

    let over = false;
    const finish = () => {
      if(over) return;
      over = true;
      brush.style.strokeDashoffset = 0;
      resolve();
    };
    if(wrReduced()) return setTimeout(finish, 90);

    /* Longer strokes take longer, within reason — a uniform duration makes a
       dot look laboured and a sweeping 捺 look hurried. */
    const ms = Math.min(760, Math.max(230, len * 0.85));

    /* A backgrounded page stops firing requestAnimationFrame, and this promise
       gates WR.busy — which gates the pad. Without a floor, switching away
       mid-stroke and coming back leaves the pad permanently dead. The timer is
       that floor; whichever gets there first wins and the other is a no-op. */
    const guard = setTimeout(finish, ms + 400);
    const t0 = performance.now();
    (function frame(now){
      if(over) return;
      const t = Math.min(1, (now - t0) / ms);
      brush.style.strokeDashoffset = len * (1 - t);
      if(t < 1) requestAnimationFrame(frame);
      else { clearTimeout(guard); finish(); }
    })(t0);
  });
}

function wrClearBrush(){
  const clip = $("#wr-clip-p"), brush = $("#wr-brush");
  if(clip) clip.setAttribute("d", "");
  if(brush){ brush.setAttribute("d", ""); brush.style.strokeDashoffset = 0; }
}

/* Play the character through from the top. */
async function wrWatch(){
  if(!WR.data || WR.busy) return;
  WR.busy = true;
  WR.step = 0; WR.misses = 0;
  wrPaint(); wrRenderMeta();
  for(let i = 0; i < WR.data.strokes.length; i++){
    await wrAnimateStroke(i);
    WR.step = i + 1;
    wrClearBrush();
    wrPaint();
  }
  WR.step = 0;
  WR.busy = false;
  wrPaint(); wrRenderMeta();
}

/* Show the one stroke that is owed. */
async function wrShowStroke(){
  if(!WR.data || WR.busy) return;
  if(WR.step >= WR.data.strokes.length) return;
  WR.busy = true;
  WR.misses = Math.max(WR.misses, 2);
  wrPaintHint();
  await wrAnimateStroke(WR.step);
  wrClearBrush();
  WR.busy = false;
  wrRenderMeta();
}

/* ================================================================
   DRAWING
   ================================================================ */

function wrPoint(e){
  const svg = $("#wr-pad");
  const r = svg.getBoundingClientRect();
  /* The pad is square and the viewBox is square, so this is a straight
     proportion — no getScreenCTM, which some engines get wrong inside a
     transformed ancestor. */
  return [(e.clientX - r.left) / r.width * WR_BOX,
          (e.clientY - r.top)  / r.height * WR_BOX];
}

function wrInkPath(pts){
  if(!pts.length) return "";
  return "M" + pts.map(p => p[0].toFixed(1) + " " + p[1].toFixed(1)).join("L");
}

function wrDown(e){
  if(WR.busy || !WR.data) return;
  if(WR.step >= WR.data.strokes.length) return;
  e.preventDefault();
  WR.drawing = [wrPoint(e)];
  $("#wr-pad").setPointerCapture(e.pointerId);
  $("#wr-ink").setAttribute("d", wrInkPath(WR.drawing));
}

function wrMove(e){
  if(!WR.drawing) return;
  e.preventDefault();
  const p = wrPoint(e);
  const last = WR.drawing[WR.drawing.length - 1];
  /* Thin the samples: a fast drag can fire forty events across one stroke and
     the extra points buy nothing the resampler does not already do. */
  if(wrDist(p, last) < 6) return;
  WR.drawing.push(p);
  $("#wr-ink").setAttribute("d", wrInkPath(WR.drawing));
}

function wrUp(e){
  if(!WR.drawing) return;
  e.preventDefault();
  const pts = WR.drawing;
  WR.drawing = null;
  $("#wr-ink").setAttribute("d", "");
  if(pts.length < 1) return;

  const d = WR.data;
  const res = wrMatch(pts, d, WR.step);
  if(res.ok) wrAccept();
  else {
    WR.misses++;
    wrPaintHint();
    wrRenderMeta(res.why);
    const pad = $("#wr-padwrap");
    if(pad && !wrReduced()){
      pad.classList.remove("wr-shake");
      void pad.offsetWidth;
      pad.classList.add("wr-shake");
    }
  }
}

async function wrAccept(){
  const d = WR.data;
  WR.busy = true;
  await wrAnimateStroke(WR.step);
  wrClearBrush();
  WR.step++;
  WR.misses = 0;
  WR.busy = false;
  wrPaint();

  if(WR.step >= d.strokes.length){
    const p = wrProgress();
    p.done[WR.ch] = (p.done[WR.ch] | 0) + 1;
    p.strokes = (p.strokes | 0) + d.strokes.length;
    save();
    wrRenderMeta();
    wrRenderPicker();
    toast(p.done[WR.ch] > 1
      ? WR.ch + " — written " + p.done[WR.ch] + " times"
      : WR.ch + " — first time written");
  } else {
    wrRenderMeta();
  }
}

function wrUndo(){
  if(WR.busy || !WR.data || !WR.step) return;
  WR.step--;
  WR.misses = 0;
  wrPaint(); wrRenderMeta();
}

function wrRestart(){
  if(WR.busy) return;
  WR.step = 0; WR.misses = 0;
  wrPaint(); wrRenderMeta();
}

/* ================================================================
   PICKING WHAT TO WRITE
   ================================================================ */

/* A character on its own is a character; a character inside a word you have
   actually met is a thing you might write on purpose. The picker leans on the
   word bank for that reason. */
function wrSetWord(hz, focus){
  WR.word = hz || null;
  wrSetChar(focus || (hz || "")[0]);
}

function wrSetChar(ch){
  /* A character picked from somewhere other than the current word ends the
     word: leaving 朋友 in the chip strip while the pad shows 说 says the two
     are related, and they are not. */
  if(ch && WR.word && !WR.word.includes(ch)) WR.word = null;
  WR.ch = ch ? wrForm(ch) : "";
  WR.src0 = ch || "";              // the simplified form it came from
  WR.data = WR.ch ? wrChar(WR.ch) : null;
  WR.step = 0; WR.misses = 0; WR.drawing = null;
  wrPaint(); wrRenderMeta(); wrRenderPicker();
}

const WR_HAN = /[一-鿿㐀-䶿]/;

/* Search the characters, not the word bank. This is a character pad: looking
   up "water" should offer 水, and it used to offer nothing, because the bank
   holds words and has no entry for most single characters. Matches come back
   in frequency order, so the common answer is the first one. */
function wrSearch(q){
  q = (q || "").trim().toLowerCase();
  if(!q) return [];

  const hans = [...q].filter(c => WR_HAN.test(c));
  if(hans.length) return [...new Set(hans)].map(c => wrRow(c));

  const bare = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const needle = bare(q).replace(/\s+/g, "");
  const out = [];
  for(const c of wrFreq()){
    const hit = wrDef(c).some(d =>
      bare(d.say).replace(/\s+/g, "").includes(needle) ||
      d.mean.toLowerCase().includes(q));
    if(hit) out.push(wrRow(c));
    if(out.length >= 200) break;
  }
  return out;
}

/* The frequency list, as picker rows. Each is a bare character rather than a
   word, so the gloss is whatever the word bank knows about it — often
   nothing, because these are characters, not words. */
const wrFreq = () => window.__STROKES_FREQ__ || "";
const wrRankOf = ch => wrFreq().indexOf(ch);   // -1 for anything off the list

/* Every row in the picker is one character, described the same way wherever
   it came from. */
function wrRow(ch, rank){
  const shown = wrForm(ch);
  const d = wrDef(shown)[0] || wrDef(ch)[0];
  const v = VOCAB.byWord.get(ch);
  const r = rank == null ? wrRankOf(ch) + 1 : rank;
  return {hz: ch, rank: r || 0,
          py: d ? d.say : (v ? v.py : ""),
          en: d ? d.mean : (v ? v.en : "")};
}

/* One slice of the frequency list. All two thousand at once is both slow to
   lay out and useless to read — a range is how anyone actually works through
   a frequency list, a hundred or so at a time. */
function wrFreqRows(){
  const freq = wrFreq();
  const [a, b] = WR.band;
  const out = [];
  for(let i = a - 1; i < Math.min(b, freq.length); i++) out.push(wrRow(freq[i], i + 1));
  return out;
}

function wrRenderPicker(){
  const list = $("#wr-results");
  if(!list) return;
  const q = ($("#wr-q") || {}).value || "";
  const p = wrProgress();

  const searching = !!q.trim();
  const rows = searching ? wrSearch(q) : wrFreqRows();

  const note = $("#wr-src-note");
  if(note) note.textContent = searching
    ? nf(rows.length) + (rows.length === 200 ? "+ matches" :
        rows.length === 1 ? " match" : " matches")
    : WR.band[0] + "–" + WR.band[1];

  const wrap = $("#wr-band-wrap");
  if(wrap) wrap.hidden = searching;

  if(!rows.length){
    list.innerHTML = '<p class="pmeta">No character matches that. Try a meaning ' +
      '(<i>water</i>), a reading (<i>shui</i>), or paste the character itself.</p>';
  } else {
    list.innerHTML = rows.map(w => {
      const shown = wrForm(w.hz);
      const done = p.done[shown] | 0;
      return `<button class="wr-row${shown === WR.ch ? " on" : ""}" data-hz="${esc(w.hz)}">
        <span class="wr-rank">${w.rank || ""}</span>
        <span class="wr-row-hz">${esc(shown)}</span>
        <span class="wr-row-t"><b>${esc(w.en || shown)}</b><small>${esc(w.py)}</small></span>
        <span class="wr-row-n${done ? " done" : ""}">${done ? "✓ " + done : ""}</span>
      </button>`;
    }).join("");
  }

  /* The characters of the current word, so a two-character word is two taps
     rather than a new search. */
  const strip = $("#wr-chars");
  if(strip){
    const chars = [...(WR.word || WR.src0 || WR.ch || "")].filter(c => WR_HAN.test(c));
    strip.innerHTML = chars.length < 1 ? "" : chars.map(c => {
      const f = wrForm(c);
      return `<button class="wr-chip${f === WR.ch ? " on" : ""}" data-ch="${esc(c)}">
         <b>${esc(f)}</b><small>${p.done[f] ? p.done[f] + "×" : "—"}</small>
       </button>`;
    }).join("");
  }
}

function wrSay(text){
  const say = $("#wr-say");
  if(say){ say.textContent = text; say.classList.remove("bad"); }
}

function wrRenderMeta(why){
  const d = WR.data;

  /* One pip per stroke, filled as they land. A fraction tells you the same
     thing, but a row of pips tells you it without being read — you can see
     how much of the character is left in the corner of your eye while your
     hand is on the pad. */
  const pips = $("#wr-pips");
  if(pips){
    pips.innerHTML = d ? d.strokes.map((_, i) =>
      `<i class="${i < WR.step ? "on" : ""}"></i>`).join("") : "";
  }
  const n = $("#wr-count");
  if(n) n.textContent = d
    ? WR.step + " of " + d.strokes.length + " stroke" + (d.strokes.length === 1 ? "" : "s")
    : "—";

  const head = $("#wr-char");
  if(head) head.textContent = WR.ch || "—";

  /* Where this sits in the frequency list, which is the whole reason these
     two thousand are the ones that ship. */
  const rank = $("#wr-rank");
  if(rank){
    const r = wrRankOf(WR.src0 || WR.ch) + 1;
    rank.hidden = !r;
    if(r) rank.textContent = "#" + r;
  }
  const pos = $("#wr-pos");
  if(pos){
    const r = wrRankOf(WR.src0 || WR.ch) + 1;
    pos.textContent = r ? r + " of " + nf(wrFreq().length) : "";
  }
  for(const id of ["wr-prev", "wr-next-ch"]){
    const b = $("#" + id);
    if(b) b.disabled = !wrFreq().length || WR.busy;
  }

  /* What the character means, which is the whole reason to write it. The
     dictionary is asked first because it knows characters; the word bank is
     the fallback and knows words. */
  const gloss = $("#wr-gloss");
  if(gloss){
    const from = WR.src0 || WR.ch;
    const defs = WR.ch ? wrDef(WR.ch) : [];
    if(defs.length){
      gloss.innerHTML = defs.map(d =>
        `<span class="wr-read"><b>${esc(d.say)}</b> ${esc(d.mean)}</span>`).join("");
    } else {
      const v = from && VOCAB.byWord.get(from);
      gloss.textContent = v ? v.py + " · " + v.en : "";
    }
  }

  /* Where it came from, kept apart from the meaning so a long definition does
     not push it out of sight. */
  const ctx = $("#wr-ctx");
  if(ctx){
    const from = WR.src0 || WR.ch;
    const bits = [];
    /* Say so when the pad shows a different form from the one the word bank
       knows, otherwise 說 beside a gloss for 说 looks like a bug. */
    if(WR.script === "t" && from && from !== WR.ch) bits.push("traditional of " + from);
    const inWord = WR.word && WR.word !== from ? VOCAB.byWord.get(WR.word) : null;
    if(inWord) bits.push("in " + inWord.hz + " — " + inWord.en);
    ctx.textContent = bits.join(" · ");
  }

  const say = $("#wr-say");
  if(say){
    if(!WR.ready) say.textContent = "Loading the stroke data…";
    else if(!d) say.textContent = "No stroke data for this character.";
    else if(WR.step >= d.strokes.length) say.textContent = "Done — that is the whole character.";
    else if(why) say.textContent = why + " Try that stroke again.";
    else if(WR.misses >= 2) say.textContent = "The stroke you owe is marked. Start at the dot.";
    else say.textContent = "Draw stroke " + (WR.step + 1) + " on the pad.";
    say.classList.toggle("bad", !!why);
  }

  const undo = $("#wr-undo");
  if(undo) undo.disabled = !d || !WR.step || WR.busy;
  for(const id of ["wr-watch", "wr-hint-b", "wr-restart"]){
    const b = $("#" + id);
    if(b) b.disabled = !d || WR.busy;
  }

  const p = wrProgress();
  const tally = $("#wr-tally");
  if(tally){
    const chars = Object.keys(p.done).length;
    tally.textContent = chars
      ? nf(chars) + " character" + (chars === 1 ? "" : "s") + " written · " +
        nf(p.strokes | 0) + " strokes"
      : "Nothing written yet.";
  }
}

/* ================================================================
   ENTRY
   ================================================================ */

/* One place that knows whether the data has arrived, so the tab and the word
   dialog cannot both decide to load it and race each other to set the
   character. */
async function wrEnsure(){
  if(WR.ready) return !!window.__STROKES__;
  wrRenderMeta();
  const ok = await wrLoadData();
  WR.ready = true;
  if(!ok) toast("Could not load the stroke data");
  return ok;
}

async function renderWrite(){
  wrRestore();                        // adopt any stored script/source choice, once
  if(!WR.ready){
    const ok = await wrEnsure();
    if(!ok){ wrRenderMeta(); return; }
    /* A traditional choice saved from a previous visit needs its data before
       anything is drawn, or the first character comes up blank. */
    if(WR.script === 't' && !await wrLoadTW()) WR.script = 's';
    if(!WR.ch){
      /* Open on the first character of whichever band was left showing. */
      const freq = wrFreq();
      wrSetChar(freq[WR.band[0] - 1] || freq[0] || "你");
      return;
    }
    WR.data = wrChar(WR.ch);
  }
  for(const x of $("#wr-script").children)
    x.setAttribute("aria-pressed", String(x.dataset.s === WR.script));
  for(const x of $("#wr-band").children)
    x.setAttribute("aria-pressed", String(+x.dataset.a === WR.band[0]));
  wrPaint(); wrRenderMeta(); wrRenderPicker();
}

function wireWrite(){
  const svg = $("#wr-pad");
  if(!svg) return;
  svg.addEventListener("pointerdown", wrDown);
  svg.addEventListener("pointermove", wrMove);
  svg.addEventListener("pointerup", wrUp);
  svg.addEventListener("pointercancel", () => {
    WR.drawing = null;
    const ink = $("#wr-ink"); if(ink) ink.setAttribute("d", "");
  });

  $("#wr-watch").addEventListener("click", wrWatch);
  $("#wr-hint-b").addEventListener("click", wrShowStroke);
  $("#wr-undo").addEventListener("click", wrUndo);
  $("#wr-restart").addEventListener("click", wrRestart);
  $("#wr-prev").addEventListener("click", () => wrGo(-1));
  $("#wr-next-ch").addEventListener("click", () => wrGo(1));

  const out = $("#wr-outline");
  out.addEventListener("click", () => {
    WR.outline = !WR.outline;
    out.setAttribute("aria-pressed", String(WR.outline));
    wrPaint();
  });
  out.setAttribute("aria-pressed", String(WR.outline));

  /* Switching script reloads the character on the pad in the other form, and
     the traditional data is only fetched the first time it is asked for. */
  $("#wr-script").addEventListener("click", async e => {
    const b = e.target.closest("[data-s]");
    if(!b || b.dataset.s === WR.script) return;
    const want = b.dataset.s;
    if(want === "t"){
      wrSay("Loading the traditional characters…");
      if(!await wrLoadTW()){ toast("Could not load the traditional data"); return; }
    }
    WR.script = want;
    wrProgress().script = want; save();
    for(const x of $("#wr-script").children)
      x.setAttribute("aria-pressed", String(x.dataset.s === want));
    wrSetChar(WR.src0 || WR.ch);
  });

  $("#wr-band").addEventListener("click", e => {
    const b = e.target.closest("[data-a]");
    if(!b) return;
    WR.band = [+b.dataset.a, +b.dataset.b];
    wrProgress().band = WR.band; save();
    for(const x of $("#wr-band").children)
      x.setAttribute("aria-pressed", String(x === b));
    wrRenderPicker();
    const list = $("#wr-results"); if(list) list.scrollTop = 0;
  });

  $("#wr-q").addEventListener("input", () => {
    const v = $("#wr-q").value;
    /* A pasted character is an instruction, not a search term. */
    const hans = [...v].filter(c => WR_HAN.test(c));
    if(hans.length === 1 && v.trim().length === 1){
      wrSetWord(null, hans[0]);
      return;
    }
    wrRenderPicker();
  });

  $("#wr-results").addEventListener("click", e => {
    const b = e.target.closest("[data-hz]");
    if(b) wrSetChar(b.dataset.hz);
  });
  $("#wr-chars").addEventListener("click", e => {
    const b = e.target.closest("[data-ch]");
    if(b) wrSetChar(b.dataset.ch);
  });
}

/* Step through the frequency list without going back to it. This is the loop
   the tab is for: write #1, next, write #2 — and it is the difference between
   a list you browse and a list you work through. */
function wrGo(delta){
  const freq = wrFreq();
  if(!freq.length || WR.busy) return;
  let i = wrRankOf(WR.src0 || WR.ch);
  /* Arrived from somewhere off the list — a search, or the Words dialog —
     so enter it at the top of the band on show rather than at zero. */
  if(i < 0) i = WR.band[0] - 1 - delta;
  const j = Math.max(0, Math.min(freq.length - 1, i + delta));
  wrSetChar(freq[j]);

  /* Follow the character with the band, so the list underneath is always the
     part you are in. */
  const rank = j + 1;
  if(rank < WR.band[0] || rank > WR.band[1]){
    const b = [...$("#wr-band").children].find(x => rank >= +x.dataset.a && rank <= +x.dataset.b);
    if(b){
      WR.band = [+b.dataset.a, +b.dataset.b];
      wrProgress().band = WR.band; save();
      for(const x of $("#wr-band").children) x.setAttribute("aria-pressed", String(x === b));
      wrRenderPicker();
    }
  }
  /* Keep the row you are on in view. */
  const on = $("#wr-results .wr-row.on");
  if(on) on.scrollIntoView({block: "nearest"});
}

/* Open the tab already pointed at something — used by the word dialog. */
async function writeThis(hz, ch){
  show("write");
  if(await wrEnsure()) wrSetWord(hz, ch);
}
window.writeThis = writeThis;
