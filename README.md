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
  index.html        markup for all six views, six dialogs and the tour overlay
  styles.css        one committed dark design plus ten alternate skins
  questions.js      the deck: 4,228 rows + decks, categories, frames (1 MB, generated)
  vocab.js          the word bank: 1,081 hand-glossed words, also the segmenter's dictionary
  answers.js        AREC answers: 55 exact + 50 topic-level, covering all 4,228
  track.js          the record: events, counts, per-day totals, and who each was with
  core.js           setup, themes, speech, the session loop, vocabulary, the tour, browse, saved
  dashboard.js      aggregation, charts, the record log, export/import
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

The other person cannot see your screen, so the most-used control is "give me this in a
form I can paste". Under every card:

| | what lands on the clipboard |
| --- | --- |
| **中文** | the Chinese alone — for a native speaker, who does not want pinyin under their own language |
| **English** | the English alone |
| **Both** | Chinese then English |
| **+ pinyin** | Chinese, pinyin, English — the version for you |

The copy button on the card itself uses whichever of those you set as your default, so the
one-tap path and the four-button path agree.

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

**Blurple** takes Discord's dark greys and its indigo; **Sky** takes the white-and-blue of a
language-exchange app. Neither copies a product's palette — they are the same
neighbourhood, so the sidecar reads as a companion to the window beside it rather than as a
different application. Nine other palettes are unchanged.

---

## Making it explain itself

Most of what was confusing about this app was not the ideas — it was the labels.

### Whose turn it is

There used to be a single line reading **You answer first**, which failed twice over. It
looked like a status line rather than a control, so nobody pressed it. And with two people
sharing one screen, *you* does not identify anybody — both readers are "you".

It is now a two-option control with the two players' names on it, under the question
**Whose turn to answer?** You can type the names in on the Decks screen; leave them blank
and it says You and Them. Tapping a name selects that person rather than blindly flipping,
which is what a control showing two names should do. The automatic swap-every-question
behaviour is unchanged and now lives next to the names, described as what it is.

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
every element it points at is genuinely on screen. It covers the card, whose turn it is,
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
- **The Words tab** — the whole bank, searchable in Chinese, pinyin or English, filterable
  by level and by whether you have met it, with per-level progress.
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

Eleven palettes, grouped in the picker by ground:

| Dark | Light |
| --- | --- |
| **Hazard** (default) · **Gruvbox** · **Ember** · **Blurple** · Terminal · Blueprint | **Gruvbox Light** · **Sky** · Cinnabar · Sounding · Daylight |

Both Gruvbox skins are the published ramps rather than an approximation — `bg0_h`
through `fg0` with the bright accents for the dark one, the cream grounds with the
faded accents for the light one, which is the only version of it that holds enough
contrast to read at 12px.

**Ember** is black and orange: a true `#000000` ground, one hot accent, and nothing
else competing for it. Its heat ramp is the most literal in the set — ash, through
rust and flame, to a pale yellow at the top — which is as close as the depth gauge
gets to meaning what it looks like.

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
- **Your data** — export to JSON or CSV, import a backup, erase the record, and a
  running count of how much room the record is taking. `localStorage` is the one
  resource this app can run out of, and the failure mode — a silent quota error
  that drops half the events — is worth warning about before it happens.

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
`C` copies, `R` reveals the other language, `T` swaps who answers first, `B` steps
back. Anywhere: `1`–`5` jump between the five views, `/` focuses the search, `esc`
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
