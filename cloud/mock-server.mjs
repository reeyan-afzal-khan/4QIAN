/* A local stand-in for the deployed web app.
 *
 * It runs the REAL doPost out of Code.gs against an in-memory folder, so the
 * client round trip — upload, list, read back, merge, delete — is exercised
 * without a Google account. Only DriveApp is stubbed, because a folder in
 * someone's Drive is the one part a local process cannot have.
 *
 *   node cloud/mock-server.mjs
 *
 * Then point the app's Drive panel at http://localhost:5199 with token
 * "change-me".
 */
import {createServer} from "node:http";
import {readFileSync} from "node:fs";

/* ---------------- a folder, in memory ---------------- */

let seq = 0;
const files = new Map();          // id -> {id, name, content, modified}

const fileHandle = f => ({
  getId: () => f.id,
  getName: () => f.name,
  getSize: () => Buffer.byteLength(f.content, "utf8"),
  getLastUpdated: () => new Date(f.modified),
  getUrl: () => "https://drive.google.com/file/d/" + f.id + "/view",
  getBlob: () => ({getDataAsString: () => f.content}),
  setContent: c => { f.content = c; f.modified = Date.now(); },
  setTrashed: t => { if(t) files.delete(f.id); }
});

const iter = list => { let i = 0;
  return {hasNext: () => i < list.length, next: () => list[i++]}; };

const folder = {
  getName: () => "4QIAN-DATABASE (mock)",
  getUrl: () => "https://drive.google.com/drive/folders/mock",
  getFiles: () => iter([...files.values()].map(fileHandle)),
  getFilesByName: n => iter([...files.values()].filter(f => f.name === n).map(fileHandle)),
  createFile: (name, content) => {
    const f = {id: "id" + (++seq), name, content, modified: Date.now()};
    files.set(f.id, f);
    return fileHandle(f);
  }
};

globalThis.DriveApp = {
  getFolderById: id => {
    if(id !== FOLDER_ID_EXPECTED) throw new Error("No item with the given ID could be found");
    return folder;
  }
};
globalThis.MimeType = {CSV: "text/csv"};
globalThis.ContentService = {
  MimeType: {JSON: "json"},
  createTextOutput: s => ({setMimeType: () => ({_body: s})})
};

/* ---------------- the real script ---------------- */

const src = readFileSync("cloud/Code.gs", "utf8");
const api = new Function(src + "\n; return {doPost, doGet, FOLDER_ID, TOKEN};")();
const FOLDER_ID_EXPECTED = api.FOLDER_ID;

const post = body => JSON.parse(
  api.doPost({postData: {contents: JSON.stringify(body)}})._body);

createServer((req, res) => {
  let data = "";
  req.on("data", c => data += c);
  req.on("end", () => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");
    if(req.method === "GET"){ res.end(api.doGet()._body); return; }
    let out;
    try{
      const q = JSON.parse(data || "{}");
      out = post(q);
      if(out.ok) console.log(new Date().toISOString().slice(11, 19),
                             q.action, q.name || q.id || "", "->",
                             out.files ? out.files.length + " files" : "ok");
    }catch(e){ out = {ok: false, error: e.message}; }
    res.end(JSON.stringify(out));
  });
}).listen(5199, () => {
  console.log("mock 4QIAN files endpoint on http://localhost:5199");
  console.log("folder:", FOLDER_ID_EXPECTED);
  console.log("token :", api.TOKEN);
});
