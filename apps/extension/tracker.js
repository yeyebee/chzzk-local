// Isolated content script. Only playback measurements are sent.
const send = (sample) =>
  chrome.runtime.sendMessage({ kind: "watch-sample", sample }).catch(() => {});
setInterval(() => {
  if (location.origin !== "https://chzzk.naver.com") return;
  const match = location.pathname.match(/^\/(live|video)\/([a-f0-9]+)\/?$/i);
  if (!match) return;
  const video = [...document.querySelectorAll("video")].find(
    (v) => !v.paused && !v.ended && v.readyState >= 3,
  );
  if (!video) {
    send({ playing: false });
    return;
  }
  // Advertising indicators are best-effort; CHZZK may change its player markup.
  const ad = !!document.querySelector(
    '[class*="ad_skip"], [class*="adSkip"], [class*="ad_count"]',
  );
  send({
    kind: match[1],
    id: match[2],
    playing: !ad,
    position: video.currentTime,
    rate: video.playbackRate,
  });
}, 5000);
