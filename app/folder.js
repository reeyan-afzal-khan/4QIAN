/* folder.js — write the CSV straight into a folder on this machine.
 *
 * WHY THIS IS THE WHOLE ANSWER ON A DESKTOP
 * If that folder is inside a Google Drive mount — G:\My Drive\… with Drive for
 * Desktop running — then Google already syncs it, in the background, with this
 * app closed and the browser shut. Nothing here needs to watch a folder, poll
 * for changes, or upload anything: the file lands on disk and Drive takes it
 * from there. Re-implementing that would be a worse copy of a sync client that
 * is already installed.
 *
 * So the app's job is only to stop putting CSVs in the downloads folder and
 * put them where you actually want them.
 *
 * HOW THE BROWSER ALLOWS IT
 * The File System Access API. A page cannot reach into the disk on its own —
 * you pick the folder once, in a real file dialog, and the browser hands back
 * a handle scoped to exactly that folder. The handle is kept in IndexedDB so
 * the choice survives a reload; permission may still need re-granting after a
 * browser restart, which needs a click, so the panel asks for one rather than
 * failing silently.
 *
 * WHERE IT WORKS
 * Chrome and Edge, over https or localhost. Firefox and Safari have not
 * shipped it, and the Android WebView has its own Filesystem path already, so
 * both fall back to the ordinary download.
 */
window.FOLDER = (function(){

  const DB = "4qian.fs", STORE = "handles", KEY = "csvdir";
  let dir = null;                    // FileSystemDirectoryHandle, once granted

  const supported = () => typeof window.showDirectoryPicker === "function" &&
                          !window.Capacitor;

  /* ---------------- the handle, kept across reloads ----------------
     A directory handle is structured-cloneable but not JSON — localStorage
     cannot hold it, so this is the one thing in the app that needs IndexedDB. */
  function idb(){
    return new Promise((ok, fail) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => ok(req.result);
      req.onerror = () => fail(req.error);
    });
  }
  async function idbSet(v){
    const db = await idb();
    return new Promise((ok, fail) => {
      const t = db.transaction(STORE, "readwrite");
      t.objectStore(STORE).put(v, KEY);
      t.oncomplete = () => ok(); t.onerror = () => fail(t.error);
    });
  }
  async function idbGet(){
    const db = await idb();
    return new Promise((ok, fail) => {
      const t = db.transaction(STORE, "readonly");
      const r = t.objectStore(STORE).get(KEY);
      r.onsuccess = () => ok(r.result || null);
      r.onerror = () => fail(r.error);
    });
  }

  /* ---------------- permission ---------------- */

  async function state(handle){
    if(!handle || !handle.queryPermission) return "unsupported";
    return handle.queryPermission({mode: "readwrite"});
  }

  /** Load the remembered folder. Returns "granted", "prompt" or "" — "prompt"
   *  means it is still there but needs a click to reconnect, which a page is
   *  not allowed to do on its own after a restart. */
  async function restore(){
    if(!supported()) return "";
    let h = null;
    try{ h = await idbGet(); }catch(e){ return ""; }
    if(!h) return "";
    const st = await state(h);
    if(st === "granted"){ dir = h; return "granted"; }
    if(st === "prompt"){ dir = h; return "prompt"; }
    return "";
  }

  /** Ask for permission on the remembered folder. Must be called from a click. */
  async function reconnect(){
    if(!dir) return false;
    const st = await dir.requestPermission({mode: "readwrite"});
    return st === "granted";
  }

  /** Choose a folder. Must be called from a click. */
  async function pick(){
    if(!supported()) throw new Error("This browser cannot write to a folder. Chrome or Edge can.");
    const h = await window.showDirectoryPicker({mode: "readwrite", id: "4qian-csv"});
    dir = h;
    try{ await idbSet(h); }catch(e){}
    return h.name;
  }

  async function forget(){
    dir = null;
    try{ await idbSet(null); }catch(e){}
  }

  const ready = () => !!dir;
  const name = () => dir ? dir.name : "";

  /* ---------------- files ---------------- */

  async function write(filename, text){
    if(!dir) throw new Error("No folder chosen.");
    if(await state(dir) !== "granted")
      throw new Error("The folder needs reconnecting — press Reconnect folder.");
    const fh = await dir.getFileHandle(filename, {create: true});
    const w = await fh.createWritable();
    await w.write(text);
    await w.close();
    return filename;
  }

  /** Every CSV in the folder, newest first — including ones you dropped in
   *  yourself, or that Drive for Desktop pulled down from another machine. */
  async function list(){
    if(!dir) return [];
    if(await state(dir) !== "granted") return [];
    const out = [];
    for await (const [nm, h] of dir.entries()){
      if(h.kind !== "file" || !/\.csv$/i.test(nm)) continue;
      const f = await h.getFile();
      out.push({name: nm, size: f.size, modified: f.lastModified});
    }
    out.sort((a, b) => b.modified - a.modified);
    return out;
  }

  async function read(filename){
    if(!dir) throw new Error("No folder chosen.");
    const fh = await dir.getFileHandle(filename);
    return (await fh.getFile()).text();
  }

  async function remove(filename){
    if(!dir) throw new Error("No folder chosen.");
    await dir.removeEntry(filename);
  }

  return {supported, restore, reconnect, pick, forget, ready, name,
          write, list, read, remove};
})();
