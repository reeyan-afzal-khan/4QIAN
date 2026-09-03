/* track.js — the record.
 *
 * Everything the dashboard shows comes from here. Three stores, kept apart on
 * purpose because they age differently:
 *
 *   ev    a ring buffer of individual events. Rich, but trimmed once it gets
 *         long, so nothing here can be treated as an all-time total.
 *   cnt   per-question ask counts. Never trimmed, so "you have asked Q0412
 *         six times" stays true after the events behind it are gone.
 *   day   per-day totals keyed YYYYMMDD. Never trimmed, so the calendar and
 *         the streak survive trimming too.
 *
 * Kept in its own localStorage key rather than inside the settings blob: the
 * settings are written on every toggle, and rewriting a 200 KB record each
 * time a switch flips is how you make a phone stutter.
 */
window.TRACK = (function(){
  const KEY = "4qian.track.v1";
  const KEY_OLD = "cdg.track.v1";   // pre-rename key; migrated on first load
  const CAP = 6000;          // events retained; ~250 KB at the top end
  const EMPTY = {v:1, ev:[], ss:[], cnt:{}, day:{}, first:0, tot:0};

  // ev = [rank, tsSec, how, depth, deckIdx, dwellSec]
  const R=0, TS=1, HOW=2, DEP=3, DK=4, DW=5;
  const HOW_NAME = ["Asked","Warmer","Cooler","Skipped"];

  let T = clone(EMPTY);
  let dirty = false, flushTimer = null;

  function clone(o){ return JSON.parse(JSON.stringify(o)); }

  function load(){
    try{
      /* The record survived the rename: read the new key, fall back to the
         old one, and let the next flush move it across for good. */
      const raw = localStorage.getItem(KEY);
      const old = raw ? null : localStorage.getItem(KEY_OLD);
      const got = JSON.parse(raw || old || "null");
      if(got && got.v === 1){
        T = Object.assign(clone(EMPTY), got);
        if(old) dirty = true;
      }
    }catch(e){ /* a corrupt record must not stop the deck from running */ }
  }
  load();

  /* Writes are batched. A fast tapper can burn through a card a second, and
     each write serialises the whole record. */
  function flush(){
    flushTimer = null;
    if(!dirty) return;
    dirty = false;
    try{ localStorage.setItem(KEY, JSON.stringify(T)); localStorage.removeItem(KEY_OLD); }
    catch(e){
      // Out of quota: drop the oldest half of the events and try once more.
      T.ev = T.ev.slice(-Math.floor(CAP/2));
      try{ localStorage.setItem(KEY, JSON.stringify(T)); }catch(_){}
    }
  }
  function touch(){
    dirty = true;
    if(!flushTimer) flushTimer = setTimeout(flush, 400);
  }
  addEventListener("pagehide", flush);
  addEventListener("visibilitychange", () => { if(document.hidden) flush(); });

  const now = () => Math.floor(Date.now()/1000);
  function dayKey(ms){
    const d = new Date(ms);
    return d.getFullYear()*10000 + (d.getMonth()+1)*100 + d.getDate();
  }

  /* ---------------- writing ---------------- */

  let enabled = true;
  function setEnabled(on){ enabled = !!on; }

  function record(rank, how, depth, deckIdx, dwellMs){
    if(!enabled || rank == null) return;
    const t = now();
    if(!T.first) T.first = t;
    T.ev.push([rank, t, how|0, depth|0, deckIdx|0, Math.min(3600, Math.round((dwellMs||0)/1000))]);
    if(T.ev.length > CAP) T.ev.splice(0, T.ev.length - CAP);
    T.cnt[rank] = (T.cnt[rank]|0) + 1;
    const dk = dayKey(Date.now());
    T.day[dk] = (T.day[dk]|0) + 1;
    T.tot = (T.tot|0) + 1;
    touch();
  }

  let openSession = null;
  function sessionStart(deckIdx){
    openSession = {s: now(), d: deckIdx|0};
  }
  function sessionEnd(asked, deepest, topics){
    if(!enabled || !openSession) { openSession = null; return; }
    if(asked > 0){
      T.ss.push([openSession.s, now(), openSession.d, asked|0, deepest|0, topics|0]);
      if(T.ss.length > 500) T.ss.splice(0, T.ss.length - 500);
      touch();
    }
    openSession = null;
  }

  /* ---------------- reading ---------------- */

  const events   = () => T.ev;
  const sessions = () => T.ss;
  const counts   = () => T.cnt;
  const days     = () => T.day;
  const total    = () => T.tot|0;
  const first    = () => T.first;
  const uniques  = () => Object.keys(T.cnt).length;

  /* Consecutive days ending today or yesterday. Yesterday still counts as
     alive, otherwise the streak dies at midnight for anyone who plays at
     11pm and checks the dashboard the next evening. */
  function streak(){
    const d = new Date();
    let cur = 0, probe = new Date(d);
    if(!T.day[dayKey(probe.getTime())]) probe.setDate(probe.getDate()-1);
    while(T.day[dayKey(probe.getTime())]){ cur++; probe.setDate(probe.getDate()-1); }

    // Longest run anywhere in the record.
    const keys = Object.keys(T.day).map(Number).sort((a,b)=>a-b);
    let best = 0, run = 0, prev = null;
    for(const k of keys){
      const dt = new Date(Math.floor(k/10000), Math.floor(k/100)%100 - 1, k%100);
      if(prev && Math.round((dt - prev)/86400000) === 1) run++; else run = 1;
      best = Math.max(best, run); prev = dt;
    }
    return {cur, best, activeDays: keys.length};
  }

  /* ---------------- export / import / wipe ---------------- */

  function toJSON(extra){
    return JSON.stringify({
      app: "4QIAN",
      exported: new Date().toISOString(),
      track: T,
      settings: extra || null
    }, null, 2);
  }

  /* One row per event, with the question text resolved so the file is
     readable in a spreadsheet without the app next to it. */
  function toCSV(lookup){
    const esc = s => '"' + String(s == null ? "" : s).replace(/"/g,'""') + '"';
    const out = ["date,time,question_id,outcome,depth,deck_index,dwell_seconds,frequency_score,sensitivity,stage,category,english,chinese,pinyin"];
    for(const e of T.ev){
      const q = lookup(e[R]) || [];
      const d = new Date(e[TS]*1000);
      out.push([
        d.toISOString().slice(0,10),
        d.toTimeString().slice(0,8),
        "Q" + String(e[R]).padStart(4,"0"),
        HOW_NAME[e[HOW]] || e[HOW],
        e[DEP], e[DK], e[DW],
        q[1] == null ? "" : q[1], q[2] == null ? "" : q[2], q[3] == null ? "" : q[3],
        esc(q.cat || ""), esc(q[7] || ""), esc(q[8] || ""), esc(q[9] || "")
      ].join(","));
    }
    return out.join("\r\n");
  }

  function importJSON(text){
    const got = JSON.parse(text);
    const t = got && got.track;
    if(!t || t.v !== 1 || !Array.isArray(t.ev)) throw new Error("That file is not a 4QIAN backup.");
    // Merge rather than replace, so importing a phone backup onto a desktop
    // that has its own history does not throw the desktop's away.
    const seen = new Set(T.ev.map(e => e[R] + ":" + e[TS]));
    for(const e of t.ev) if(!seen.has(e[R] + ":" + e[TS])) T.ev.push(e);
    T.ev.sort((a,b) => a[TS] - b[TS]);
    if(T.ev.length > CAP) T.ev.splice(0, T.ev.length - CAP);

    for(const k in (t.cnt||{})) T.cnt[k] = Math.max(T.cnt[k]|0, t.cnt[k]|0);
    for(const k in (t.day||{})) T.day[k] = Math.max(T.day[k]|0, t.day[k]|0);

    const ssSeen = new Set(T.ss.map(s => s[0] + ":" + s[1]));
    for(const s of (t.ss||[])) if(!ssSeen.has(s[0] + ":" + s[1])) T.ss.push(s);
    T.ss.sort((a,b) => a[0] - b[0]);

    T.first = T.first ? Math.min(T.first, t.first || T.first) : (t.first || 0);
    T.tot = Object.values(T.day).reduce((a,b) => a + b, 0);
    dirty = true; flush();
    return {events: T.ev.length, sessions: T.ss.length};
  }

  function wipe(){
    T = clone(EMPTY); openSession = null;
    dirty = true; flush();
  }

  return {R, TS, HOW, DEP, DK, DW, HOW_NAME,
          setEnabled, record, sessionStart, sessionEnd,
          events, sessions, counts, days, total, first, uniques, streak,
          toJSON, toCSV, importJSON, wipe, flush, dayKey};
})();
