# 4QIAN

4,228 bilingual (English / 中文 / pinyin) conversation questions, ordered from safe openers
to the things you only ask someone who trusts you.

Built to sit beside a chat window while you talk to somebody you have never met, in a
language one of you is still learning. It keeps a separate history for every person you
talk to, hands you the question in a form you can paste, and never jumps ahead of where
the conversation actually is.

Ships as two things from one source tree:

| Target | Output | How it runs |
| --- | --- | --- |
| Web / PWA | `release/web/` + `4QIAN-web.zip` | Any static host, or opened from disk. Installable from Chrome on Android. |
| Android | `release/android/4QIAN-4.0.0.apk` | Capacitor. Signed, sideloadable. |

The application id is `com.fourqian.app`. It is not `com.4qian.app` because a package segment
cannot begin with a digit — that is a Java identifier rule, not a preference, so the
spelled-out form is the closest legal match.

Everything is offline-first. The question deck is a local file and your record lives in
`localStorage` on the device — nothing is uploaded anywhere, and there is no account.

The mark is **4千** — the name written the way the app is, half in digits and half in
Chinese. It replaced 你, which said *you* but did not say which app. It is drawn from an
SVG rather than kept as a binary, so the glyph, the colours and the safe-zone padding are
all editable text and the three PNGs cannot drift apart: `node scripts/make-icons.mjs`
regenerates them, and `--check` renders without writing and reports whether the CJK glyph
actually resolved on the machine doing the build. After changing it, re-run
`node scripts/android-brand.mjs` to push the new mark through to the Android launcher
icons and splash.

---

## The source

```
app/                the whole application — this is the only thing you edit
  index.html        markup for all seven views, six dialogs and the tour overlay
  styles.css        one committed dark design plus eleven alternate skins
  questions.js      the deck: 4,228 rows + decks, categories, frames (1 MB, generated)
  vocab.js          the word bank: 1,081 hand-glossed words, also the segmenter's dictionary
  answers.js        AREC answers: 55 exact + 50 topic-level, covering all 4,228
  track.js          the record: events, counts, per-day totals, and who each was with
  core.js           setup, themes, speech, the session loop, vocabulary, the tour, browse, saved
  dashboard.js      aggregation, charts, the record log, CSV export and import
  insights.js       the filterable chart view: trend, donut, bars, heat grid, table
  folder.js         writes exports into a folder you pick; inside a Drive mount that IS the sync
  drive.js          optional: posts a CSV to a Drive folder through a small Apps Script
  boot.js           event wiring, keyboard map and start-up
  native.js         Android back button and status bar; a no-op in a browser
  sw.js             service worker
build.mjs           stages app/ into every target, stamps the SW cache name
scripts/
  pinyin.mjs        romaniser learned from the corpus; the reference for all new Chinese
  fix-sandhi.mjs    applies 一/不 tone sandhi to the deck's pinyin
  fix-readings.mjs  corrects word-level pinyin errors in the deck
  universalise.mjs  takes the American assumptions out of the questions
  universalise2.mjs a second sweep for the ones the first scan's regex missed
  word-reading.mjs  reports every spelling the deck uses for a given word
  answers/*.mjs     the exact AREC answers, in four batches
  answers/topic/    the topic-level answers, by category and question shape
  scaffold-source.mjs / build-answers.mjs
                    the fallback frames, and the builder that emits app/answers.js
  answer-review.mjs every polyphone decision the generated pinyin made, with context
  vocab-check.mjs / align-vocab.mjs / vocab-dedupe.mjs
                    validate the word bank against the corpus
  make-icons.mjs    draws the 4千 mark and writes the three app icons
  android-brand.mjs (icons/splash/theme), android-build.mjs
cloud/
  Code.gs           the Apps Script web app: read and write CSVs in one Drive folder
  appsscript.json   the Drive scope, declared rather than inferred
  mock-server.mjs   that same doPost on :5199, so sync works without deploying
android/            Capacitor project (generated, then branded)
tools/              JDK 21 + Android SDK used by the APK build (not in git)
```

Everything under `scripts/` other than the two Android ones is a **content tool**, not
part of the build. They were written to make specific corrections to `app/questions.js`
reviewable and repeatable rather than done by hand across four thousand rows; each has a
`--check` or dry-run mode that prints its diff, and only writes with `--write`.

`app/` is a folder of plain files with no build step, no bundler and no framework. It runs
from `file://`, from a static host and inside a WebView unchanged.
`build.mjs` only copies it and stamps one constant.

---

## The content, and what was wrong with it

The deck shipped with two problems that no amount of interface work fixes.

### It assumed an American reader

Seventy-eight questions named things only one country has: Congress and senators, the
Tonight Show, Hollywood, college football play-offs, dollar amounts, the
elementary / junior high / high school ladder. A learner in Jakarta or Lagos or Lisbon
reads those as questions about somewhere else, and a question you cannot answer is not a
conversation starter.

