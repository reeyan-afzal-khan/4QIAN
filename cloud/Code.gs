/**
 * 4QIAN — CSV files in a Drive folder.
 *
 * WHAT THIS IS
 * A tiny web app that reads and writes CSV files in one folder of your Drive.
 * The 4QIAN app talks to it with a single HTTPS POST, which is the whole
 * reason it exists: that one call behaves identically in a browser, in an
 * installed PWA and inside the Android WebView.
 *
 * WHY NOT OAUTH AND THE DRIVE API DIRECTLY
 * Because Google refuses OAuth inside an app webview — "disallowed_useragent"
 * — so an OAuth build syncs on the laptop and not on the phone, which is not
 * syncing. It would also need a Cloud project, a client ID per origin, a
 * consent screen, and the non-sensitive drive.file scope, under which an app
 * can only see files it created: your existing folder could be written to but
 * never listed. This script runs as YOU, so it simply has access to the
 * folder, and the app never sees a Google credential at all.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * No merging, no spreadsheet, no dashboard. Files in, files out. The app
 * already knows how to merge a CSV into its record, and putting that logic in
 * two places is how the two copies start disagreeing.
 *
 * SETUP: see the "Saving the CSV to Google Drive" section of README.md.
 */

/** The folder to keep the CSVs in, from its URL:
 *  drive.google.com/drive/folders/<THIS PART> */
var FOLDER_ID = '1Q-xyoz-O875_ltRhYxQMaF83AIy-lUtU';

/** A shared secret the app sends with every request. Change it to anything
 *  long, then paste the same string into the app. The deployment URL is
 *  effectively a password on its own; this is the second half of the pair. */
var TOKEN = 'change-me';

var MAX_BYTES = 8 * 1024 * 1024;     // a sane ceiling for one record

/* ------------------------------------------------------------------ */

function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents);
    if (req.token !== TOKEN) return json({ ok: false, error: 'Bad token' });

    var folder = DriveApp.getFolderById(FOLDER_ID);

    if (req.action === 'ping') {
      return json({ ok: true, folder: folder.getName(), url: folder.getUrl() });
    }

    if (req.action === 'list') {
      return json({ ok: true, folder: folder.getName(), files: listCsv(folder) });
    }

    /* Upsert by name. One file per device, always current, rather than a
       folder that grows a new file every time you press the button. */
    if (req.action === 'put') {
      var name = String(req.name || '').trim();
      var body = String(req.content == null ? '' : req.content);
      if (!name) return json({ ok: false, error: 'No file name' });
      if (!/\.csv$/i.test(name)) name += '.csv';
      if (body.length > MAX_BYTES) return json({ ok: false, error: 'That file is too large' });

      var it = folder.getFilesByName(name), file = null;
      if (it.hasNext()) { file = it.next(); file.setContent(body); }
      else file = folder.createFile(name, body, MimeType.CSV);

      return json({ ok: true, file: describe(file) });
    }

    if (req.action === 'get') {
      var f = byId(folder, req.id);
      if (!f) return json({ ok: false, error: 'No such file in that folder' });
      return json({ ok: true, name: f.getName(),
                    content: f.getBlob().getDataAsString('UTF-8') });
    }

    if (req.action === 'del') {
      var d = byId(folder, req.id);
      if (!d) return json({ ok: false, error: 'No such file in that folder' });
      d.setTrashed(true);
      return json({ ok: true });
    }

    return json({ ok: false, error: 'Unknown action: ' + req.action });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  }
}

/** Visiting the URL in a browser is a health check — the quickest way to tell
 *  whether a deployment actually took. */
function doGet() {
  try {
    return json({ ok: true, service: '4QIAN files',
                  folder: DriveApp.getFolderById(FOLDER_ID).getName() });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Everything the folder holds that looks like a CSV, newest first. Unlike an
 *  OAuth build this sees files you put there by hand too, because it is you
 *  looking. */
function listCsv(folder) {
  var out = [], it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (!/\.csv$/i.test(f.getName())) continue;
    out.push(describe(f));
  }
  out.sort(function (a, b) { return b.modified - a.modified; });
  return out;
}

function describe(f) {
  return { id: f.getId(), name: f.getName(), size: f.getSize(),
           modified: f.getLastUpdated().getTime(), url: f.getUrl() };
}

/** Looked up inside the folder rather than by raw id, so this endpoint can
 *  only ever touch the one folder it was pointed at. */
function byId(folder, id) {
  if (!id) return null;
  var it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (f.getId() === id) return f;
  }
  return null;
}
