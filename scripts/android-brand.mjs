/* android-brand.mjs — put the app's own face on the Android project.
 *
 * Capacitor scaffolds a white Android robot. This replaces the launcher icons
 * and the splash with the deck's own mark, and repaints the theme colours so
 * the window that appears before the WebView paints is already the app's
 * black rather than a white flash.
 *
 * Re-runnable: everything it writes it writes from source each time.
 */
import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RES  = join(ROOT, "android", "app", "src", "main", "res");
const VOID = "#08080A";          // matches --void in styles.css
const ACC  = "#FFCE1F";

const SQUARE   = join(ROOT, "app", "icon-512.png");
const MASKABLE = join(ROOT, "app", "icon-maskable.png");

/* Legacy launcher icon is 48dp; the adaptive foreground is 108dp. Both are
   listed per density so no launcher has to upscale. */
const DENSITY = [["mdpi",1], ["hdpi",1.5], ["xhdpi",2], ["xxhdpi",3], ["xxxhdpi",4]];

const write = (p, buf) => { mkdirSync(dirname(p), {recursive:true}); writeFileSync(p, buf); };

async function icons(){
  for(const [d, scale] of DENSITY){
    const legacy = Math.round(48 * scale);
    const fg     = Math.round(108 * scale);

    // Legacy square + round: the launcher applies its own mask to these.
    const sq = await sharp(SQUARE).resize(legacy, legacy, {fit:"cover"}).png().toBuffer();
    write(join(RES, `mipmap-${d}`, "ic_launcher.png"), sq);
    write(join(RES, `mipmap-${d}`, "ic_launcher_round.png"), sq);

    /* Adaptive foreground: the maskable art already carries the safe-zone
       padding an adaptive icon needs, so it goes on at full canvas and the
       launcher's mask crops the dark surround, not the glyph. */
    const f = await sharp(MASKABLE).resize(fg, fg, {fit:"cover"}).png().toBuffer();
    write(join(RES, `mipmap-${d}`, "ic_launcher_foreground.png"), f);
  }
  console.log("  icons: 5 densities x 3 files");
}

/* The splash is a flat field of the app's background with the mark centred.
   Sized per density and per orientation, matching the files Capacitor made. */
async function splash(){
  const mark = await sharp(MASKABLE).resize(480, 480).png().toBuffer();
  const sizes = [["mdpi",320,480], ["hdpi",480,800], ["xhdpi",720,1280],
                 ["xxhdpi",960,1600], ["xxxhdpi",1280,1920]];

  async function make(w, h){
    const side = Math.round(Math.min(w, h) * 0.34);
    const m = await sharp(mark).resize(side, side).toBuffer();
    return sharp({create:{width:w, height:h, channels:4,
                          background:{r:0x08, g:0x08, b:0x0A, alpha:1}}})
      .composite([{input:m, gravity:"center"}]).png().toBuffer();
  }

  for(const [d, w, h] of sizes){
    write(join(RES, `drawable-port-${d}`, "splash.png"), await make(w, h));
    write(join(RES, `drawable-land-${d}`, "splash.png"), await make(h, w));
  }
  write(join(RES, "drawable", "splash.png"), await make(480, 800));
  console.log("  splash: 5 densities x 2 orientations");
}

function colours(){
  write(join(RES, "values", "ic_launcher_background.xml"),
`<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${VOID}</color>
</resources>
`);

  /* colorPrimaryDark is the status bar behind the WebView, and the window
     background is what shows for the instant before the page paints. Both
     have to be the app's black or the launch flashes white. */
  write(join(RES, "values", "colors.xml"),
`<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="colorPrimary">${VOID}</color>
    <color name="colorPrimaryDark">${VOID}</color>
    <color name="colorAccent">${ACC}</color>
    <color name="splashBackground">${VOID}</color>
</resources>
`);

  write(join(RES, "values", "styles.xml"),
`<?xml version="1.0" encoding="utf-8"?>
<resources>

    <style name="AppTheme" parent="Theme.AppCompat.DayNight.DarkActionBar">
        <item name="colorPrimary">@color/colorPrimary</item>
        <item name="colorPrimaryDark">@color/colorPrimaryDark</item>
        <item name="colorAccent">@color/colorAccent</item>
    </style>

    <style name="AppTheme.NoActionBar" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="windowActionBar">false</item>
        <item name="windowNoTitle">true</item>
        <item name="android:background">@color/splashBackground</item>
        <item name="android:statusBarColor">@color/colorPrimaryDark</item>
        <item name="android:navigationBarColor">@color/colorPrimaryDark</item>
    </style>

    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="android:background">@drawable/splash</item>
        <item name="android:statusBarColor">@color/colorPrimaryDark</item>
        <item name="android:navigationBarColor">@color/colorPrimaryDark</item>
    </style>
</resources>
`);
  console.log("  colours: launcher background, theme, splash");
}

if(!existsSync(RES)) throw new Error("No android/ project yet — run `npx cap add android` first.");
console.log("branding android project");
await icons();
await splash();
colours();
console.log("done");