All of them are rewritten. Institutions became generic (*your country's parliament*),
amounts became relative (*a week's pay* rather than *$100*), and the school ladder became
primary / secondary / university. `scripts/universalise.mjs` holds the table and prints
the full diff with `--check`.

The Chinese was rewritten alongside wherever it carried the same assumption — 橄榄球 is
specifically American football, 美元 is specifically dollars. Where the Chinese was
already neutral (it said 大学 while the English said *college*) only the English moved.

One deliberate asymmetry: the Chinese keeps 小学 / 初中 / 高中 rather than a calque of
"primary / lower secondary / upper secondary", because those **are** the Chinese terms for
those stages. Making the Chinese worse to learn from so that it matches the English more
literally is the wrong trade for a language app.

### The pinyin was wrong in about a fifth of the deck

Not sloppy — wrong, in ways a first-year course marks:

- **一 and 不 tone sandhi was not applied at all.** Both change tone according to what
  follows them, mechanically: 不 → *bú* before a fourth tone, 一 → *yí* before a fourth
  tone and *yì* before a first, second or third. The deck printed *yī* and *bù*
  everywhere. **815 syllables across 758 questions** now carry the right tone, with the
  numeral cases (第一, 一月) correctly left alone.
- **Seven words were consistently misread**: 照片 as *zhào piān*, 行为 as *xíng wèi*,
  一场 as *yì cháng*, 之一 as *zhī yí*, 电子 as *diàn zi*, 差距 as *chà jù*, 为了 as
  *wèi liǎo*. Consistency is what made them findable. **72 corrections.**

Everything else checked out: the corpus is entirely simplified, uses full-width
punctuation throughout, has no duplicate questions, and its pinyin aligns
syllable-for-syllable with the Chinese in **4,223 of 4,228 rows**.

That alignment turned out to be the useful discovery. It means the deck **is** a
pronunciation dictionary for its own vocabulary, so `scripts/pinyin.mjs` learns a
character-to-reading table from it and romanises every new sentence written for the app
from the corpus's own readings, rather than from a bundled dictionary that would disagree
with the cards. New Chinese is romanised, then every polyphonic character in it is listed
for review by `scripts/answer-review.mjs`, which is how the errors in the model answers
(数到 as *shù dào*, 得 as *de*, 笼统 as *lóng tǒng*) were caught before they shipped.

> One bug worth recording, because it hid for a while and looked like a data problem.
> The tools tested whether a token was a syllable with `/[a-zü]/i`, which does not match
> `ā` or `è` — a syllable that is a single tone-marked vowel has no ASCII letter in it at
> all. Every sentence containing 阿, 饿, 额 or 噩 therefore lost a syllable from its count
> and misaligned everything after it. It cost 18 corpus rows their alignment and made five
> perfectly good model answers look broken. The test is now one exported constant
> (`SYLLABLE` in `pinyin.mjs`) that all six tools import, and re-running the fixers after
> the repair found three more sandhi errors in rows that had previously been skipped.

---

## What this is actually for

4QIAN is a **sidecar to a chat window**. It is not a party game two people play over a
table — it is the thing you keep open beside HelloTalk or Discord while you are talking to
somebody you have never met, usually in a language one of you is still learning.

That single fact settles most of the design questions, and it settled several of them
differently from how they were first built.

### One stranger at a time

Put their handle in the box on the Decks screen and the app keeps a separate history for
them. This matters more than it sounds:

- **Nothing repeats with the same person.** You will not send Lin the same opener twice
  three weeks apart, which is exactly the failure that makes a question bank embarrassing.
- **Your best openers come back for the next person.** A global "seen" list burns
  *Do you like hiking?* forever the first time you use it. Per-person, it is available
  again for every new conversation — which is the whole point of having good openers.

The Dashboard grows a **People** panel: everyone you have talked to, how much you got
through, how deep you got, and how long ago. Tapping a name makes them the live
conversation.

Naming people is optional. With the box empty the app behaves as it did before, on one
shared list.


### The draw

Questions are picked at random, weighted toward the common end — a question with a
frequency score of 100 is about six times as likely to come up as one scoring 0, so the
language you meet first is the language you will actually hear. A straight sort would make
every session identical, so the score only tilts the dice.

That was random and did not feel it. Uniform sampling over a pool where one category holds
a third of the questions deals that category a third of the time **in clumps** — measured at
**21% of cards landing on the same topic as the one before**, with runs of up to nine. Eight
of twenty cards about films is not a conversation.

So the draw also holds back whatever just came up: a topic seen one card ago keeps 6% of its
weight, two cards ago 20%, fading back to full by eight. Grammar frames get a lighter version
of the same treatment, so you do not get four *What is your favourite …?* in a row either.
Nothing is ever weighted to zero, so a small pool still deals rather than stalling.

| | before | after |
| --- | --- | --- |
| same topic as previous card | 20.9% | 1.8% |
| longest same-topic run in 20 | 9 | 2 |
| distinct opening questions in 400 fresh starts | 277 | 274 |

The last row is the check that matters: the spread pass changes how a *sequence* feels
without making the deck any less random.

### Send it, don't read it out

The other person cannot see your screen, so the most-used control is "give me this in a form
I can paste". The copy button on the card, or `C`, puts **the Chinese then the English** on
your clipboard: the Chinese for them to read, the English so you know what you just sent.

### Which language *you* are practising

A separate setting from which language is shown first. It decides which side is hidden
until you attempt it, and — more usefully — which language leads in the model answers. If
you are learning Chinese, the Chinese is the model and the English is the crib. If you are
learning English, the reverse. Same content, opposite emphasis.

### Consent, at a distance

The gate above sensitivity 3 was written for two people in a room, and told them to agree
out loud. That is not available here, so it now says what actually applies: ask first, read
a non-answer as a no, and remember that a stranger who feels pushed does not argue — they
stop replying.

### Two themes that match the window next to them

**Discord** takes Discord's own three greys and its blurple; **Sky** takes the white-and-blue
of a language-exchange app. The sidecar should read as a companion to the window beside it
rather than as a different application, and for the window people actually keep it beside,
the closer the match the better. Ten other palettes are unchanged.

---

## Making it explain itself

Most of what was confusing about this app was not the ideas — it was the labels.

### The rest of the jargon

| was | is |
| --- | --- |
| `sensitivity ≤ 3` | `nothing past personal` |
| `locked` | `not in this deck` |
| `499 left` | `499 more` |
| `Depth 1/5` | `Level 1 of 5` |
| `Warmer →` / `← Cooler` | `Deeper →` / `← Lighter` |
| `Next question, same depth` | `Another question like this one` |

**Warmer/Cooler** went because it is a metaphor you have to be taught; *deeper* and
*lighter* are what the buttons actually do. The heat metaphor survives everywhere it is
carried by colour rather than by words.

### A legend for the card

The chips on a card — the stage, the sensitivity number, `freq 86`, `Prompt` — were never
explained anywhere. There is now a **?** beside the speaker on every card that opens a
legend showing each chip at its real size next to what it means, including what the
frequency score is for and why it is worth paying attention to.

---

## The tour

Seven steps, in two halves, reachable from **Decks → Show me how it works** and offered
once on a first run.

The split is deliberate. A single tour would have to drive the app into a session on the
user's behalf and then unwind it. Instead the first half explains the idea while you are
looking at the decks, and the second half fires on the first card of your first run, when
every element it points at is genuinely on screen. It covers the card,
the study panel, the deeper/lighter decision and the level gauge.

The spotlight is a ring with a very large spread shadow rather than a `clip-path` cut-out —
a hole cannot be transitioned smoothly and breaks on older WebViews, whereas a spread
shadow dims everything outside the box on any engine. The caption measures itself and the
target before choosing a side, so it never covers the thing it is pointing at.

Skipping, or finishing, sets a flag so it is never forced on you twice.

---

## Vocabulary

**1,081 words**, each with pinyin, an English gloss and a level from Core to Advanced.

It is not a general dictionary. Every entry was chosen by frequency over *this* corpus and
then glossed by hand, so a word you meet on a card is a word the app can also explain. It
doubles as the segmenter's dictionary — Chinese has no spaces, so the app splits each
sentence by longest match against these keys, which is why the multi-character entries
matter as much as the glosses: 还是 has to beat 还 + 是 or every A-or-B question breaks
into nonsense. Coverage is **84% of the 72,550 Chinese characters in the deck** and 83% of the model answers; the rest
falls back to bare characters rather than to a confident wrong gloss.

- **Under every card** — the question split into words, with pinyin and gloss, and a
  marker for the ones you have already met.
- **The Dashboard** — how much of the bank you have met, broken down by level.
- **Tap any word** to see the questions it actually appears in, with the word highlighted.
  This is the payoff for building the bank from the corpus instead of importing one.

A word counts as *met* once you have been through a question that uses it, so the list
fills up as a side effect of talking. `scripts/vocab-check.mjs` validates every entry's
pinyin against the readings the deck itself uses, and reports coverage.

---

## Sample answers — AREC

**AREC** is the IELTS speaking structure: **A**nswer, **R**eason, **E**xample,
**C**onclusion. Say the thing, say why, ground it in something that actually happened,
then close. It is taught because it fixes the two ways a fluent speaker still loses
marks — answering in three words, and talking without landing.

- **55 written model answers**, in both languages, on the highest-frequency questions
  across every category. The Chinese is a real answer to the same question rather than a
  translation of the English: same content, said the way it would be said in Chinese, at
  roughly HSK 3–4 so it is usable out loud.
- **Every other question gets the scaffold** — the same four moves with openers chosen to
  fit the grammar the question is built on. A "Would you rather" wants a choice named out
  loud; a "What would you do if" wants a conditional. All 101 of the deck's grammar frames
  are mapped onto one of six shapes.

### Every question gets a full answer

Hand-writing 4,228 individual two-minute bilingual answers is roughly 1.1 million English
words and 1.7 million Chinese characters — a book-length project several times over, and
about 10 MB of data. What is achievable, and nearly as useful for language practice, is a
full answer for every **kind** of question. So there are two tiers:

| tier | count | what it is |
| --- | --- | --- |
| **exact** | 55 | written for that one question |
| **topic** | 50 | written for a category and a question shape, covering the other 4,173 |

The 50 topic answers key on `(category, shape)` — *Food* × *yes/no*, *Politics* ×
*opinion* — with a per-category fallback for minority shapes. **Every one of the 4,228 questions now
resolves to a full-length answer**, and none of them show bare headings any more.

A topic answer is not about the exact question and the app says so in as many words. What
transfers is the length, the shape, the register and the vocabulary — which are the parts
you were meant to copy anyway. The content is yours.

### They are full length, on purpose

Every written answer runs about **two minutes spoken** — roughly 260 English words or 400
Chinese characters. Measured across all 105: exact answers 1:43-2:08 (median 1:58), topic
answers 1:36-2:00 (median 1:48). None under 90 seconds.

That is not padding, it is the specification: a Part 3 answer that lands is a two-minute
answer, and a four-line model teaches the shape while quietly teaching the wrong length.
The four parts are deliberately unequal —

| | share | what it does |
| --- | --- | --- |
| **A** | ~20s | a position and one qualification, no hedging |
| **R** | ~30s | one reason developed, rather than three listed |
| **E** | ~50s | one thing that actually happened, with specifics — the longest part |
| **C** | ~25s | what it adds up to, a step past the answer rather than a repeat |

The app shows the estimate per part and for the whole answer, derived from the text at
135 words or 220 characters a minute. It is not a precise measure and is not meant to be;
it is there so you can see whether you are looking at a ten-second reply or the thing an
examiner is actually waiting for.

Each part can be read aloud on its own, and the language you are practising leads.
of detail are what you copy, not the content.

---

## Themes

Twelve palettes, grouped in the picker by ground:

| Dark | Light |
| --- | --- |
| **Hazard** (default) · **Gruvbox** · **Ember** · **Discord** · **Blurple** · Terminal · Blueprint | **Gruvbox Light** · **Sky** · Cinnabar · Sounding · Daylight |

Both Gruvbox skins are the published ramps rather than an approximation — `bg0_h`
through `fg0` with the bright accents for the dark one, the cream grounds with the
faded accents for the light one, which is the only version of it that holds enough
contrast to read at 12px.

**Ember** is black and orange: a true `#000000` ground, one hot accent, and nothing
else competing for it. Its heat ramp is the most literal in the set — ash, through
rust and flame, to a pale yellow at the top — which is as close as the depth gauge
gets to meaning what it looks like.

**Discord** is the one theme that copies a product on purpose, because it is the window
most of this app's use happens beside. Getting it to read as Discord is not about the
blurple — it is about the order of the three greys. Discord puts its *darkest* tone on the
outside, a mid tone on the sidebar, and its *lightest* on the content you are reading:
`#1E1F22` page, `#2B2D31` rail, `#313338` panels. Most dark themes do the opposite, and a
theme that gets that stack backwards reads as "a dark theme that happens to be blue" no
matter how exact the accent is. It also drops the corner radius from 13px to 8px, which is
Discord's, and takes its status hues — `#23A559` green, `#EB459F` fuchsia, `#F0B232` yellow.

The sidebar needed a token of its own to do that. `--rail` is what the tabs and the rail
card paint with, and in **every other theme it is simply equal to `--surface`** — the split
exists for the one palette that needs it and costs the other eleven nothing.

**Blurple** used to be Discord's greys under a different name, which made the two
indistinguishable once the real thing existed. It has moved to an indigo-violet ground of
its own (`#161622`) with a brighter `#7A6BFF` accent, so the picker no longer offers the
same theme twice.

A theme is only a block of custom properties. `--h1`…`--h5` is the heat ramp the
depth gauge, the card spines and the histograms run on, so a new palette needs five
steps that read as *rising intensity* in that palette — not five nice colours.

**Follow the system** keeps a dark skin and a light skin and switches between them
with `prefers-color-scheme`. Picking a skin while it is on files that skin under the
half of the day it belongs to, so choosing Gruvbox at night and Gruvbox Light in the
morning sets the pair up without a second control. The theme is stamped onto
`<html>` before first paint by an inline script, so nothing flashes; on Android the
status bar follows the palette too.

---

## Reading it aloud

The deck is bilingual, so it can speak. `speechSynthesis` is used directly rather
than shipping audio — 4,228 recorded questions is a gigabyte, and every platform
this ships on either has a Mandarin voice or can install one. Off, 中文 only, or
both languages; three speeds, because slow is what you want when you are shadowing
tones; and an auto-speak switch that reads each new card as it lands. Where no
speech engine exists the button hides itself and the settings panel says how to
install a voice rather than failing silently.

---

## Sessions

- **Session goal** — Open, 10, 20 or 40. Nothing stops when you reach it; the bar
  fills, the recap says you got there, and the run keeps a clock either way.
- **Previous card** (`B`) walks back through the run. It is deliberately not an
  undo: the record already has that question and re-asking it would double-count,
  so it only changes what is on screen.
- **Recap** now reports time on the deck and the average per card alongside depth,
  topics and streak.

## Ad-hoc decks

Browse is already a query over the corpus, so its result is runnable: **Practice
these** turns whatever is on screen into a deck and starts a session on it. Saved
does the same for your bookmarks. A hand-made selection ignores your muted topics —
muting is a standing preference about the *shipped* decks, not an override of
something you just picked by hand — and the consent gate still applies to it in
full.

---

## Where the CSV goes

**Dashboard → Your data** has one line under the buttons saying where exports land.
Press **Choose a folder**, pick one, and every export is written straight into it — no
download, no browser save dialog. The choice is remembered.

### The project folder, mirrored to Drive

`4QIAN-DATABASE/` at the project root is the intended target. It is gitignored — exported
records are your data, not source.

That folder sits inside **OneDrive**, though, not Google Drive, so Windows syncs it to
OneDrive and nothing carries it across to Google. **Sync with the folder** is the bridge.
One press does three things:

1. writes this device's snapshot into the folder,
2. **mirrors the folder against the Drive folder in both directions** — anything here that
   is not there is uploaded, anything there that is not here is written down,
3. merges in every file it has not already taken.

So a CSV you drop into `4QIAN-DATABASE/` by hand is uploaded to Drive and folded into your
record on the next sync, and a file your phone posted straight to Drive appears in the local
folder. Both sides end up holding the same set of files.

Mirroring is by **filename**, and every name carries a timestamp to the second, so "the same
name" genuinely means "the same file" and neither side has to guess. Merging is idempotent,
so pressing sync twice moves nothing.

The one thing it cannot do is run while the app is closed. A web page cannot watch a folder;
the mirror happens when you press the button.

### If you would rather it were automatic

Point the folder picker at a Drive-mounted folder instead — on this machine that is

```
G:\My Drive\Language Practice\4QIAN-DATABASE
```

Google Drive for Desktop is already syncing that path in the background, with this app
closed, so writing a file there *is* the sync and steps 2 and 3 above stop being needed.
The trade is that the CSVs then live in Drive rather than beside the project.

A page cannot watch a folder, and re-implementing a sync client that is already
installed and running would only be a worse copy of it — so the app does not try.

The folder picker is the **File System Access API**: a page cannot reach into your disk on
its own, so you choose the folder once in a real file dialog and the browser hands back a
handle scoped to exactly that folder. It works in Chrome and Edge over https or localhost.
Firefox and Safari have not shipped it and fall back to the ordinary download; Android has
its own Documents path and does the same.

Browsers drop folder permission when they restart, and a page is not allowed to ask for it
back on its own. The panel notices and offers **Reconnect folder**, which is one click.

---

## Keeping the CSV in a Google Drive folder — from a phone

This is the path for **Android**, where there is no Drive-for-Desktop mount to write into.
On a laptop the folder above is simpler and needs no deployment at all — but both write into
the same Drive folder, so the two mechanisms compose: the phone posts through the script,
the laptop writes to the mounted folder, and each picks up the other'''s files.

Every sync writes a **new** file, stamped to the second:

```
4qian-record-2026-09-05-16-27-31.csv
```

Nothing is ever overwritten, so the folder is a history rather than a pair of latest-only
files, and two devices cannot collide unless they upload inside the same second.

**Sync with the folder** uploads a snapshot, then merges in every file this device has not
already taken — its own older snapshots included. That last part is what restores a device
that has been wiped or reinstalled: point a bare install at the folder, press sync, and the
whole record comes back.

Import merges rather than replaces and is idempotent, so syncing twice changes nothing and
two devices converge on the second round. Files are the transport; the merge already in
`track.js` is the meaning — nothing new had to learn how to combine two records.

Which files have been folded in is remembered by **file id**, so a folder holding a year of
snapshots is not re-downloaded on every sync. Files already merged are marked in the list.
Erasing your record clears that memory too, or the next sync would decline to bring back
the very files that would restore it.

One consequence worth knowing: **the folder grows by one file per sync.** They are small,
and each is a complete record, so old ones can be deleted freely — every file in the list
has a Delete button, and deleting a merged snapshot loses nothing that a newer one does not
already contain.

**Dashboard → Google Drive folder**: a URL, a shared secret, and a name for this device.
Optional throughout — with the URL blank, nothing leaves the device and Export CSV behaves
exactly as before.

### Why a script and not OAuth

This went the OAuth way first and the OAuth way is wrong for this app.

- **Google refuses OAuth inside an app webview** — `disallowed_useragent`. An OAuth build
  syncs on the laptop and not on the phone, and a sync that skips one of your two devices
  is not a sync. Getting around it needs a native sign-in plugin, which is a dependency
  this project does not have.
- **Without a security assessment you get the `drive.file` scope**, under which an app may
  only see files it created. An existing folder could be written to but never listed.
- It also needs a Cloud project, a client ID per origin and a consent screen.

An Apps Script web app collapses all of that into one HTTPS POST that behaves identically
in a browser, in the installed PWA and inside the Android WebView. The script runs as *you*,
so it simply has access to the folder — including the files you put there by hand — and the
app never holds a Google credential at all, only a URL and a secret you chose.

### Setup

**1.** Go to [script.google.com](https://script.google.com) → **New project**.

**2.** Delete what is there and paste all of `cloud/Code.gs`.

**3.** Set two lines at the top:

```js
var FOLDER_ID = '1Q-xyoz-O875_ltRhYxQMaF83AIy-lUtU';   // already your folder
var TOKEN     = 'change-me';                            // pick something long
```

**4.** *Optional but tidy:* **⚙ Project Settings → Show "appsscript.json"**, then paste
`cloud/appsscript.json` over it. It declares the Drive scope explicitly rather than leaving
it to inference.

**5.** **Deploy → New deployment → ⚙ → Web app**, with **Execute as: Me** and **Who has
access: Anyone**. "Anyone" is required — your phone hits this URL without being signed in to
Google — and access is controlled by the URL being unguessable plus your `TOKEN`. Nothing
else in your Drive is exposed; the script only ever opens the one folder, and even `get` and
`del` look their file up *inside* that folder rather than by raw id.

**6.** Authorise it. The unverified warning is expected: you wrote it five minutes ago.

**7.** Copy the `/exec` URL into the app with the same token, and name the device.

Repeat step 7 on each device, using the same URL and token. The device name is only a label
for you; the timestamp is what keeps files apart.

Visiting the `/exec` URL in a browser returns a small JSON health check naming the folder,
which is the quickest way to tell whether a deployment took.

**Use the /exec URL, never /dev.** The editor also shows a URL ending in `/dev` — that is
its own test deployment, and it only answers a browser signed in as the script owner. The
app is anonymous and cross-origin, so Google hands it a sign-in page instead, the browser
blocks the response for CORS, and all the page is told is `Failed to fetch` — no status, no
body, no cause. The app now recognises a `/dev` URL as you paste it and says so rather than
letting you find out that way.

### If you change the script

**Deploy → Manage deployments → ✏ → Version: New version → Deploy.** Do **not** use *New
deployment* for an update: it mints a second URL and leaves the app talking to the old one,
which looks exactly like nothing happening. That is the single most common way this breaks.

### Testing without deploying

```bash
node cloud/mock-server.mjs      # the real doPost, an in-memory folder, on :5199
```

It runs the actual `doPost` out of `Code.gs` with only `DriveApp` stubbed, so the client
round trip — upload, list, read back, merge, delete — is exercised for real. Point the panel
at `http://localhost:5199` with token `change-me`; plain `http` is accepted by the app only
for localhost.

---

## Words and Write, removed

Both tabs are gone, and with them the entire handwriting stack: `write.js`, the three
generated data files, the Arphic licence text, and the two build scripts and two checked-in
data inputs that produced them. That is about **3.7 MB** off the app, which drops from 5.7 MB
to 2.0 MB, and it takes the CC-CEDICT and Arphic attributions out of the About panel with
it, since nothing they covered ships any more.

The nav is six tabs: three-up in two rows on a phone, one row of six from 560px, six in the
rail above 900px. The shortcut map is <kbd>1</kbd>–<kbd>6</kbd>.

**The vocabulary itself stayed, deliberately.** The word bank is not a feature of the Words
tab; it is the segmenter the session card runs on, and three things that have nothing to do
with a browsing view depend on it:

- the **study panel** under every question — the sentence split into words with pinyin and
  gloss, which is a session feature that happened to share the tab's data
- the **word dialog** — tap any word to see the questions it actually appears in
- the **Dashboard's vocabulary panel** — how much of the bank you have met, by level

What went with the tab is what only the tab had: its search box, the level and met/not-met
filters, the paged list, and the two renderers behind them. `wordRow`, `showWord` and
`VOCAB` are shared, so they stayed where they were.

Say the word if you want the rest of the vocabulary gone too — that is a bigger cut, because
it takes the word breakdown out of the session card and a panel off the Dashboard, which is
why it was not assumed here.
---

## Chrome removed from a run

Three controls went, in order, for the same reason: each was permanent furniture around a
decision that is made once, or never.

**Send it** was four buttons above the card — Chinese, English, both, both with pinyin —
one tap each onto the clipboard. **Paste into your chat**, in Decks, was the same four
choices again as a default for the card's own copy button, with a live preview. Between
them they spent a panel and a row on a question you answer on your first day and then never
revisit. Both are gone and the format is fixed: **Chinese, then English**. The copy button
and `C` still work; there is simply nothing to configure.

**Whose turn to answer** went with them. It was built for two people sharing one screen,
which is not how this app is used — the questions are asked by whoever is holding it, every
time. Gone with it: the turn bar, the *Swap who answers each turn* toggle in Decks, the `T`
shortcut, and the `turn`/`turns` state the session carried through every card.

Decks is down to three panels, the run's sidebar to two, and there is one fewer thing to
read before the question.

---

## The session, on a wide screen

Stacked, a run read: goal bar, five-rung gauge, whose turn, send it — and only then the
question. About 390px of chrome above the thing you came for, while two thirds of a wide
window sat empty beside it. Two of those four have since gone entirely; the layout below is
what fixed the rest.

At 1100px it is now two columns. The left is **what you are doing**: the question, the study
panel, the controls. The right is **how the run is set up**, in a 300px sticky column that
stays put while a long study panel scrolls past it. Nothing is hidden and nothing moved
between tabs. The card comes out at the top of the page instead of 482px down it, and the
page is 1,291px tall instead of 1,474.

The card keeps its own measure inside that column — capped at 840px, because a question set
in a 1,100px line is a worse question. The width goes to the panels and the gauge, which can
use it.

The four setup blocks moved into **one wrapper**, `#runside`, rather than each being pushed
into place by a guessed offset. This layout has already been taught that lesson twice: an
offset that encodes another element's height goes stale the first time that element changes.

### A run that fits the window

Ten words in the study panel pushed the controls below the fold, so answering a question
meant scrolling down to say what you thought of it and back up for the next one. On a
1,920×950 window the page ran to 1,341px for content that had no business needing a
scrollbar at all.

The study panel is the only part of a run with an unbounded amount in it — a question has
one card and one set of controls, but it can have four words or fourteen, and the sample
answer is a thousand pixels of prose. So that is the part that scrolls. The run is pinned
to the viewport, the word list gets **its own scrollbar**, and the card, the depth controls,
the next-question button and the session actions are all on screen at once.

Three conditions guard it, and each earns its place:

- **Width ≥ 1100px**, the same breakpoint as the two-column layout. Below it a run is a
  single column and scrolling the page is right.
- **Height ≥ 760px.** On a short window there is nothing to gain by cramming: an ordinary
  page scroll beats a 90px slot with its own scrollbar inside it.
- **Only while the panel is open.** Collapsed, the page is short and does not scroll anyway,
  and stretching a closed panel to the full height would be a hole rather than a layout.
  `:has(#study-body:not(.hidden))` does that in the stylesheet, so no JavaScript has to
  remember to add a class.

`.wrap` now names its own vertical inset as `--wrap-y` next to where it applies it, so the
section subtracts what the page is actually inset by rather than a number copied out and
left to go stale.

The bug that took the longest was invisible in the numbers: the grid row came out at 375px
and the panel rendered at 588, straight over the controls beneath it. The section sets
`align-items: start` so its short rows do not stretch — which also means a grid item sizes
to its content and quietly overflows the row it was given. The study panel opts back in with
`align-self: stretch`; nothing else in the section wants to.

### The bug that made this not work at first

The grid was correct and had no effect. `show()` ended with

```js
$("#v-" + v).style.display = "flex";
```

and an inline style beats any stylesheet rule, so `display: grid` in the media query was
being overruled on every view change — the computed value stayed `flex` while
`grid-template-columns` sat there resolved and unused. The line was never needed: `.hidden`
is `display:none!important`, which wins while a view is hidden, and when it is not hidden the
stylesheet already gives every view its display. It is gone.

That is the third time in this app an inline style has quietly beaten a rule that looked
right — the `<section>` layouts were the first, the panel gaps the second.

---

## Settings, and the profile

A ninth view. Decks keeps the four panels you touch before a conversation — the deck list,
question of the day, who you are talking to, and what the copy button puts on your clipboard.
Everything that configures the app moved to **Settings**: theme, text size, what the card
shows, read-aloud, study aids, muted topics, session goal, which language you are practising,
install, about, your data, and the Google Drive folder. Thirteen panels, all collapsible.

The panels are **moved at boot, not duplicated**. `buildSettings()` relocates the real
elements, so every handler already bound to them comes along; a second copy of each control
would need every one of those wired again and kept in step forever. It runs before
`makeCollapsible()`, so fold keys are generated against the section the panel ends up in.

### The profile

Four fields, and each one changes what the app does. A profile that only remembers a name is
a form pretending to be a feature.

| Field | What it changes |
| --- | --- |
| **What you go by** | the turn bar says *Reeyan* instead of *You*, and the panel grows a one-glyph face |
| **A day's practice** | a per-day target, counted against what you actually did today |
| **How far the deck may go** | the hardest cap in the app |
| **Which language** | the existing setting, moved here rather than copied |

The ceiling is the one worth explaining. The app already asked for confirmation before
levels 4 and 5; the profile sits *above* that. `pool()` takes
`Math.min(depth, sensOK, ceiling)`, so nothing above your ceiling is ever drawn on any deck,
and trying to go deeper is refused by name — *"Your profile keeps the deck at Personal."* —
rather than silently doing nothing. Lowering it also bites on a run already open above it,
or the setting would be a promise the current session does not keep.

Proven on **Deep dive**, a deck that genuinely reaches sensitivity 5: with no limit the draw
reaches 5; set to *Personal*, sixty consecutive draws on the same deck top out at 3.

The face is not decoration. On a shared laptop it is the difference at a glance between
"this is my record" and "this is somebody's record".

---

## Two layouts, one set of markup

Below 900px the app is what it always was: a single column with the tabs across the top,
which is right on a phone and is where most of its use happens.

At 900px and above `.wrap` becomes a two-column grid. The masthead and the tabs move into a
sticky rail on the left and everything else takes the width back — main content goes from
560px to 1,107px at a 1440px window, and the tabs stop costing two rows of vertical space on
every screen, because a column beside the content costs none.

**There is still only one navigation.** It is the same `<nav>`, the same buttons and the
same handlers at both widths; only the grid area and the flex direction differ. Nothing to
keep in step with a second copy, and nothing to remember when a view is added. The rail
later grew a wrapper around that nav so a status card could share its sticky block — one
element, and the nav inside it is untouched.

The rail is laid out as two real grid rows — `mast` above `nav` — rather than as one area
with the nav pushed down by a hard-coded offset. The offset version worked and was a
measurement waiting to go stale the moment the masthead changed height.

### Seven tabs, and why they carry icons

Six destinations read fine as a list of words. Seven does not — past about half a dozen the
eye stops scanning the column and starts reading it, which is slower every single time. So
every tab now carries an inline SVG glyph: **book, panel grid, rising line, magnifier, open
book, bookmark, gear.** The glyph is what the eye lands on and the word is what confirms it,
so neither has to work alone.

The icons are inline `<svg>` rather than a font or sprite sheet. They inherit `currentColor`,
which means the pressed tab paints its icon and its label in the same ink automatically and
all twelve themes get them right without a single extra rule — and it keeps the app's one
real constraint intact: no build step, no asset to fetch, works from `file://`.

**Settings sits last, behind a gear.** It is the one tab you visit to change the app rather
than to use it, and the gear is the single most recognised glyph in software. Moving it also
put the shortcut map back in visual order — <kbd>1</kbd>–<kbd>7</kbd> now walk the tabs
top to bottom, which they did not while Settings was fourth.

The phone grid went from three columns to four, so seven tabs land as **4 + 3 in two rows**
rather than 3 + 3 + 1 in three; between 620px and the rail breakpoint they fit one row of
seven; above 900px they stack in the rail with the icon beside the label. Verified at each
of the three widths — no label truncates and nothing overflows sideways across 12 themes ×
8 views.

### Room between the panels

Density was costing legibility. Panels went from `14px` to `17px 18px` of padding, headings
from 10px to 13px of space beneath them, and the gap between sections from 14px to 18px on a
wide screen — where there is room to spend and no reason not to.

That last one needed something removed first: each `<section>` carried its column layout in
an **inline style**, which no media query can reach. The seven inline styles are gone and the
rule lives in the stylesheet, where the wide breakpoint can widen the gap and the phone
breakpoint can leave it alone.

Width is spent on more columns rather than wider boxes: three KPI tiles per row instead of
two, decks two-up, and the Insights charts drawing across 1,107px of main column instead of
560 — wide enough that none of them need to scroll inside their own box any more.

One thing deliberately does **not** get the width. `#v-session` is capped at 760px, because
reading and answering want a measure: a question set in a 1,100px line is a worse question.
The panels, tables and charts take the room; the card does not.

### What the rail carries besides tabs

Seven tabs in a column leave most of the rail empty, and the thing worth putting there is
the state you would otherwise open Settings to check. Under the tabs, at 900px and up:

| | |
| --- | --- |
| **Who** | the one-glyph face, your name, your ceiling and which language you are practising |
| **Today** | questions today — against your daily target, with a bar, if you set one |
| **Streak and coverage** | consecutive days, and how much of the 4,228 you have seen |
| **Export folder** | Downloads, the folder's name, or *needs reconnecting* |
| **Google Drive** | not connected, never synced, or the date of the last sync |

Nothing here is computed twice. It is read straight off `TRACK`, `FOLDER` and `DRIVE`, so
the card cannot drift out of step with the panels it summarises, and every renderer that
changes one of those repaints it. `show()` repaints it too — today's count is stale the
moment a run ends, and a view change is the cheapest honest moment to catch that.

The two connector rows are **three-state, not two**. A picked folder whose permission the
browser has since dropped is neither on nor off, and a Drive that is configured but has
never synced is not the same as one syncing nightly; an amber dot says so without a
sentence. Clicking any row goes to the panel that owns it and **unfolds it if it was
collapsed** — landing on a folded heading looks like the click did nothing.

It is rail-only. On a phone this is vertical space the app cannot spare, so it is not
rendered below 900px at all.

The rail is now one sticky block holding the nav and the card, rather than two grid rows
each sticking on their own. Two sticky elements in a column need the second to know the
height of the first, which is a hard-coded offset waiting to go stale — the same mistake
the masthead row already taught this layout once.

### Width, and where the measure is actually defended

The cap was 1240px, which on a maximised window left a third of the screen empty. It is now
**1800px**, and the defence moved to the one place that needs it — the question card keeps
its 760px — rather than sitting on everything. Tables, charts, decks and panels take the
rest of the room, which is what the room is for.

The tagline above them is a **single block, balanced**. Multi-column was tried first and is
wrong here: three sentences do not divide evenly, so at 1730px the last two words ended up
alone at the top of a second column beside a hole. A lead paragraph is read once, in order.
It gets `text-wrap: balance` instead — the same thing every heading in the app already
does — so the lines come out even at any width rather than a full line followed by an
orphan: 729 / 732px at 1440, 492 / 482 / 485px at 1000, one 1,464px line at 2560.

### Panels fold away

Every panel with a heading collapses when you click it, and what you folded is remembered.
The Dashboard is thirteen panels tall; shutting the ones you are not reading takes it from
**23,452px to 2,262px — about 90% of the scrolling gone.** Each long view also carries a
**Collapse all / Expand all** control next to its title.

The wiring is done in JavaScript at boot rather than in the markup. Thirty-five panels would
otherwise each need a wrapper, a toggle and an id written by hand, and every panel added
afterwards would need someone to remember; instead the DOM is walked once, so a new panel is
collapsible the moment it exists. Headings become real buttons with `aria-expanded` and
keyboard handling, not clickable text.

Two details that are easy to get wrong:

- **Keys survive a rename.** A panel's own id where it has one, otherwise the section plus
  the heading's text — because *People* is a heading on both the Dashboard and Insights, and
  a single key for the two of them would fold them together.
- **Charts are redrawn when a panel opens, not when it closes.** An SVG laid out inside a
  hidden panel measures zero and comes back the wrong size. Both renderers derive everything
  on the spot anyway, so redrawing costs nothing.

---

## Insights — the record as charts

The Dashboard is the summary you read top to bottom. **Insights** is the same record as
charts you can interrogate, reachable from the nav or from the link at the top of the
Dashboard.

One filter row — date range, person, deck — sits above everything and scopes every chart,
tile and table on the page, so no two panels can disagree about which slice they are
showing. Six charts under it:

| chart | form | why that form |
| --- | --- | --- |
| Questions per day | area with a snapping crosshair | change over time; the crosshair means you aim at a date, not at a 2px line |
| What you did with each card | donut | four parts of one whole, each labelled with its share |
| How deep you went | horizontal bars | magnitude across an ordered scale |
| Busiest topics | horizontal bars, top 8 + Other | magnitude across many categories |
| When you practise | heat grid, hour x weekday | two categorical axes, one magnitude |
| People | stacked horizontal bars | composition within each person |

Every mark carries a tooltip on hover **and on keyboard focus**, the trend chart walks day
by day with the arrow keys, and a **Table view** toggle writes every figure out as text.

The filter row is sticky, so changing a range does not mean scrolling back to the top of a
long page. Clicking a person in the People chart filters to them and clicking again clears
it — drilling in from the chart you are already reading beats a trip to the dropdown. The
dropdown itself carries each person’s question count, so you can tell who is worth looking
at without selecting them one at a time. **Export this slice** writes exactly what the
filters are showing, named for the slice, and the run numbers in it are walked across the
whole log rather than the subset — so a filtered export and a full one agree about which
session a row belongs to, and either can be imported on its own.

### Colour, and why it is the way it is

Two jobs, two treatments. Outcome and person are **identity**, so they take eight fixed
categorical slots in a stable order — the same outcome is the same hue in the donut and in
the stacked bars, and filtering a series out never repaints the survivors. Topic volume,
hour-of-day and depth are **magnitude**, so each takes a single hue stepped light to dark.
No rainbow, and no hue standing in for a number.

The categorical palette ships two steppings of the same eight hues, one for light grounds
and one for dark, chosen by the skin rather than by the OS: `paintSkin` stamps
`data-mode`, and the CSS swaps `--s1`..`--s8`. Both sets were validated against this app's
real surfaces for lightness band, chroma floor, adjacent-pair separation under
protanopia / deuteranopia / tritanopia, normal-vision separation, and contrast. Four slots
land under 3:1 on the light ground, which is exactly why every chart also carries direct
value labels and the page has a table view — identity is never left to colour alone.

One correction worth recording. Depth first used the app's own `--h1`..`--h5` heat ramp,
since the cards already use it for sensitivity. That was wrong: it encodes sensitivity as
an *identity*, is not monotonic in lightness, and opens on a desaturated grey-brown that a
20px bar cannot carry on a dark panel. Magnitude wants one hue stepped light to dark, so
depth now uses the accent at stepped opacity.

Below 560px the wide charts scroll inside their own box rather than shrinking — squeezed to
a phone, the topics chart was rendering nine rows into 128px, which is a picture of a chart
rather than a chart. The page itself never scrolls sideways.


### The filter row, and why it is a container query

Insights opens with three filters and three actions on one line, the actions pushed right by
`margin-left: auto`. That is correct while they fit and actively wrong the moment they do
not: the actions wrap to a second line and the auto margin — which is now the only thing on
that line — shoves them against the right edge, leaving a hole the width of the panel.

The fix is to drop the margin below the width that holds all six, so the actions become a
row of their own, flush with the fields above them. The question is *which* width, and the
answer is not the window's. The same panel is 613px inside a 946px window and 1,107px
inside a 1,440px one, because the rail sits between them — a viewport breakpoint would be
measuring the wrong box. So `.ins-filters` declares `container-type: inline-size` and the
rules query **its own width**: one line above 760px, two below it, and below 420px the two
dropdowns share a line while the range control keeps one to itself.

That last exception is worth stating. Four segments inside half a phone width puts every
label on two lines — *"30"* over *"days"* — and the control doubles in height to say the
same thing. The same problem in miniature explains `white-space: nowrap` on the compact
segments: a flex item's automatic minimum size is its **min-content**, which for *"30 days"*
is the word *days*, so the browser was free to wrap a label that had room not to. Held on
one line the control is 28px tall instead of 40px, and nothing is clipped at any width.
---

## The dashboard

The deck data carries a **frequency score from 0 to 100** on every question — how often a
question like it actually comes up in conversation. Nothing surfaced it before; it is now
the spine of the dashboard, and it is what makes this usable as a language-learning tool
rather than a bag of trivia.

- **Six KPIs** — questions asked, corpus covered, sessions, day streak, average depth,
  average frequency of what you ask.
- **Activity calendar** — 26 weeks of per-day counts, opened on the current week.
- **Your rhythm** — the last 14 days as a ribbon, 12 weeks of volume as a bar chart,
  and the hour of day you actually practise. The first two come from the per-day
  totals, which are never trimmed; the hour histogram can only come from the events,
  which are, so it is reported as recent rather than all-time.
- **How it goes** — the asked / warmer / cooler / skipped mix, median and longest
  time on a card, total time on the deck, and your skip rate.
- **High-frequency questions**, two ways:
  - *Most common* — the corpus ranked by score, filterable to what you have not asked yet,
    with your coverage of the 90–100 core band called out.
  - *Your most asked* — your own repeat questions, ranked, plus your busiest topics.
- **Frequency-band coverage** — how far through each band (90–100, 80–89, …) you are. The
  90–100 band is 402 questions and clearing it is the fastest useful win.
- **What you actually ask** — your distribution across the five stages and five
  sensitivity levels.
- **Topic coverage** — all 30 categories, ranked by how much of each you have covered.
- **Vocabulary** — how much of the word bank you have met, by level.
- **The record** — every question you have been through, newest first, searchable and
  filterable by outcome (asked / warmer / cooler / skipped). Tap any entry to ask it again.
- **Sessions** — each run with its deck, length, depth reached and topics touched.
- **Your data** — export the CSV, import one back, erase the record, and a running
  count of how much room the record is taking. `localStorage` is the one resource
  this app can run out of, and the failure mode — a silent quota error that drops
  half the events — is worth warning about before it happens.

### One file, readable and complete

There used to be two exports, a JSON backup and a CSV you could read. There is now
one, because the CSV can be both.

Fifteen columns, all of them meant to be read: `session`, `date`, `time`, `person`,
`question_id`, `category`, `english`, `chinese`, `outcome`, `level`, `sensitivity`,
`stage`, `frequency_score`, `deck`, `seconds`. Only `session` is there for the
machine — which run the event belonged to — because sessions are stored apart from
events and without it an import could only guess where one conversation ended and
the next began.

Importing rebuilds everything the dashboard needs — per-question counts, daily
totals, the people list, each person's seen list and the sessions — deriving them
rather than storing them, which is what keeps the file a plain table instead of a
serialisation format wearing a table's clothes. It **merges** through the same path
a JSON backup used, so importing the same file twice changes nothing and moving a
phone's record onto a laptop keeps both.

Four details that are easy to get wrong:

- The file starts with a **UTF-8 byte-order mark**. Without it Excel opens a `.csv`
  using the legacy Windows code page and renders 你 as `ä½ `. The file was always
  valid UTF-8; the reader needed telling.
- Fields are **all quoted and parsed properly**, because category names like
  *Alcohol, substances & risky habits* contain commas that a naive `split(",")`
  shreds.
- The time is written **`HH-MM-SS`, not `HH:MM:SS`**. A spreadsheet recognises the
  colon form as a time, converts it, and shows it back in the machine's locale;
  with dashes it stays text and reads the same everywhere. The date has no such
  escape — the file says `YYYY-MM-DD`, and a spreadsheet set to US format will
  still *display* it as `MM/DD/YYYY`.
- An empty person column would be ambiguous, so a run with nobody attached says
  **`Not Mentioned`**. It reads back as nobody, not as a person of that name.

Because the date and time are now the only record of when, the importer reads them
in whatever shape they come back: `YYYY-MM-DD`, `MM/DD/YYYY` or `DD/MM/YYYY`, with
`-`, `/` or `.`; times with `-`, `:` or `.`, with or without `am`/`pm`. Where the
order is genuinely ambiguous — `05/09/2026` — month-first wins, since that is what
the spreadsheets that rewrite the column produce; a day above 12 settles it either
way. It also sniffs the delimiter, so a file re-saved by an Excel that uses
semicolons still opens, matches columns by name so order does not matter and your
own extra columns are ignored, accepts a bare `140` as well as `Q0140`, and clamps a
hand-edited level into 1–5 rather than letting it fall off the dashboard's
histograms in silence.

Sessions come back a few seconds shorter than they were: their bounds are rebuilt
from the first and last card, which cannot know about the time spent before the
first question appeared. Everything else round-trips exactly.

Older exports still import. The first one had no `session` column and different
names for three others; a `timestamp` column, if present, is believed over the
date and time, since an epoch second cannot be reformatted by a spreadsheet.

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

Import **merges** rather than replaces — moving a phone backup onto a laptop that has its
own history keeps both.

---

## Building

```bash
npm install
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

## Keyboard

`?` opens the full list in the app; **Decks → Show me how it works** runs the tour. In a session: `←` `→` change depth, `space`
deals the next card at the same depth, `X` skips, `S` saves, `P` reads it aloud,
`C` copies, `R` reveals the other language, `B` steps back. Anywhere: `1`–`6` jump between the six tabs, `/` focuses the search, `esc`
returns to Decks.

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
