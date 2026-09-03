/* native.js — the bits that only exist inside a native shell.
 *
 * Loaded in every build and does nothing in a browser: the page is the same
 * page everywhere, and the shells only add to it. Kept out of boot.js so the
 * web build is not carrying dead conditionals through its hot path. */
(function(){

  /* ---------------- Android (Capacitor) ---------------- */
  const cap = window.Capacitor;
  if(cap && cap.Plugins){
    const P = cap.Plugins;

    /* Back must walk the app's own history first. Without this the system
       gesture closes the app mid-session, which loses nothing on disk but
       feels like a crash. */
    if(P.App && P.App.addListener){
      P.App.addListener("backButton", () => {
        const handled = window.cdgBack && window.cdgBack();
        if(!handled) P.App.exitApp();
      });
      // Leaving the app for another one should bank the record right away.
      P.App.addListener("appStateChange", ({isActive}) => {
        if(!isActive && window.TRACK) window.TRACK.flush();
      });
    }

    /* The page paints its own background under the status bar, so the bar
       needs light content and no reserved strip. */
    if(P.StatusBar && P.StatusBar.setStyle){
      P.StatusBar.setStyle({style: "DARK"}).catch(()=>{});
      P.StatusBar.setBackgroundColor({color: "#08080A"}).catch(()=>{});
    }
  }

  /* ---------------- Windows (Electron) ---------------- */
  if(window.cdgDesktop && window.cdgDesktop.onMenu){
    window.cdgDesktop.onMenu(which => {
      if(which === "export"){
        if(typeof show === "function") show("dash");
        const b = document.getElementById("b-exp-json");
        if(b) b.click();
      }
    });
  }
})();
