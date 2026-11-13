// Sandboxed preload: remote pages receive no privileged bridge.
const { ipcRenderer } = require("electron");
setInterval(() => {
  if (location.origin !== "https://chzzk.naver.com") return;
  const match = location.pathname.match(/^\/(live|video)\/([a-f0-9]+)\/?$/i);
  if (!match) return;
  const video = [...document.querySelectorAll("video")].find(
    (v) => !v.paused && !v.ended && v.readyState >= 3,
  );
  if (!video) {
    ipcRenderer.send("watch-sample", { playing: false });
    return;
  }
  // Advertising indicators are best-effort; CHZZK may change its player markup.
  const ad = !!document.querySelector(
    '[class*="ad_skip"], [class*="adSkip"], [class*="ad_count"]',
  );
  ipcRenderer.send("watch-sample", {
    kind: match[1],
    id: match[2],
    playing: !ad,
    position: video.currentTime,
    rate: video.playbackRate,
  });
}, 5000);
