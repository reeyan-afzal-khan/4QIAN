/* make-icons.mjs — draw the app mark and write every icon the app ships.
 *
 * The mark is 4千 — the name, half in digits and half in Chinese, which is
 * what the app is: a bilingual thing that had to be spelled two ways. It
 * replaces 你, which said "you" but did not say which app.
 *
 * Rendered from an SVG rather than kept as a binary, so the mark, the colours
 * and the safe-zone padding are all editable text and the three PNGs can
 * never drift apart. sharp rasterises the SVG; the Chinese glyph comes from
 * whatever CJK face the machine has, which is why the font stack is long and
 * the output is checked rather than assumed.
 *
 *   node scripts/make-icons.mjs            write app/icon-*.png
 *   node scripts/make-icons.mjs --check     render once and report, write nothing
 */
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const VOID = "#08080A";          // --void in styles.css
const ACC  = "#FFCE1F";          // --acc

/* A long stack because this runs on whatever machine builds the release, and
   a missing CJK face renders 千 as a blank box rather than failing loudly. */
const CJK = "'Noto Serif SC','Source Han Serif SC','Songti SC','SimSun'," +
            "'Microsoft YaHei','PingFang SC','Noto Sans CJK SC','Hiragino Sans GB',serif";

/* pad is the fraction of the canvas left empty around the mark. A maskable
   icon has to survive a circular crop, so it gets much more. */
function markSVG(size, {pad = 0.14, radius = 0.19, bg = VOID} = {}){
  const inner = size * (1 - pad * 2);
  const fs = inner * 0.62;
  const y = size / 2 + fs * 0.36;       // optical centre, not the baseline
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"
     viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${bg === VOID ? size * radius : 0}" fill="${bg}"/>
  <text x="${size / 2}" y="${y}" fill="${ACC}" font-family="${CJK}"
        font-size="${fs}" font-weight="700" letter-spacing="${-fs * 0.03}"
        text-anchor="middle">4千</text>
</svg>`;
}

const TARGETS = [
  // The web icons are the app's own square: rounded corners, modest padding.
  ["app/icon-192.png", 192, {pad: 0.13}],
  ["app/icon-512.png", 512, {pad: 0.13}],
  /* Maskable art is cropped to whatever shape the launcher wants, so the mark
     sits inside the 80% safe zone and the ground runs to every edge square. */
  ["app/icon-maskable.png", 512, {pad: 0.24, radius: 0}],
];

const check = process.argv.includes("--check");

for(const [path, size, opts] of TARGETS){
  const svg = markSVG(size, opts);
  const png = await sharp(Buffer.from(svg)).png().toBuffer();

  /* Verify the glyph actually rendered. A missing CJK font gives either a
     blank field or a row of tofu boxes; both show up as the accent covering
     far too little or far too much of the canvas. */
  const {data, info} = await sharp(png).raw().toBuffer({resolveWithObject: true});
  let accent = 0, total = info.width * info.height;
  for(let i = 0; i < data.length; i += info.channels){
    // anything closer to the accent than to the ground
    if(data[i] > 128 && data[i+1] > 100) accent++;
  }
  const share = accent / total;
  /* 千 is three strokes, so it covers far less canvas than a dense glyph
     would. The band is wide enough for that and still catches the two
     failures worth catching: nothing drawn, and a field of tofu boxes. */
  const ok = share > 0.02 && share < 0.35;
  console.log(`${path}  ${size}x${size}  mark covers ${(share*100).toFixed(1)}% ` +
              (ok ? "ok" : "!! SUSPECT — is a CJK font installed?"));
  if(!check) writeFileSync(path, png);
}
console.log(check ? "\n(--check: nothing written)" : "\nwritten");
