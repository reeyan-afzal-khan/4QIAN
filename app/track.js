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
  /* pp — the people you have talked to. This app is used alongside a chat
     app, one stranger at a time, so "who was this with" is the dimension
     everything else turns out to hang off: which questions you have already
     used on somebody, how far you got with them, and whether an icebreaker
     is safe to reuse. It is a plain name list; the id is the index. */
  const EMPTY = {v:1, ev:[], ss:[], cnt:{}, day:{}, first:0, tot:0, pp:[], seen:{}};

  // ev = [rank, tsSec, how, depth, deckIdx, dwellSec]
  const R=0, TS=1, HOW=2, DEP=3, DK=4, DW=5, PID=6;
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

  /* ---------------- people ----------------
   *
   * Names are matched case-insensitively on the trimmed string, because the
   * same person typed as "lin" on Tuesday and "Lin" on Friday is the same
   * person and nobody wants two rows for that.
   */
  const key = nm => String(nm || "").trim().toLowerCase();
  function personId(nm){
    const k = key(nm);
    if(!k) return -1;
    let i = T.pp.findIndex(p => key(p) === k);
    if(i < 0){ T.pp.push(String(nm).trim().slice(0, 24)); i = T.pp.length - 1; touch(); }
    return i;
  }
  const people = () => T.pp;
  const personName = i => T.pp[i] || "";

  /* What you have already used on this person. Kept per person rather than
     globally: a good icebreaker should come back for the next stranger, and
     should never come back for the same one. */
  function seenBy(pid){
    if(pid < 0) return [];
    return T.seen[pid] || [];
  }
  /* Deliberately NOT gated on `enabled`. The tracking switch is about the
     dashboard record — what you asked, when, how long you sat with it. This
     list is a functional requirement: without it the deck asks the same
     person the same question twice, which is not a statistic being collected,
     it is the app being broken. Turning tracking off used to silently drop
     this and bring repeats back. */
  function markSeen(pid, rank){
    if(pid < 0) return;
    const list = T.seen[pid] || (T.seen[pid] = []);
    if(!list.includes(rank)){ list.push(rank); touch(); }
  }
  function forgetSeen(pid){
    if(pid < 0) return;
    delete T.seen[pid]; touch(); flush();
  }
  /* Everything the record knows about one person, for the dashboard. */
  function personStats(pid){
    let asked = 0, sessions = 0, first = 0, last = 0, deepest = 0;
    for(const e of T.ev){
      if(e[PID] !== pid) continue;
      asked++;
      if(!first || e[TS] < first) first = e[TS];
      if(e[TS] > last) last = e[TS];
      if(e[DEP] > deepest) deepest = e[DEP];
    }
    for(const s of T.ss) if(s[6] === pid) sessions++;
    return {asked, sessions, first, last, deepest, covered: seenBy(pid).length};
  }

  function record(rank, how, depth, deckIdx, dwellMs, pid){
    if(!enabled || rank == null) return;
    const t = now();
    if(!T.first) T.first = t;
    T.ev.push([rank, t, how|0, depth|0, deckIdx|0,
               Math.min(3600, Math.round((dwellMs||0)/1000)),
               pid == null ? -1 : pid|0]);
    if(T.ev.length > CAP) T.ev.splice(0, T.ev.length - CAP);
    T.cnt[rank] = (T.cnt[rank]|0) + 1;
    const dk = dayKey(Date.now());
    T.day[dk] = (T.day[dk]|0) + 1;
    T.tot = (T.tot|0) + 1;
    touch();
  }

  let openSession = null;
  function sessionStart(deckIdx, pid){
    openSession = {s: now(), d: deckIdx|0, p: pid == null ? -1 : pid|0};
  }
  function sessionEnd(asked, deepest, topics){
    if(!enabled || !openSession) { openSession = null; return; }
    if(asked > 0){
      T.ss.push([openSession.s, now(), openSession.d, asked|0, deepest|0, topics|0, openSession.p]);
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

  /* ---------------- CSV ----------------
   *
   * One row per event, with the question text resolved so the file reads on
   * its own in a spreadsheet, and complete enough that importing it back
   * rebuilds the whole record rather than a bare list: the counts, the daily
   * totals, the people, each person's seen list and the sessions all come
   * back.
   *
   * `session` is the one column here for the machine rather than the reader:
   * which run the event belonged to. Sessions are stored apart from events,
   * so without it an import could only guess where one conversation ended
   * and the next began.
   *
   * The time is written HH-MM-SS rather than HH:MM:SS on purpose. A spreadsheet
   * recognises the colon form as a time, converts it, and then shows it back in
   * whatever the machine's locale prefers; with dashes it is left alone as text
   * and reads the same everywhere. The date has no such escape — YYYY-MM-DD is
   * what the file says, and a spreadsheet set to US format will still display it
   * as MM/DD/YYYY. importCSV therefore reads a date in any of those shapes.
   */
  const CSV_HEAD = ["session", "date", "time", "person", "question_id",
                    "category", "english", "chinese", "outcome", "level",
                    "sensitivity", "stage", "frequency_score", "deck", "seconds"];

  /* What the person column says when a run was not tied to anybody. Written
     out rather than left blank so an empty cell always means "this column had
     nothing to say", never "there was nobody". */
  const NO_PERSON = "Not Mentioned";

  /* Written as a code point rather than pasted in, because an invisible
     character in source is the kind of thing an editor eats silently. */
  const BOM = String.fromCharCode(0xFEFF);

  const csvCell = v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
  const pad2 = n => (n < 10 ? "0" : "") + n;

  /**
   * `keep` is an optional Set of event rows to include — Insights passes the
   * slice its filters are showing, so you can export exactly what is on
   * screen. Run numbers are still walked across the WHOLE log rather than the
   * subset, or a filtered export would renumber its sessions and stop lining
   * up with a full one.
   */
  function toCSV(lookup, deckName, keep){
    /* Both halves of the stamp are local. They used not to be: the date was
       sliced out of toISOString() while the time came from toTimeString(),
       so an evening in UTC+5 was filed under the next day at yesterday's
       clock time. */
    const stamp = d => [
      d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()),
      pad2(d.getHours()) + "-" + pad2(d.getMinutes()) + "-" + pad2(d.getSeconds())
    ];

    /* Which run each event belongs to.
     *
     * Walked in order, spending each session's own tally as a quota, rather
     * than asking "whose range contains this timestamp?". Range matching
     * reads well and quietly fails when two runs begin and end inside the
     * same second: the first one swallows every later event. The tally
     * separates them exactly, while the range check still leaves anything
     * recorded outside a session — a question of the day, a card reopened
     * from the log — correctly unassigned. Events are in time order, which
     * is what makes a single pass enough. */
    const runs = T.ss.map((s, i) => ({from: s[0], to: s[1], left: s[3] | 0, n: i + 1}));
    let ri = 0;
    const runOf = ts => {
      while(ri < runs.length && (runs[ri].left <= 0 || ts > runs[ri].to)) ri++;
      const r = runs[ri];
      if(!r || ts < r.from) return "";
      r.left--;
      return r.n;
    };

    const out = [CSV_HEAD.map(csvCell).join(",")];
    for(const e of T.ev){
      const run = runOf(e[TS]);           // spent for every row, kept for some
      if(keep && !keep.has(e)) continue;
      const q = lookup(e[R]) || [];
      const when = stamp(new Date(e[TS] * 1000));
      out.push([
        run, when[0], when[1],
        personName(e[PID]) || NO_PERSON,
        "Q" + String(e[R]).padStart(4, "0"),
        q.cat || "", q[7] || "", q[8] || "",
        HOW_NAME[e[HOW]] || e[HOW],
        e[DEP],
        q[2] == null ? "" : q[2],
        q[3] == null ? "" : q[3],
        q[1] == null ? "" : q[1],
        deckName ? deckName(e[DK]) : e[DK],
        e[DW]
      ].map(csvCell).join(","));
    }

    /* The byte-order mark is the whole reason the Chinese survives the trip.
       Excel opens a .csv without one using the legacy Windows code page and
       renders it as mojibake; the file was always valid UTF-8, the reader
       just needed telling. */
    return BOM + out.join("\r\n") + "\r\n";
  }

  /* A real parser rather than split(","). Category names like "Alcohol,
     substances & risky habits" and any question containing a comma live
     inside quoted fields, and a naive split shreds them. */
  function parseCSV(text, sep){
    const s = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
    const rows = [];
    let row = [], field = "", quoted = false;

    for(let i = 0; i < s.length; i++){
      const c = s[i];
      if(quoted){
        if(c !== '"'){ field += c; continue; }
        if(s[i + 1] === '"'){ field += '"'; i++; }   // "" is one literal quote
        else quoted = false;
        continue;
      }
      if(c === '"')       quoted = true;
      else if(c === sep)  { row.push(field); field = ""; }
      else if(c === "\n") { row.push(field); field = ""; rows.push(row); row = []; }
      else if(c !== "\r") field += c;
    }
    if(field !== "" || row.length){ row.push(field); rows.push(row); }
    return rows.filter(r => r.some(f => f !== ""));
  }

  /* Excel in a locale that uses the comma as a decimal separator writes CSVs
     with semicolons, and calls them .csv all the same. Sniffed from the first
     line, outside quotes, so a file re-saved from a spreadsheet still opens. */
  function sniffSep(text){
    const line = text.split("\n")[0] || "";
    let best = ",", most = -1;
    for(const sep of [",", ";", "\t"]){
      let n = 0, quoted = false;
      for(const c of line){
        if(c === '"') quoted = !quoted;
        else if(c === sep && !quoted) n++;
      }
      if(n > most){ most = n; best = sep; }
    }
    return best;
  }

  /* Dates come back in whatever shape the spreadsheet felt like writing.
     YYYY-MM-DD is what this app exports; the rest is what Excel hands back
     after it has decided the column was a date. Where the order is genuinely
     ambiguous — 05/09/2026 — month-first wins, because that is the layout the
     spreadsheets that rewrite the column use. A day above 12 settles it. */
  function parseDate(v){
    const s = String(v || "").trim();
    let m;
    if((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s)))
      return {y: +m[1], m: +m[2], d: +m[3]};
    if((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s))){
      const a = +m[1], b = +m[2];
      return a > 12 ? {y: +m[3], m: b, d: a} : {y: +m[3], m: a, d: b};
    }
    return null;
  }

  /* HH-MM-SS is what this app writes. A colon, a dot, or a trailing am/pm is
     what comes back from a spreadsheet that parsed the column anyway. */
  function parseClock(v){
    const s = String(v || "").trim().toLowerCase();
    const pm = /\bpm\b/.test(s), am = /\bam\b/.test(s);
    const n = s.replace(/[ap]m/g, "").trim().split(/[-:. ]+/).map(x => parseInt(x, 10));
    let h = isFinite(n[0]) ? n[0] : 0;
    if(pm && h < 12) h += 12;
    if(am && h === 12) h = 0;
    return {h, mi: isFinite(n[1]) ? n[1] : 0, se: isFinite(n[2]) ? n[2] : 0};
  }

  function whenOf(date, time){
    const d = parseDate(date);
    if(!d) return NaN;
    const t = parseClock(time);
    return Math.floor(new Date(d.y, d.m - 1, d.d, t.h, t.mi, t.se).getTime() / 1000);
  }

  /**
   * Rebuild a record from an exported CSV and merge it in.
   *
   * Counts, daily totals, people, seen lists and sessions are all derived
   * here rather than stored in the file, which keeps the CSV a plain
   * rectangular table a person can read instead of a serialisation format
   * wearing a table's clothes.
   *
   * The merge goes through importJSON, so there is one implementation of
   * "combine two records" rather than two that can drift apart.
   */
  function importCSV(text, deckIndex){
    if(!String(text || "").trim()) throw new Error("That file is empty.");
    const rows = parseCSV(text, sniffSep(text));
    if(rows.length < 2) throw new Error("That CSV has a header but no rows under it.");

    /* Headers are matched on name, so column order does not matter and extra
       columns of your own are ignored rather than fatal. */
    const col = {};
    rows[0].forEach((h, i) => {
      const k = String(h).trim().toLowerCase().replace(/\s+/g, "_");
      if(col[k] === undefined) col[k] = i;
    });
    if(col.question_id === undefined)
      throw new Error("That is not a 4QIAN export — it has no question_id column.");
    if(col.timestamp === undefined && (col.date === undefined || col.time === undefined))
      throw new Error("That CSV has no date and time columns to place its rows in.");

    const howOf = {};
    HOW_NAME.forEach((n, i) => howOf[n.toLowerCase()] = i);

    const rec = {v:1, ev:[], ss:[], cnt:{}, day:{}, first:0, tot:0, pp:[], seen:{}};
    const pidOf = nm => {
      const k = String(nm || "").trim();
      /* The export writes "Not Mentioned" where a run had nobody attached, so
         it reads back as nobody rather than as a person of that name. */
      if(!k || k.toLowerCase() === NO_PERSON.toLowerCase()) return -1;
      const at = rec.pp.findIndex(p => p.toLowerCase() === k.toLowerCase());
      if(at >= 0) return at;
      rec.pp.push(k.slice(0, 24));
      return rec.pp.length - 1;
    };

    const runs = new Map();
    let used = 0, skipped = 0;

    for(let r = 1; r < rows.length; r++){
      const row = rows[r];
      const at = k => col[k] === undefined ? ""
                    : String(row[col[k]] == null ? "" : row[col[k]]).trim();

      /* A bare number is as acceptable as Q0156: a spreadsheet that decided
         the column was numeric will have stripped the prefix and the zeros. */
      const rank = parseInt(at("question_id").replace(/^q/i, ""), 10);

      /* Rebuilt from the local date and time it was written with. A file that
         still carries the old timestamp column is believed instead, since an
         epoch second cannot be reformatted by a spreadsheet.

         One thing no code can recover: the very first export took its date
         from UTC and its time from local, so an evening row in it is filed a
         day late. That was never written down correctly to begin with. */
      const ts = col.timestamp !== undefined && at("timestamp")
        ? parseInt(at("timestamp"), 10)
        : whenOf(at("date"), at("time"));
      if(!isFinite(rank) || rank < 0 || !isFinite(ts) || ts <= 0){ skipped++; continue; }

      const pid   = pidOf(at("person"));
      const how   = howOf[at("outcome").toLowerCase()];
      const level = parseInt(at("level") || at("depth"), 10);
      const secs  = parseInt(at("seconds") || at("dwell_seconds"), 10);
      /* Newer files name their deck; the first one wrote a bare index. */
      const deck  = col.deck !== undefined
        ? (deckIndex ? deckIndex(at("deck")) : parseInt(at("deck"), 10))
        : parseInt(at("deck_index"), 10);

      /* Clamped rather than trusted. A hand-edited row with level 9 in it
         would otherwise reach the dashboard's five-slot histograms and be
         dropped silently there instead of loudly here. */
      const lv = isFinite(level) ? Math.min(5, Math.max(1, level)) : 1;
      rec.ev.push([rank, ts, isFinite(how) ? how : 0, lv,
                   isFinite(deck) ? deck : 0,
                   isFinite(secs) && secs > 0 ? Math.min(secs, 86400) : 0, pid]);
      used++;

      rec.cnt[rank] = (rec.cnt[rank] | 0) + 1;
      const d = new Date(ts * 1000);
      const dk = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
      rec.day[dk] = (rec.day[dk] | 0) + 1;

      if(pid >= 0){
        const seen = rec.seen[pid] || (rec.seen[pid] = []);
        if(seen.indexOf(rank) === -1) seen.push(rank);
      }

      /* Sessions are rebuilt from the run each event names. Start and end
         come from the first and last card in it, so a re-imported session
         runs a few seconds shorter than the original — it cannot know about
         the time spent before the first question appeared. */
      const run = at("session");
      if(!run) continue;
      let g = runs.get(run);
      if(!g){
        g = {from: ts, to: ts, deck: isFinite(deck) ? deck : 0,
             n: 0, deepest: 0, topics: new Set(), pid};
        runs.set(run, g);
      }
      g.from = Math.min(g.from, ts);
      g.to   = Math.max(g.to, ts);
      g.n++;
      g.deepest = Math.max(g.deepest, lv);
      if(at("category")) g.topics.add(at("category"));
    }

    if(!used) throw new Error(
      skipped ? `None of the ${skipped} rows had a readable question and date.`
              : "That CSV had no readable rows.");

    for(const g of runs.values())
      rec.ss.push([g.from, g.to, g.deck, g.n, g.deepest, g.topics.size, g.pid]);
    rec.ss.sort((a, b) => a[0] - b[0]);

    rec.first = rec.ev.reduce((m, e) => m ? Math.min(m, e[TS]) : e[TS], 0);
    rec.tot = Object.values(rec.day).reduce((a, b) => a + b, 0);

    const got = importJSON(JSON.stringify({app: "4QIAN", track: rec}));
    return {events: got.events, sessions: got.sessions, read: used, skipped};
  }

  function importJSON(text){
    const got = JSON.parse(text);
    const t = got && got.track;
    if(!t || t.v !== 1 || !Array.isArray(t.ev)) throw new Error("That file is not a 4QIAN backup.");
    /* People first, because everything below is stamped with a person id and
       the incoming ids are indexes into the OTHER device's list. They are
       remapped onto this device's before anything that carries one is merged.
       Importing a phone backup onto a laptop that has met some of the same
       people must not produce two "Lin"s, and must never hand one person's
       history to another. */
    const remap = new Map();
    (t.pp || []).forEach((nm, i) => remap.set(i, personId(nm)));
    const toLocal = id => (id == null || id < 0) ? -1
                        : (remap.has(id) ? remap.get(id) : -1);

    for(const oldId in (t.seen || {})){
      const to = toLocal(+oldId);
      if(to < 0) continue;
      const list = T.seen[to] || (T.seen[to] = []);
      for(const r of t.seen[oldId]) if(!list.includes(r)) list.push(r);
    }

    // Merge rather than replace, so importing a phone backup onto a desktop
    // that has its own history does not throw the desktop's away.
    const seen = new Set(T.ev.map(e => e[R] + ":" + e[TS]));
    for(const e of t.ev){
      if(seen.has(e[R] + ":" + e[TS])) continue;
      // Rows written before this app tracked people have no person column.
      e[PID] = e.length > PID ? toLocal(e[PID]) : -1;
      T.ev.push(e);
    }
    T.ev.sort((a,b) => a[TS] - b[TS]);
    if(T.ev.length > CAP) T.ev.splice(0, T.ev.length - CAP);

    for(const k in (t.cnt||{})) T.cnt[k] = Math.max(T.cnt[k]|0, t.cnt[k]|0);
    for(const k in (t.day||{})) T.day[k] = Math.max(T.day[k]|0, t.day[k]|0);

    const ssSeen = new Set(T.ss.map(s => s[0] + ":" + s[1]));
    for(const s of (t.ss||[])){
      if(ssSeen.has(s[0] + ":" + s[1])) continue;
      s[6] = s.length > 6 ? toLocal(s[6]) : -1;
      T.ss.push(s);
    }
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

  return {R, TS, HOW, DEP, DK, DW, PID, HOW_NAME,
          setEnabled, record, sessionStart, sessionEnd,
          events, sessions, counts, days, total, first, uniques, streak,
          personId, people, personName, personStats, seenBy, markSeen, forgetSeen,
          toCSV, importCSV, importJSON, wipe, flush, dayKey};
})();
