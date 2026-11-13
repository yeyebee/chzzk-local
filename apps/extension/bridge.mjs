import { BrowserStore } from "./browser-store.mjs";
import {
  setStreamerMode,
  streamerEnabled,
} from "../../packages/core/preferences.mjs";
import { purgeStreamerText } from "../../packages/core/retention.mjs";
import { ChzzkApi, API } from "../../packages/core/api.mjs";
import { Collector } from "../../packages/core/collector.mjs";
import { StreamerCollector } from "../../packages/core/streamer.mjs";
import {
  CHANNEL_ID,
  csv,
  safeWatchInterval,
  channel,
} from "../../packages/core/core.mjs";
import { exportStreamerHtml } from "../../packages/core/report-export.mjs";
export async function initialize() {
  const store = await BrowserStore.open(),
    listeners = new Set(),
    previous = new Map(),
    metadata = new Map();
  let latest = null,
    verified = { id: null, at: 0 },
    sampling = new Set();
  const api = new ChzzkApi((...args) => fetch(...args), {
    audit: (entry) => {
      store.data.audit ??= [];
      store.data.audit.push(entry);
      store.data.audit = store.data.audit.slice(-500);
    },
  });
  const notify = (p) => {
      if (p.status === "error" && [401, 409].includes(p.error?.status))
        verified = { id: null, at: 0 };
      latest = p;
      listeners.forEach((f) => f(p));
    },
    collector = new Collector(api, store, notify),
    streamer = new StreamerCollector(api, store, notify),
    running = () => collector.running || streamer.running;
  store.onError = () => {
    collector.stop();
    streamer.stop();
    store.data.tracking = false;
    notify({
      running: false,
      message:
        "저장 공간 또는 IndexedDB 오류입니다. 저장에 실패한 기록이 있을 수 있습니다. JSON으로 즉시 내보내세요.",
    });
  };
  const state = () => ({
    account: store.account,
    running: running(),
    progress: latest,
    tracking: store.data.tracking,
    verified:
      verified.id === store.data.activeId && Date.now() - verified.at < 60000,
    verifiedAt: verified.id === store.data.activeId ? verified.at : 0,
    dataPath: store.directory,
    audit: (store.data.audit ?? []).slice(-100),
    runtime: "extension",
    version: chrome.runtime.getManifest().version,
  });
  const verify = async () => {
    const me = await api.me();
    if (running() && me.id !== store.data.activeId) {
      collector.stop();
      streamer.stop();
      throw new Error(
        "수집 중 계정이 변경되었습니다. 수집 종료 후 다시 확인하세요.",
      );
    }
    store.activate(me);
    await store.flush();
    verified = { id: me.id, at: Date.now() };
    previous.clear();
    return state();
  };
  const saveFile = (name, text, type) => {
    const blob = new Blob([text], { type }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return true;
  };
  const open = (url) => chrome.tabs.create({ url });
  window.localApp = {
    onProgress: (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    call: async (name, payload) => {
      switch (name) {
        case "state":
          return state();
        case "verify":
          return verify();
        case "streamerMode":
          await setStreamerMode(store, payload, running());
          return state();
        case "openLogin":
          return open("https://chzzk.naver.com/");
        case "openStudio":
          return open("https://studio.chzzk.naver.com/");
        case "openRepository":
          return open("https://github.com/yeyebee/chzzk-local");
        case "collect":
        case "collectStreamer":
          if (name === "collectStreamer" && !streamerEnabled(store.account))
            throw new Error(
              "수집 설정에서 스트리머 기능 사용을 먼저 켜 주세요.",
            );
          if (running()) throw new Error("이미 수집 중입니다.");
          if (!payload || typeof payload !== "object")
            throw new Error("조회 설정 오류");
          (name === "collect" ? collector : streamer)
            .start(payload)
            .then(() => store.flush())
            .catch((error) =>
              notify({ running: false, message: error.message }),
            );
          return true;
        case "stop":
          collector.stop();
          streamer.stop();
          return true;
        case "purgeStreamerRaw":
          if (running()) throw new Error("수집을 중지한 뒤 원문을 삭제하세요.");
          if (!store.account?.streamer)
            throw new Error("스트리머 기록이 없습니다.");
          if (
            !confirm(
              "보관한 스트리머 채팅 원문·예시·후원 문장을 삭제할까요? 집계와 이후 보관 방식, 내보낸 파일은 유지됩니다.",
            )
          )
            return false;
          purgeStreamerText(store.account.streamer);
          store.save();
          await store.flush();
          return state();
        case "tracking":
          if (payload === true) await verify();
          store.data.tracking = payload === true;
          previous.clear();
          store.save();
          await store.flush();
          return state();
        case "openChannel":
          if (!CHANNEL_ID.test(String(payload)))
            throw new Error("채널 ID 오류");
          return open("https://chzzk.naver.com/live/" + payload);
        case "openReplay": {
          if (!/^\d+$/.test(String(payload?.videoNo)))
            throw new Error("다시보기 번호 오류");
          const t = Math.max(
            0,
            Math.floor(Number(payload.offsetMs || 0) / 1000),
          );
          if (!Number.isFinite(t)) throw new Error("재생 위치 오류");
          return open(
            `https://chzzk.naver.com/video/${payload.videoNo}?t=${t}`,
          );
        }
        case "exportJson":
          if (!store.account) throw new Error("기록이 없습니다.");
          return saveFile(
            "my-viewing-log.json",
            JSON.stringify(
              {
                format: "my-viewing-log",
                version: 1,
                exportedAt: Date.now(),
                account: store.account,
              },
              null,
              2,
            ),
            "application/json",
          );
        case "exportCsv":
          if (!store.account) throw new Error("기록이 없습니다.");
          return saveFile(
            "my-chats.csv",
            csv([
              ["채널", "시각(KST)", "메시지", "다시보기", "출처"],
              ...store.account.chats.map((c) => [
                c.channelName,
                new Date(c.time).toLocaleString("sv-SE", {
                  timeZone: "Asia/Seoul",
                }),
                c.text,
                c.videoNo ?? "",
                c.source,
              ]),
            ]),
            "text/csv",
          );
        case "exportStreamer":
          if (!store.account?.streamer)
            throw new Error("스트리머 기록이 없습니다.");
          return saveFile(
            "streamer-report.html",
            exportStreamerHtml(store.account.streamer, {
              names: payload?.names === true,
              money: payload?.money === true,
            }),
            "text/html",
          );
        case "openData":
          throw new Error(
            "확장 기록은 브라우저 프로필의 IndexedDB에 있습니다. 전체 기록 JSON 내보내기로 파일을 저장하세요.",
          );
        case "logout":
          if (running()) throw new Error("수집 중지 후 연결 해제해 주세요.");
          store.data.tracking = false;
          store.data.activeId = null;
          verified = { id: null, at: 0 };
          previous.clear();
          store.save();
          await store.flush();
          return state();
        case "erase":
          if (running()) throw new Error("수집 중지 후 삭제하세요.");
          if (
            !confirm(
              "이 확장에 저장한 모든 계정 기록·원문·진단을 삭제할까요? 일반 브라우저 로그인과 내보낸 파일은 유지됩니다.",
            )
          )
            return false;
          store.clear();
          await store.flush();
          verified = { id: null, at: 0 };
          previous.clear();
          metadata.clear();
          latest = null;
          return state();
        default:
          throw new Error("허용되지 않은 명령");
      }
    },
  };
  async function sample(message, sender) {
    const s = message.sample,
      tab = sender.tab?.id;
    if (sender.id !== chrome.runtime.id || sender.frameId !== 0 || tab == null)
      return;
    if (!store.data.tracking || !store.account || running()) {
      previous.clear();
      return;
    }
    if (!s?.playing) {
      previous.delete(tab);
      return;
    }
    const u = new URL(sender.url),
      route = u.pathname.match(/^\/(live|video)\/([a-f0-9]+)\/?$/i);
    if (
      u.origin !== "https://chzzk.naver.com" ||
      !route ||
      route[1] !== s.kind ||
      route[2] !== s.id ||
      !Number.isFinite(s.position) ||
      !Number.isFinite(s.rate)
    )
      return;
    if (s.kind === "live" ? !CHANNEL_ID.test(s.id) : !/^\d+$/.test(s.id))
      return;
    const id = store.data.activeId;
    if (verified.id !== id || Date.now() - verified.at > 30000) {
      const me = await api.me();
      if (me.id !== id) {
        store.data.tracking = false;
        store.save();
        previous.clear();
        notify({
          running: false,
          message: "브라우저 계정이 변경되어 재생시간 기록을 중지했습니다.",
        });
        return;
      }
      verified = { id, at: Date.now() };
    }
    const key = s.kind + ":" + s.id;
    let room = metadata.get(key);
    if (!room) {
      room =
        s.kind === "live"
          ? channel(await api.get(API + "/service/v1/channels/" + s.id))
          : channel(await api.get(API + "/service/v3/videos/" + s.id));
      if (!CHANNEL_ID.test(room.id)) return;
      metadata.set(key, room);
    }
    if (store.data.activeId !== id || !store.data.tracking || running()) {
      previous.delete(tab);
      return;
    }
    const now = Date.now(),
      tick = performance.now(),
      before = previous.get(tab),
      current = { ...s, key, tick },
      ms = safeWatchInterval(before, current, tick - (before?.tick ?? tick));
    previous.set(tab, current);
    if (ms)
      store.addWatch(id, {
        channelId: room.id,
        channelName: room.name,
        kind: s.kind,
        start: now - ms,
        end: now,
      });
  }
  chrome.runtime.onMessage.addListener((message, sender) => {
    const tab = sender.tab?.id;
    if (message?.kind !== "watch-sample" || tab == null || sampling.has(tab))
      return;
    sampling.add(tab);
    sample(message, sender)
      .catch(() => {
        previous.delete(tab);
        verified = { id: null, at: 0 };
      })
      .finally(() => sampling.delete(tab));
  });
  window.addEventListener("beforeunload", (event) => {
    if (running()) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
}
