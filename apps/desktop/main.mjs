import {
  app,
  BrowserWindow,
  ipcMain,
  session,
  dialog,
  shell,
  Menu,
} from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { Store } from "./store.mjs";
import { purgeStreamerText } from "../../packages/core/retention.mjs";
import { ChzzkApi, API } from "../../packages/core/api.mjs";
import { Collector } from "../../packages/core/collector.mjs";
import { StreamerCollector } from "../../packages/core/streamer.mjs";
import { exportStreamerHtml } from "../../packages/core/report-export.mjs";
import {
  CHANNEL_ID,
  csv,
  safeWatchInterval,
  channel,
} from "../../packages/core/core.mjs";
const dir = path.dirname(fileURLToPath(import.meta.url));
const testMode = process.argv.includes("--self-test");
if (testMode)
  app.setPath(
    "userData",
    path.join(app.getPath("temp"), "my-viewing-log-test-" + process.pid),
  );
let mainWindow,
  webWindow,
  loginSession,
  store,
  api,
  collector,
  streamerCollector,
  latestProgress = null,
  watchPrevious = null;
const isRunning = () => !!(collector?.running || streamerCollector?.running);
let verified = { id: null, at: 0 };
let shuttingDown = false;
const metadata = new Map();
function validNav(value) {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      (u.hostname === "naver.com" || u.hostname.endsWith(".naver.com"))
    );
  } catch {
    return false;
  }
}
function push(data) {
  latestProgress = data;
  if (mainWindow && !mainWindow.isDestroyed())
    mainWindow.webContents.send("progress", data);
}
function getState() {
  return {
    account: store.account,
    tracking: store.data.tracking,
    running: isRunning(),
    progress: latestProgress,
    dataPath: store.directory,
    audit: (store.data.audit ?? []).slice(-100),
    version: app.getVersion(),
    runtime: "desktop",
    verified:
      verified.id === store.data.activeId && Date.now() - verified.at < 60000,
  };
}
function openBrowser(url = "https://chzzk.naver.com/") {
  if (webWindow && !webWindow.isDestroyed()) {
    webWindow.loadURL(url);
    webWindow.show();
    return;
  }
  webWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    title: "치지직 · 내 시청 기록",
    autoHideMenuBar: true,
    icon: path.join(dir, "../../packages/assets/icon.png"),
    webPreferences: {
      session: loginSession,
      preload: path.join(dir, "watch-preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: false,
    },
  });
  webWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (validNav(url))
      setImmediate(() => {
        if (webWindow && !webWindow.isDestroyed()) webWindow.loadURL(url);
      });
    return { action: "deny" };
  });
  webWindow.webContents.on("will-navigate", (event, url) => {
    if (!validNav(url)) event.preventDefault();
  });
  webWindow.webContents.on("will-redirect", (event, url) => {
    if (!validNav(url)) event.preventDefault();
  });
  webWindow.on("closed", () => {
    webWindow = null;
    watchPrevious = null;
  });
  webWindow.loadURL(url);
}
async function verify() {
  const me = await api.me();
  if (isRunning() && me.id !== store.data.activeId) {
    collector.stop();
    streamerCollector.stop();
    throw new Error(
      "수집 중 계정이 변경되었습니다. 수집 종료 후 다시 확인해 주세요.",
    );
  }
  store.activate(me);
  verified = { id: me.id, at: Date.now() };
  watchPrevious = null;
  return getState();
}
async function watchSample(event, sample) {
  if (
    !webWindow ||
    event.sender !== webWindow.webContents ||
    event.senderFrame !== webWindow.webContents.mainFrame
  )
    return;
  if (!store.data.tracking || !store.account || isRunning()) {
    watchPrevious = null;
    return;
  }
  const url = new URL(webWindow.webContents.getURL());
  if (url.origin !== "https://chzzk.naver.com") return;
  if (!sample?.playing) {
    watchPrevious = null;
    return;
  }
  const route = url.pathname.match(/^\/(live|video)\/([a-f0-9]+)\/?$/i);
  if (!route || route[1] !== sample.kind || route[2] !== sample.id) return;
  if (
    (sample.kind === "live" && !CHANNEL_ID.test(sample.id)) ||
    (sample.kind === "video" && !/^\d+$/.test(sample.id))
  )
    return;
  if (!Number.isFinite(sample.position) || !Number.isFinite(sample.rate))
    return;
  const id = store.data.activeId;
  if (verified.id !== id || Date.now() - verified.at > 30000) {
    const me = await api.me();
    if (me.id !== id) {
      store.data.tracking = false;
      store.save();
      verified = { id: null, at: 0 };
      watchPrevious = null;
      push({
        running: false,
        message:
          "계정이 바뀌어 재생시간 기록을 중지했습니다. 계정 확인을 눌러 주세요.",
      });
      return;
    }
    verified = { id, at: Date.now() };
  }
  const key = sample.kind + ":" + sample.id;
  let room = metadata.get(key);
  if (!room) {
    if (sample.kind === "live") {
      const known = [...store.account.follows, ...store.account.power].find(
        (c) => c.id === sample.id,
      );
      room =
        known ??
        channel(await api.get(API + "/service/v1/channels/" + sample.id));
    } else
      room = channel(await api.get(API + "/service/v3/videos/" + sample.id));
    if (!CHANNEL_ID.test(room.id)) return;
    metadata.set(key, room);
  }
  if (store.data.activeId !== id || !store.data.tracking || isRunning()) {
    watchPrevious = null;
    return;
  }
  const now = Date.now(),
    tick = performance.now(),
    current = { ...sample, key, tick };
  const duration = safeWatchInterval(
    watchPrevious,
    current,
    tick - (watchPrevious?.tick ?? tick),
  );
  watchPrevious = current;
  if (duration)
    store.addWatch(id, {
      channelId: room.id,
      channelName: room.name,
      kind: sample.kind,
      start: now - duration,
      end: now,
    });
}
let sampling = false;
ipcMain.on("watch-sample", (event, sample) => {
  if (sampling) return;
  sampling = true;
  watchSample(event, sample)
    .catch(() => {
      watchPrevious = null;
      verified = { id: null, at: 0 };
    })
    .finally(() => {
      sampling = false;
    });
});
ipcMain.handle("app-command", async (event, name, payload) => {
  if (
    event.sender !== mainWindow?.webContents ||
    event.senderFrame !== mainWindow.webContents.mainFrame ||
    event.senderFrame.url !==
      pathToFileURL(path.join(dir, "../../packages/ui/index.html")).href
  )
    throw new Error("허용되지 않은 호출");
  switch (name) {
    case "state":
      return getState();
    case "openRepository":
      await shell.openExternal("https://github.com/yeyebee/chzzk-local");
      return true;
    case "openLogin":
      openBrowser();
      return true;
    case "openStudio":
      openBrowser("https://studio.chzzk.naver.com/");
      return true;
    case "verify":
      return verify();
    case "collect": {
      if (!payload || typeof payload !== "object")
        throw new Error("조회 설정 오류");
      if (isRunning()) throw new Error("이미 수집 중입니다.");
      collector
        .start(payload)
        .catch((error) => push({ running: false, message: error.message }));
      return true;
    }
    case "collectStreamer": {
      if (!payload || typeof payload !== "object")
        throw new Error("조회 설정 오류");
      if (isRunning())
        throw new Error(
          "시청자 또는 스트리머 수집이 실행 중입니다. 종료 후 시작해 주세요.",
        );
      streamerCollector
        .start(payload)
        .catch((error) =>
          push({ running: false, mode: "streamer", message: error.message }),
        );
      return true;
    }
    case "stop":
      collector.stop();
      streamerCollector.stop();
      return true;
    case "purgeStreamerRaw": {
      if (isRunning()) throw new Error("수집을 중지한 뒤 원문을 삭제하세요.");
      const account = store.account;
      if (!account?.streamer) throw new Error("스트리머 기록이 없습니다.");
      const answer = await dialog.showMessageBox(mainWindow, {
        type: "warning",
        buttons: ["취소", "원문 삭제"],
        defaultId: 0,
        cancelId: 0,
        message:
          "이 계정의 보관한 스트리머 채팅 원문·예시·후원 문장을 삭제할까요?",
        detail:
          "집계는 남으며 이후 수집의 보관 방식은 유지됩니다. 내보낸 파일은 별도로 남습니다.",
      });
      if (answer.response !== 1) return false;
      if (isRunning() || store.account !== account)
        throw new Error("계정 또는 수집 상태가 바뀌었습니다. 다시 시도하세요.");
      purgeStreamerText(account.streamer);
      store.save();
      return getState();
    }
    case "exportStreamer": {
      if (!store.account?.streamer)
        throw new Error("스트리머 기록이 없습니다.");
      const data = store.account.streamer;
      const result = await dialog.showSaveDialog(mainWindow, {
        title: "로컬 스트리머 리포트 저장",
        defaultPath: "streamer-report.html",
        filters: [{ name: "HTML", extensions: ["html"] }],
      });
      if (result.canceled) return false;
      fs.writeFileSync(
        result.filePath,
        exportStreamerHtml(data, {
          names: payload?.names === true,
          money: payload?.money === true,
        }),
        "utf8",
      );
      return true;
    }
    case "tracking": {
      if (payload === true) await verify();
      store.data.tracking = payload === true;
      watchPrevious = null;
      store.save();
      return getState();
    }
    case "openChannel": {
      if (!CHANNEL_ID.test(String(payload)))
        throw new Error("채널 ID 형식 오류");
      openBrowser("https://chzzk.naver.com/live/" + payload);
      return true;
    }
    case "openReplay": {
      if (!/^\d+$/.test(String(payload?.videoNo)))
        throw new Error("다시보기 번호 형식 오류");
      const seconds = Math.max(
        0,
        Math.floor(Number(payload.offsetMs || 0) / 1000),
      );
      if (!Number.isFinite(seconds)) throw new Error("재생 위치 형식 오류");
      openBrowser(
        `https://chzzk.naver.com/video/${payload.videoNo}?t=${seconds}`,
      );
      return true;
    }
    case "exportJson":
    case "exportCsv": {
      if (!store.account) throw new Error("내보낼 기록이 없습니다.");
      const account = store.account;
      const isCsv = name === "exportCsv";
      const result = await dialog.showSaveDialog(mainWindow, {
        title: "내 기록 내보내기",
        defaultPath: `my-viewing-log-${new Date().toISOString().slice(0, 10)}.${isCsv ? "csv" : "json"}`,
        filters: [
          {
            name: isCsv ? "CSV" : "JSON",
            extensions: [isCsv ? "csv" : "json"],
          },
        ],
      });
      if (result.canceled) return false;
      const data = isCsv
        ? csv([
            ["채널", "시각(KST)", "메시지", "다시보기", "출처"],
            ...account.chats.map((c) => [
              c.channelName,
              new Date(c.time).toLocaleString("sv-SE", {
                timeZone: "Asia/Seoul",
              }),
              c.text,
              c.videoNo ?? "",
              c.source,
            ]),
          ])
        : JSON.stringify(
            {
              format: "my-viewing-log",
              version: 1,
              exportedAt: Date.now(),
              account,
            },
            null,
            2,
          );
      fs.writeFileSync(result.filePath, data, "utf8");
      return true;
    }
    case "openData":
      await shell.openPath(store.directory);
      return true;
    case "logout": {
      if (isRunning()) throw new Error("수집을 중지한 뒤 로그아웃해 주세요.");
      webWindow?.close();
      await loginSession.clearStorageData();
      await loginSession.clearCache();
      await loginSession.closeAllConnections();
      verified = { id: null, at: 0 };
      store.data.tracking = false;
      watchPrevious = null;
      store.save();
      return getState();
    }
    case "erase": {
      if (isRunning()) throw new Error("수집을 중지한 뒤 삭제해 주세요.");
      const answer = await dialog.showMessageBox(mainWindow, {
        type: "warning",
        buttons: ["취소", "모두 삭제"],
        defaultId: 0,
        cancelId: 0,
        message:
          "이 프로그램에 저장한 모든 계정의 기록과 로그인 세션을 삭제할까요?",
        detail: "직접 내보낸 JSON/CSV 파일은 별도로 남습니다.",
      });
      if (answer.response !== 1) return false;
      webWindow?.close();
      await loginSession.clearStorageData();
      await loginSession.clearCache();
      await loginSession.closeAllConnections();
      store.clear();
      verified = { id: null, at: 0 };
      watchPrevious = null;
      metadata.clear();
      latestProgress = null;
      return getState();
    }
    default:
      throw new Error("알 수 없는 명령");
  }
});
if (!testMode && !app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
  app
    .whenReady()
    .then(() => {
      Menu.setApplicationMenu(null);
      store = new Store(path.join(app.getPath("userData"), "data"));
      loginSession = session.fromPartition("persist:chzzk");
      loginSession.setPermissionRequestHandler(
        (_contents, _permission, callback) => callback(false),
      );
      loginSession.setPermissionCheckHandler(() => false);
      loginSession.on("will-download", (event) => event.preventDefault());
      loginSession.setUserAgent(
        loginSession
          .getUserAgent()
          .replace(/\s(?:Electron|my-viewing-log|MyViewingLog)\/[^ ]+/g, ""),
      );
      api = new ChzzkApi((...args) => loginSession.fetch(...args), {
        audit: (entry) => {
          store.data.audit ??= [];
          store.data.audit.push(entry);
          store.data.audit = store.data.audit.slice(-500);
        },
      });
      collector = new Collector(api, store, push);
      streamerCollector = new StreamerCollector(api, store, push);
      mainWindow = new BrowserWindow({
        width: 1350,
        height: 920,
        minWidth: 1020,
        minHeight: 720,
        title: "내 시청 기록",
        backgroundColor: "#101616",
        show: false,
        icon: path.join(dir, "../../packages/assets/icon.png"),
        webPreferences: {
          preload: path.join(dir, "preload.cjs"),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
        },
      });
      mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      mainWindow.webContents.on("will-navigate", (event) =>
        event.preventDefault(),
      );
      mainWindow.webContents.session.webRequest.onBeforeRequest(
        { urls: ["http://*/*", "https://*/*"] },
        (_details, callback) => callback({ cancel: true }),
      );
      mainWindow.loadFile(path.join(dir, "../../packages/ui/index.html"));
      mainWindow.once("ready-to-show", () => mainWindow.show());
      mainWindow.on("close", async (event) => {
        if (shuttingDown) return;
        if (isRunning()) {
          event.preventDefault();
          const result = await dialog.showMessageBox(mainWindow, {
            type: "question",
            buttons: ["계속 수집", "수집 중지 후 닫기"],
            defaultId: 0,
            cancelId: 0,
            message: "수집을 중지하고 프로그램을 닫을까요?",
            detail:
              "저장된 다시보기 위치에서 다음에 이어서 조회할 수 있습니다.",
          });
          if (result.response !== 1) return;
          collector.stop();
          streamerCollector.stop();
          const timer = setInterval(() => {
            if (!isRunning()) {
              clearInterval(timer);
              shuttingDown = true;
              app.quit();
            }
          }, 100);
        } else {
          shuttingDown = true;
          app.quit();
        }
      });
    })
    .catch((error) => {
      dialog.showErrorBox("프로그램을 시작할 수 없습니다", error.message);
      app.quit();
    });
}
app.on("window-all-closed", () => app.quit());
