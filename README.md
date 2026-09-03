# 4QIAN

4,228 bilingual (English / 中文 / pinyin) conversation questions, ranked from small talk
to the things you only ask someone you trust — with a dashboard that keeps the record of
every question you have been through.

Ships as three things from one source tree:

| Target | Output | How it runs |
| --- | --- | --- |
| Web / PWA | `release/web/` + `4QIAN-web.zip` | Any static host, or opened from disk. Installable from Chrome on Android. |
| Windows | `release/windows/4QIAN-Setup-4.0.0.exe` (installer)<br>`release/windows/4QIAN-portable-4.0.0.exe` (no install) | Electron. Offline, no server. |
| Android | `release/android/4QIAN-4.0.0.apk` | Capacitor. Signed, sideloadable. |

The application id is `com.fourqian.app` on both Android and Windows. It is not `com.4qian.app`
because a package segment cannot begin with a digit — that is a Java identifier rule, not a
preference, so the spelled-out form is the closest legal match.

Everything is offline-first. The question deck is a local file and your record lives in
`localStorage` on the device — nothing is uploaded anywhere, and there is no account.

---

## The source

```
app/                the whole application — this is the only thing you edit
  index.html        markup for all five views
  styles.css        one committed dark design plus five alternate skins
  questions.js      the deck: 4,228 rows + decks, categories, frames (1 MB, generated)
  track.js          the record: events, per-question counts, per-day totals
  core.js           setup, the session loop, browse, saved
  dashboard.js      aggregation, charts, the record log, export/import
  boot.js           event wiring and start-up
  native.js         Android back button + Electron menu; a no-op in a browser
  sw.js             service worker
build.mjs           stages app/ into every target, stamps the SW cache name
scripts/            android-brand.mjs (icons/splash/theme), android-build.mjs
desktop/            Electron main + preload + electron-builder config
android/            Capacitor project (generated, then branded)
tools/              JDK 21 + Android SDK used by the APK build (not in git)
```

`app/` is a folder of plain files with no build step, no bundler and no framework. It runs
from `file://`, from a static host, inside Electron and inside a WebView unchanged.
`build.mjs` only copies it and stamps one constant.

---

## The dashboard

The deck data carries a **frequency score from 0 to 100** on every question — how often a
question like it actually comes up in conversation. Nothing surfaced it before; it is now
the spine of the dashboard, and it is what makes this usable as a language-learning tool
rather than a bag of trivia.

- **Six KPIs** — questions asked, corpus covered, sessions, day streak, average depth,
  average frequency of what you ask.
- **Activity calendar** — 26 weeks of per-day counts, opened on the current week.
- **High-frequency questions**, two ways:
  - *Most common* — the corpus ranked by score, filterable to what you have not asked yet,
    with your coverage of the 90–100 core band called out.
  - *Your most asked* — your own repeat questions, ranked, plus your busiest topics.
- **Frequency-band coverage** — how far through each band (90–100, 80–89, …) you are. The
  90–100 band is 402 questions and clearing it is the fastest useful win.
- **What you actually ask** — your distribution across the five stages and five
  sensitivity levels.
- **Topic coverage** — all 30 categories, ranked by how much of each you have covered.
- **The record** — every question you have been through, newest first, searchable and
  filterable by outcome (asked / warmer / cooler / skipped). Tap any entry to ask it again.
- **Sessions** — each run with its deck, length, depth reached and topics touched.
- **Your data** — export to JSON or CSV, import a backup, erase the record.

Tracking can be switched off in Decks → *Track my questions*. Turning it off stops new
entries; it never deletes what is already there.

### How the record is stored

Three stores under the `4qian.track.v1` key, kept apart because they age differently:

- `ev` — a 6,000-entry ring buffer of individual events `[rank, ts, outcome, depth, deck, dwell]`.
  Rich, but trimmed, so nothing here is an all-time total.
- `cnt` — per-question ask counts. Never trimmed.
- `day` — per-day totals. Never trimmed, so the calendar and the streak survive trimming.

Writes are batched (400 ms) and flushed on `pagehide`/background, so tapping through cards
quickly does not serialise the whole record on every tap. Settings live in a separate key
(`4qian.v1`) so a toggle does not rewrite a 200 KB record. Both keys were `cdg.*` before the
rename to 4QIAN and are migrated on first load, so an existing record carries over.

Import **merges** rather than replaces — moving a phone backup onto a desktop that has its
own history keeps both.

---

## Building

```bash
npm install
npm --prefix desktop install
```

### Web

```bash
npm run build
```

Writes `release/web/` and `release/4QIAN-web.zip`. Serve the folder over
HTTP (the service worker and PWA install need a real origin; opening `index.html` from disk
works too, just without those).

Local preview:

```bash
npm run serve
```

### Windows

```bash
npm run desktop:win
```

Produces an NSIS installer and a portable `.exe` in `release/windows/`. Neither is
code-signed, so SmartScreen will warn on first run — *More info → Run anyway*. To silence
that permanently you need a code-signing certificate.

Run it without packaging:

```bash
npm run desktop
```

### Android

```bash
npm run android:apk
```

Stages the web build, syncs it into the Capacitor project, and runs `gradle assembleRelease`
using the JDK and SDK in `tools/`. The APK lands in `release/android/`.

Install it by copying the `.apk` to the phone and opening it — Android will ask you to allow
installs from that source once. `adb install -r release/android/4QIAN-4.0.0.apk` also
works; `adb` is at `tools/android-sdk/platform-tools/adb`.

If you change the icons or app colours, re-run `node scripts/android-brand.mjs`.

> **Keep the signing key.** `android/keys/4qian-release.jks` and
> `android/keystore.properties` sign the release APK. Android will refuse to install an
> update signed by a different key, so losing that file means everyone who installed this
> build has to uninstall before they can take an update. Both are gitignored — back them up
> somewhere safe.

---

## Notes on the app itself

- **The consent gate is deliberate.** Crossing into sensitivity 4 or 5 needs an explicit
  confirmation, and the deck only ever moves one rung at a time. That is the point of the
  thing, not a speed bump — do not "improve" it into a skip button.
- **The draw is weighted, not sorted.** Questions at the same depth are picked with a bias
  toward the higher frequency score, so common questions surface first without making every
  session identical.
- **The service worker is stale-while-revalidate for app code.** It used to be cache-first,
  which was survivable when the app was a single HTML file but would happily pair last
  week's `core.js` with this week's `dashboard.js` now that it is split. `build.mjs` also
  stamps the cache name from a hash of the shipped files, so a real deploy retires the old
  cache outright.
