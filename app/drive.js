/* drive.js — the CSV lives in a Drive folder, on every device.
 *
 * Entirely optional. With the URL box empty nothing leaves the device and the
 * local Export button works exactly as it always has.
 *
 * HOW IT TALKS TO DRIVE
 * Through a small Apps Script web app you deploy once under your own Google
 * account (see README). The whole integration is one HTTPS POST, which is the
 * point: the same call works in a browser, in the installed PWA and inside the
 * Android WebView.
 *
 * The alternative — OAuth and the Drive API from the page — cannot do that.
 * Google rejects OAuth inside an app webview with "disallowed_useragent", so
 * that build syncs on a laptop and not on a phone. It also only gets the
 * drive.file scope without a security assessment, under which an app may see
 * only the files it created: an existing folder could be written to but never
 * listed. The script runs as you, so neither limit applies, and the app never
 * holds a Google credential of any kind — only a URL and a shared secret you
 * chose.
 *
 * HOW SYNCING WORKS
 * Every upload writes a NEW file, stamped to the second — nothing is ever
 * overwritten, so the folder is a history rather than a pair of latest-only
 * files. Sync uploads a snapshot, then merges in every file this device has
 * not already taken, its own older snapshots included: that is what restores a
 * device which has been wiped or reinstalled.
 *
 * Import merges rather than replaces and is idempotent, so syncing twice
 * changes nothing and two devices converge on the second round. Files are the
 * transport; the merge already in track.js is the meaning.
 */
