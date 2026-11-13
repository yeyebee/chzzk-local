import { purgeStreamerText } from "./retention.mjs";
import { persist, PersistenceError } from "./persistence.mjs";
import { API, ApiError } from "./api.mjs";
import { rows, pick, timestamp } from "./core.mjs";
import { normalizeActivity, normalizeAudience } from "./moderation.mjs";
import {
  DAY,
  normalizeLive,
  normalizePerson,
  normalizeDonation,
  normalizeGift,
  newChatSummary,
  accumulateChat,
  messagePerson,
  buildViewerReport,
  calendarDay,
  inReportRange,
  uniqueEvents,
} from "./analysis.mjs";
export const newStreamer = () => ({
  version: 1,
  lives: [],
  donations: [],
  gifts: [],
  subscribers: [],
  followers: [],
  replayStats: {},
  details: {},
  chatCounts: {},
  sources: {},
  history: [],
  keepExamples: false,
});
const hash = async (value) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
const date = (t) => new Date(t).toISOString().slice(0, 10);
const limit = (v, fallback, max) =>
  Math.min(max, Math.max(1, Math.floor(Number(v) || fallback)));
export function ranges(from, to, days = 30) {
  const out = [];
  for (let a = from; a <= to; a += days * DAY)
    out.push({ from: date(a), to: date(Math.min(to, a + (days - 1) * DAY)) });
  return out;
}
export function selectTopViewers(viewers, max) {
  const lists = [
      ...["months", "count", "cheese"].map((k) =>
        [...viewers].sort((a, b) => b[k] - a[k]).map((v) => v.id),
      ),
    ],
    out = [];
  for (let i = 0; out.length < max && lists.some((l) => i < l.length); i++)
    for (const list of lists)
      if (list[i] && !out.includes(list[i]) && out.length < max)
        out.push(list[i]);
  return out;
}
export class StreamerCollector {
  constructor(api, store, notify) {
    this.api = api;
    this.store = store;
    this.notify = notify;
    this.controller = null;
  }
  get running() {
    return !!this.controller;
  }
  stop() {
    this.controller?.abort();
  }
  async start(options = {}) {
    if (this.running) throw new Error("이미 수집 중입니다.");
    const id = this.store.data.activeId;
    if (!id) throw new Error("계정 확인이 필요합니다.");
    this.controller = new AbortController();
    const signal = this.controller.signal;
    const account = this.store.data.accounts[id],
      data = (account.streamer ??= newStreamer());
    const report = {
      mode: "streamer",
      startedAt: Date.now(),
      status: "running",
      requests: 0,
      pages: 0,
      videos: 0,
      lines: 0,
      warnings: [],
    };
    const emit = (message) =>
      this.notify({ running: true, ...report, message });
    const get = async (path, authenticated = true) => {
      signal.throwIfAborted();
      report.requests++;
      return this.api.get(API + path, { signal, authenticated });
    };
    const check = () => this.api.assertAccount(id, signal);
    const failure = (label, e) => {
      if (e instanceof PersistenceError) throw e;
      signal.throwIfAborted();
      if ([401, 409].includes(e.status)) throw e;
      report.warnings.push(`${label}: ${e.message}`);
    };
    const end = Date.parse(
        (options.to || calendarDay(Date.now())) + "T00:00:00Z",
      ),
      start = Date.parse(
        (options.from || calendarDay(Date.now() - 89 * DAY)) + "T00:00:00Z",
      );
    const windows =
      Number.isFinite(start) && Number.isFinite(end) && start <= end
        ? ranges(start, end)
        : [];
    const stage = async (key, label, fn) => {
      emit(label);
      await check();
      const warningsBefore = report.warnings.length;
      try {
        const value = await fn();
        await check();
        data[key] = value;
        data.sources[key] = {
          from: date(start),
          to: date(end),
          updatedAt: Date.now(),
          status: report.warnings.length > warningsBefore ? "partial" : "ok",
        };
        await persist(this.store);
      } catch (e) {
        failure(label, e);
        data.sources[key] = {
          ...(data.sources[key] ?? {}),
          status: "failed",
          error: e.message,
        };
      }
    };
    const paged = async (path, keys, maxPages = 20) => {
      const collected = [],
        seen = new Set();
      for (let page = 0; page < maxPages; page++) {
        const c = await get(path(page)),
          list = rows(c, ...keys);
        const fingerprint = await hash(JSON.stringify(list));
        if (seen.has(fingerprint) && list.length) {
          report.warnings.push(
            "페이지가 반복되어 목록을 중단했습니다. 일부 결과입니다.",
          );
          break;
        }
        seen.add(fingerprint);
        collected.push(...list);
        const total = Number(pick(c, "totalPages", "page.totalPages"));
        if (!list.length || (Number.isFinite(total) && page + 1 >= total))
          break;
        if (page === maxPages - 1)
          report.warnings.push(`목록 ${maxPages}페이지 상한에 도달했습니다.`);
      }
      return collected;
    };
    const normalized = (list, fn, label, allowEmpty = false) => {
      const result = list.map(fn).filter(Boolean);
      if (list.length && !result.length && !allowEmpty)
        throw new Error(
          `${label} 필드 형식을 인식하지 못했습니다. 이전 데이터는 보존합니다.`,
        );
      if (result.length < list.length && !allowEmpty)
        report.warnings.push(
          `${label}: ${list.length - result.length}개 항목은 날짜·ID·상태 등의 조건으로 제외했습니다.`,
        );
      return result;
    };
    try {
      if (
        !windows.length ||
        end - start > 3 * 365 * DAY ||
        date(end) > calendarDay(Date.now())
      )
        throw new Error(
          "조회 기간은 오늘까지 최대 3년이며 시작일이 종료일보다 앞서야 합니다.",
        );
      await check();
      emit("내 채널의 스트리머 권한 확인");
      const role = await get(`/manage/v1/channels/${id}/my-role`);
      if ((role?.userRole ?? role?.role ?? role) !== "STREAMER")
        throw new ApiError(
          "이 계정의 채널 소유자 권한을 확인하지 못했습니다. 스튜디오에 로그인한 채널 소유자만 사용할 수 있습니다.",
          403,
        );
      data.storageMode = ["minimal", "examples", "full"].includes(
        options.storageMode,
      )
        ? options.storageMode
        : "minimal";
      data.keepExamples = data.storageMode !== "minimal";
      data.range = { from: date(start), to: date(end) };
      if (options.purgeExisting === true) {
        purgeStreamerText(data, data.storageMode);
        await persist(this.store);
      }
      await stage("lives", "스튜디오 방송 이력 조회", async () => {
        const all = [];
        for (const w of windows) {
          const c = await get(
            `/manage/v1/channels/${id}/stats/lives?from=${w.from}&to=${w.to}`,
          );
          all.push(...rows(c, "liveStatList"));
          emit(`방송 이력 ${w.from} ~ ${w.to}`);
        }
        return [
          ...new Map(
            normalized(all, normalizeLive, "방송 이력").map((l) => [l.id, l]),
          ).values(),
        ];
      });
      if (options.audience === true) {
        data.audiences ??= {};
        for (const live of data.lives
          .filter((live) => inReportRange(data, live.start))
          .sort((a, b) => b.start - a.start)
          .slice(0, limit(options.audienceLimit, 10, 100))) {
          if (!/^\d+$/.test(live.id)) continue;
          await check();
          emit("방송별 성별·연령 공식 집계 조회");
          try {
            const response = await get(
              `/manage/v1/channels/${id}/stats/lives/${live.id}/audience`,
            );
            await check();
            data.audiences[live.id] = normalizeAudience(response);
          } catch (e) {
            failure("성별·연령", e);
            data.audiences[live.id] = {
              available: false,
              reason: e.message,
              checkedAt: Date.now(),
              sex: [],
              ages: [],
            };
          }
        }
        await persist(this.store);
      }
      for (const [key, label, route, fn, keys] of [
        [
          "subscribers",
          "현재 구독자",
          "subscribers",
          normalizePerson,
          ["data"],
        ],
        ["followers", "팔로워", "followers", normalizePerson, ["data"]],
      ]) {
        await stage(key, label, async () =>
          normalized(
            await paged(
              (p) =>
                `/manage/v1/channels/${id}/${route}?page=${p}&size=50${key === "subscribers" ? "&sortType=LONGER" : ""}`,
              keys,
              limit(options.memberPages, 20, 200),
            ),
            fn,
            label,
          ),
        );
      }
      if (options.finance === true) {
        await stage("donations", "받은 후원 내역", async () => {
          const all = [];
          for (const w of windows) {
            all.push(
              ...(await paged(
                (p) =>
                  `/manage/v2/channels/${id}/donations?channelId=${id}&fromDate=${w.from}&toDate=${w.to}&page=${p}&pageSize=100&donationType=&sortType=LATEST`,
                ["data"],
                50,
              )),
            );
            emit(`후원 ${w.from} ~ ${w.to}`);
          }
          return uniqueEvents(
            normalized(
              all,
              (r) => normalizeDonation(r, data.keepExamples),
              "후원",
              true,
            ),
          );
        });
        await stage("gifts", "받은 구독권 선물", async () => {
          const all = [];
          for (const w of windows)
            all.push(
              ...(await paged(
                (p) =>
                  `/manage/v1/channels/${id}/subscription-gift-histories?fromDate=${w.from}&toDate=${w.to}&page=${p}&size=100`,
                ["data"],
                30,
              )),
            );
          return uniqueEvents(
            normalized(all, normalizeGift, "구독권 선물", true),
          );
        });
      }
      const maxReplays = limit(options.replayLimit, 20, 500),
        budget = limit(options.pageBudget, 500, 20000);
      emit("공개 다시보기 목록 조회");
      await check();
      const videos = [],
        selectedIds = new Set(),
        listedIds = new Set();
      const discoveryPages = limit(options.discoveryPages, 100, 200);
      for (
        let page = 0;
        page < discoveryPages && videos.length < maxReplays;
        page++
      ) {
        const c = await get(
          `/service/v1/channels/${id}/videos?sortType=LATEST&pagingType=PAGE&page=${page}&size=50&videoType=REPLAY`,
          false,
        );
        const list = rows(c, "data");
        let older = false,
          fresh = 0;
        for (const video of list) {
          const key = String(video.videoNo);
          if (!/^\d+$/.test(key)) continue;
          if (!listedIds.has(key)) {
            listedIds.add(key);
            fresh++;
          }
          const time = timestamp(video.liveOpenDate ?? video.publishDate);
          if (!time) continue;
          if (time < start - 9 * 3600000) {
            older = true;
            continue;
          }
          if (time >= end + DAY - 9 * 3600000) continue;
          if (!selectedIds.has(key)) {
            selectedIds.add(key);
            videos.push(video);
            if (videos.length >= maxReplays) break;
          }
        }
        if (!list.length || older || list.length < 50) break;
        if (!fresh) {
          report.warnings.push(
            "다시보기 목록 페이지가 반복되어 탐색을 중지했습니다. 일부 결과입니다.",
          );
          break;
        }
        if (page === discoveryPages - 1 && videos.length < maxReplays)
          report.warnings.push(
            `다시보기 목록 탐색 ${discoveryPages}페이지 상한입니다. 더 오래된 기간의 자료가 누락될 수 있습니다.`,
          );
      }
      if (videos.length >= maxReplays)
        report.warnings.push(
          `최근 다시보기 ${maxReplays}개 한도입니다. 전체 방송 이력이 아닐 수 있습니다.`,
        );
      for (const video of videos) {
        if (report.pages >= budget) break;
        await check();
        const key = String(video.videoNo);
        if (data.replayStats[key]?.done && !options.rescan) continue;
        let r = data.replayStats[key];
        if (!r || options.rescan)
          r = data.replayStats[key] = {
            no: key,
            title: String(video.videoTitle ?? ""),
            duration: Number(video.duration) || 0,
            start: timestamp(video.liveOpenDate),
            viewers: {},
            cursor: 0,
            pages: 0,
            done: false,
            boundary: [],
          };
        report.videos++;
        try {
          while (report.pages < budget) {
            const c = await get(
              `/service/v1/videos/${key}/chats?playerMessageTime=${r.cursor}&previousVideoChatSize=50`,
              false,
            );
            const list = [
              ...(Array.isArray(c.previousVideoChats)
                ? c.previousVideoChats
                : []),
              ...rows(c, "videoChats"),
            ];
            const prior = new Set(r.boundary),
              boundary = [];
            for (const m of list) {
              const identity = await hash(
                JSON.stringify([m.userIdHash, m.messageTime, m.content]),
              );
              boundary.push(identity);
              if (prior.has(identity)) continue;
              prior.add(identity);
              const person = messagePerson(m);
              if (!person || person.id === id) continue;
              const time = timestamp(m.messageTime);
              if (!r.start && time && m.playerMessageTime != null)
                r.start = time - Number(m.playerMessageTime);
              const viewer = r.viewers[person.id] ?? {
                name: person.name,
                role: person.role,
                chat: newChatSummary(),
              };
              if (
                accumulateChat(viewer.chat, m, {
                  keepExamples: data.keepExamples,
                  start: r.start,
                  duration: r.duration,
                })
              ) {
                r.viewers[person.id] = viewer;
                report.lines++;
                if (data.storageMode === "full") {
                  r.messages ??= [];
                  r.messages.push({
                    viewerId: person.id,
                    name: person.name,
                    time,
                    text: m.content ?? m.message,
                    offsetMs: Number(m.playerMessageTime) || 0,
                  });
                }
              }
            }
            r.boundary = boundary.slice(-400);
            r.pages++;
            report.pages++;
            const next = Number(c.nextPlayerMessageTime);
            const ended =
              !list.length || c.nextPlayerMessageTime == null || next < 0;
            if (ended) r.done = true;
            else if (!Number.isFinite(next) || next <= r.cursor)
              throw new Error(
                "채팅 위치가 진행되지 않아 중단했습니다. 완전 조회로 간주하지 않습니다.",
              );
            else r.cursor = next;
            await persist(this.store);
            emit(
              `다시보기 ${report.videos}/${videos.length} · ${report.pages}/${budget}페이지 · ${report.lines.toLocaleString("ko-KR")}줄 로컬 집계`,
            );
            if (r.done) break;
          }
        } catch (e) {
          failure(`다시보기 ${key}`, e);
        }
      }
      if (report.pages >= budget)
        report.warnings.push(
          "채팅 페이지 상한에 도달했습니다. 다음 수집에서 저장된 위치부터 이어집니다.",
        );
      if (options.details === true || options.moderation === true) {
        const viewers = buildViewerReport(data).viewers,
          max = limit(options.viewerLimit, 50, 200),
          targets = selectTopViewers(viewers, max),
          messageBudget = limit(options.detailBudget, 300, 10000);
        let used = 0;
        for (const user of targets) {
          await check();
          emit(
            `시청자 상세 기록 ${targets.indexOf(user) + 1}/${targets.length}`,
          );
          data.moderation ??= {};
          try {
            const c = await get(
              `/manage/v1/channels/${id}/users/${user}/chat-activity-count`,
            );
            const activity = normalizeActivity(c);
            await check();
            if (activity.count !== null) data.chatCounts[user] = activity.count;
            data.moderation[user] = activity;
          } catch (e) {
            failure("채팅·차단 활동 정보", e);
            data.moderation[user] = {
              status: "unavailable",
              reason: e.message,
              checkedAt: Date.now(),
            };
          }
          await persist(this.store);
          if (options.details !== true) continue;
          if (used >= messageBudget) continue;
          let detail = data.details[user];
          if (!detail || options.rescan)
            detail = data.details[user] = {
              name:
                viewers.find((v) => v.id === user)?.name ?? user.slice(0, 8),
              chat: newChatSummary(),
              cursor: 0,
              done: false,
              boundary: [],
            };
          // Completed history is refreshed from the newest page on later runs.
          // A separate refresh cursor keeps an interrupted refresh resumable.
          const refreshing = detail.done;
          const scan = refreshing
            ? (detail.refresh ??= {
                cursor: 0,
                until: detail.headTime ?? detail.chat.last ?? 0,
                knownHead: detail.headKeys ?? [],
                boundary: [],
              })
            : detail;
          const cursors = new Set();
          let size = 50;
          try {
            while (used < messageBudget) {
              if (cursors.has(String(scan.cursor)))
                throw new Error("상세 메시지 커서가 반복됩니다.");
              cursors.add(String(scan.cursor));
              let c;
              try {
                c = await get(
                  `/manage/v1/channels/${id}/users/${user}/chat-messages?messageTimeLong=${scan.cursor}&size=${size}`,
                );
              } catch (e) {
                if (e.status === 400 && size === 50) {
                  size = 20;
                  cursors.delete(String(scan.cursor));
                  continue;
                }
                throw e;
              }
              await check();
              used++;
              const list = rows(c, "data", "messages", "chatMessages"),
                seen = new Set(scan.boundary),
                boundary = [];
              let reached = false;
              for (const message of list) {
                if (message.userIdHash && message.userIdHash !== user) continue;
                const time = timestamp(
                  message.messageTime ?? message.messageTimeLong,
                );
                if (!time) continue;
                const key = await hash(
                  JSON.stringify([time, message.content ?? message.message]),
                );
                boundary.push(key);
                if (
                  refreshing &&
                  (time < scan.until ||
                    (time === scan.until &&
                      (!scan.knownHead.length || scan.knownHead.includes(key))))
                ) {
                  reached = true;
                  continue;
                }
                if (seen.has(key)) continue;
                seen.add(key);
                if (time > (detail.headTime ?? 0)) {
                  detail.headTime = time;
                  detail.headKeys = [];
                }
                if (time === detail.headTime && !detail.headKeys.includes(key))
                  detail.headKeys.push(key);
                if (
                  accumulateChat(detail.chat, message, {
                    keepExamples: data.keepExamples,
                  }) &&
                  data.storageMode === "full"
                ) {
                  detail.messages ??= [];
                  detail.messages.push({
                    viewerId: user,
                    time,
                    text: message.content ?? message.message,
                  });
                }
              }
              scan.boundary = boundary;
              const next = pick(
                c,
                "page.next.messageTimeLong",
                "next.messageTimeLong",
              );
              const ended = !list.length || next == null || reached;
              if (ended) {
                detail.done = true;
                if (refreshing) delete detail.refresh;
              } else if (String(next) === String(scan.cursor))
                throw new Error("상세 메시지 페이지 반복");
              else scan.cursor = next;
              detail.updatedAt = Date.now();
              await persist(this.store);
              if (ended) break;
            }
          } catch (e) {
            failure("시청자 메시지", e);
          }
        }
        if (used >= messageBudget)
          report.warnings.push(
            "시청자 상세 메시지 조회 한도입니다. 재실행하면 이어집니다.",
          );
      }
      report.status = report.warnings.length ? "partial" : "complete";
      data.updatedAt = Date.now();
      data.range = { from: date(start), to: date(end) };
    } catch (e) {
      report.status =
        signal.aborted && !(e instanceof PersistenceError)
          ? "cancelled"
          : "error";
      if (report.status === "error") report.warnings.push(e.message);
    } finally {
      report.finishedAt = Date.now();
      data.history.unshift(report);
      data.history = data.history.slice(0, 20);
      try {
        await persist(this.store);
      } catch (error) {
        report.status = "error";
        if (!report.warnings.includes(error.message))
          report.warnings.push(error.message);
      } finally {
        this.controller = null;
      }
      this.notify({
        running: false,
        ...report,
        message:
          report.status === "error"
            ? "스트리머 수집 오류 · 상세 결과를 확인해 주세요."
            : report.status === "cancelled"
              ? "스트리머 수집 중지 · 저장된 위치에서 이어갈 수 있습니다."
              : "스트리머 수집 종료 · 범위와 누락 안내를 확인해 주세요.",
      });
    }
    return report;
  }
}