window.DRIVE = (function(){

  const LS = "4qian.drive.v1";
  let C = {url: "", token: "", device: "", folder: "", auto: false, last: 0};
  try{ Object.assign(C, JSON.parse(localStorage.getItem(LS) || "{}")); }catch(e){}

  const save = () => { try{ localStorage.setItem(LS, JSON.stringify(C)); }catch(e){} };
  /* A copy, not the live object. Handing out the internal state invites a
     caller to change a setting without it ever being written to disk — and
     makes a held reference quietly change under them later. */
  const get = () => Object.assign({}, C);
  const set = patch => { Object.assign(C, patch); save(); };

  /**
   * What is wrong with the URL, in words, or "" if nothing is.
   *
   * https in practice — Apps Script is always https, and an http endpoint
   * would be blocked as mixed content on a hosted build anyway. Plain http on
   * localhost is allowed so this can be exercised against a local stand-in.
   *
   * Checked before anything is sent, because the two ways to get this wrong
   * both surface as the same useless browser error. A cross-origin POST that
   * Google answers with a sign-in redirect is blocked by CORS, and the only
   * thing the page is told is "Failed to fetch" — no status, no body, nothing
   * pointing at the cause. Naming the cause here is the difference between a
   * five-second fix and an afternoon.
   */
  function urlProblem(u){
    const s = String(u == null ? "" : u).trim();
    if(!s) return "No folder URL set.";
    if(/^http:\/\/(localhost|127\.0\.0\.1)[:/]/i.test(s)) return "";      // the local mock
    if(!/^https:\/\//i.test(s)) return "That URL needs to start with https://";
    if(/\/dev(\?|#|$)/i.test(s))
      return "That is the /dev test URL. It only answers a browser signed in as the " +
             "script's owner, so the app gets a sign-in page instead of an answer. " +
             "Deploy the script — Deploy → New deployment → Web app — and paste the " +
             "URL ending in /exec.";
    if(/script\.google\.com/i.test(s) && !/\/exec(\?|#|$)/i.test(s))
      return "An Apps Script web app URL ends in /exec. This one does not.";
    return "";
  }

  const configured = () => !urlProblem(C.url);

  function defaultDevice(){
    if(window.Capacitor) return "Android";
    if(matchMedia("(display-mode: standalone)").matches) return "Installed";
    return "Web";
  }
  if(!C.device){ C.device = defaultDevice(); save(); }

  /* Every upload is its own file, stamped to the second in local time:
     4qian-record-2026-09-05-16-27-31.csv. Nothing is ever overwritten, so the
     folder becomes a history rather than a pair of latest-only files, and two
     devices uploading cannot collide — the second would have to land inside
     the same second as the first. */
  /* dashboard.js owns the name, so a file written to a local folder and one
     uploaded here are called the same thing. Guarded because drive.js is
     parsed before that runs — by the time anything calls this, it exists. */
  const snapshotName = d => (typeof recordFileName === "function")
    ? recordFileName(d)
    : "4qian-record-" + new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19) + ".csv";

  /* Which files have already been folded into this device's record.
   *
   * Without this, a folder holding a year of snapshots would be re-read and
   * merged in full on every sync — correct, because merging is idempotent, but
   * slower every week.
   *
   * Keyed by FILENAME, not by Drive id. The same record now exists in two
   * places — a folder on this machine and a folder on Drive — and the same
   * file has a different id in each. A name is the only key both sides share,
   * and since every name carries a timestamp to the second, names here are
   * unique in practice. Capped: the oldest snapshots are the ones long since
   * merged, and a list of names is not worth unbounded storage. */
  const imported = () => new Set(C.imported || []);
  const markImported = names => {
    if(!names.length) return;
    const all = [...new Set([...(C.imported || []), ...names])];
    set({imported: all.slice(-1000)});
  };
  /* Erasing the record has to erase this too, or a re-sync would decline to
     bring back the very files it needs. */
  const forgetImported = () => set({imported: []});

  /* ---------------- transport ----------------
   *
   * text/plain is deliberate. An Apps Script web app does not answer the CORS
   * preflight that application/json triggers, so a JSON content type fails
   * before the request is even sent. text/plain keeps it a "simple request",
   * which Apps Script does answer. The body is still JSON; only the header is
   * a polite fiction, and it is the documented one.
   */
  async function call(action, extra, timeoutMs){
    const bad = urlProblem(C.url);
    if(bad) throw new Error(bad);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs || 45000);
    try{
      const res = await fetch(C.url, {
        method: "POST",
        headers: {"Content-Type": "text/plain;charset=utf-8"},
        body: JSON.stringify(Object.assign({action, token: C.token}, extra)),
        redirect: "follow",
        signal: ctl.signal
      });
      if(!res.ok) throw new Error("The script returned " + res.status);
      const text = await res.text();
      let out;
      try{ out = JSON.parse(text); }
      catch(_){
        /* An HTML body almost always means the deployment requires sign-in,
           so Google served a login page instead of the script's answer. */
        throw new Error(/<html/i.test(text)
          ? "Got a sign-in page. Redeploy with access set to “Anyone”."
          : "Unreadable reply from the script.");
      }
      if(!out.ok) throw new Error(out.error || "The script refused that.");
      return out;
    }catch(err){
      if(err.name === "AbortError") throw new Error("The script did not answer in time.");
      /* fetch rejects with a TypeError for every cross-origin refusal, and the
         browser deliberately withholds the reason. In practice it is almost
         always one of three things, so the message names all three rather than
         repeating what the console already said. */
      if(err instanceof TypeError)
        throw new Error("Could not reach the script. Usually one of: the deployment's " +
          "“Who has access” is not set to Anyone; the URL is not the /exec one from " +
          "Deploy → Manage deployments; or you are offline.");
      throw err;
    }finally{ clearTimeout(timer); }
  }

  /* ---------------- operations ---------------- */

  async function test(){
    const out = await call("ping", {}, 20000);
    if(out.folder){ C.folder = out.folder; save(); }
    return out;
  }

  const list = () => call("list", {}).then(o => {
    if(o.folder){ C.folder = o.folder; save(); }
    return o.files || [];
  });

  const put = (name, content) => call("put", {name, content}).then(o => o.file);
  const read = id => call("get", {id}).then(o => o.content);
  const remove = id => call("del", {id});

  /** Push a new snapshot up. Never replaces an earlier one. */
  async function upload(csv){
    const file = await put(snapshotName(), csv);
    C.last = Date.now(); save();
    return file;
  }

  /**
   * One button, three jobs: write this device's snapshot, make the local
   * folder and the Drive folder hold the same set of files, and merge in
   * anything not yet taken.
   *
   * `local` is the FOLDER module, or nothing. When a local folder is
   * connected it is where the snapshot is written and where merges are read
   * from — reading a file off the disk beats fetching it back over the
   * network, and it means a CSV you dropped into the folder by hand is picked
   * up exactly like one the app wrote.
   *
   * The mirror is by filename in both directions. Every name carries a
   * timestamp to the second, so "the same name" genuinely means "the same
   * file" and neither side has to guess.
   *
   * Merging is idempotent, so pressing this repeatedly is safe and two devices
   * converge on the second round. A file that will not parse is counted and
   * skipped rather than aborting the run, and is deliberately NOT marked as
   * taken, so a file that was mid-write the first time is retried next time.
   */
  async function sync(csv, importCsv, local){
    const useLocal = !!(local && local.ready());
    let mineName;

    if(useLocal){
      mineName = snapshotName();
      await local.write(mineName, csv);
    } else {
      mineName = (await upload(csv)).name;
    }

    /* ---- make both folders hold the same files ---- */
    let up = 0, down = 0;
    let remote = await list();
    if(useLocal){
      const here = await local.list();
      const hereNames = new Set(here.map(f => f.name));
      const thereNames = new Set(remote.map(f => f.name));

      for(const f of here){
        if(thereNames.has(f.name)) continue;
        await put(f.name, await local.read(f.name));
        up++;
      }
      for(const f of remote){
        if(hereNames.has(f.name)) continue;
        await local.write(f.name, await read(f.id));
        down++;
      }
      if(up || down) remote = await list();
    }

    /* ---- merge whatever has not been taken ---- */
    const done = imported();
    const fresh = [mineName];          // just written from this record
    let merged = 0, skipped = 0;

    const pool = useLocal
      ? (await local.list()).map(f => ({name: f.name, get: () => local.read(f.name)}))
      : remote.map(f => ({name: f.name, get: () => read(f.id)}));

    for(const f of pool){
      if(done.has(f.name) || f.name === mineName) continue;
      try{
        importCsv(await f.get());
        merged++; fresh.push(f.name);
      }catch(err){ skipped++; }
    }

    markImported(fresh);
    C.last = Date.now(); save();
    return {mine: mineName, merged, skipped, up, down, local: useLocal};
  }

  return {get, set, configured, urlProblem, defaultDevice, snapshotName,
          imported, forgetImported,
          test, list, put, read, remove, upload, sync};
})();
