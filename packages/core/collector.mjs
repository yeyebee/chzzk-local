import { persist, PersistenceError } from "./persistence.mjs";
import { API, ApiError } from "./api.mjs";
import { rows, pick, channel, ownChats, CHANNEL_ID } from "./core.mjs";
import { normalizeActivity } from "./moderation.mjs";
import { collectionOptions } from "./collection-options.mjs";

// Independently implemented, bounded, read-only adapter for CHZZK's web APIs.
export class Collector {
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
    if (!id) throw new Error("먼저 계정을 확인해 주세요.");
    const resumeOnly = options.resumeOnly === true;
    const rescan = !resumeOnly && options.rescan === true;
    options = collectionOptions(options);
    this.controller = new AbortController();
    const signal = this.controller.signal,
      account = this.store.data.accounts[id];
    const report = {
      startedAt: Date.now(),
      finishedAt: null,
      status: "running",
      pages: 0,
      found: 0,
      videos: 0,
      completed: 0,
      resumed: 0,
      skipped: 0,
      collectionMode: resumeOnly ? "continuation" : "refresh",
      pageBudget: options.pageBudget,
      warnings: [],
    };
    const emit = (message) =>
      this.notify({ running: true, message, ...report });
    const check = () => this.api.assertAccount(id, signal);
    const get = (path, authenticated = true) =>
      this.api.get(API + path, { signal, authenticated });
    const issue = (stage, error) => {
      if (error instanceof PersistenceError) throw error;
      signal.throwIfAborted();
      if (error.status === 401 || error.status === 409) throw error;
      report.warnings.push(`${stage}: ${error.message}`);
      emit(`${stage} 일부 조회 실패 · 다른 항목을 계속 조회합니다`);
    };
    const stage = async (name, fn) => {
      emit(name);
      await check();
      try {
        await fn();
      } catch (e) {
        issue(name, e);
      }
    };
    try {
      await check();
      const previousPreferences = account.preferences;
      account.preferences = { ...previousPreferences, collection: options };
      try {
        await persist(this.store);
      } catch (error) {
        if (previousPreferences === undefined) delete account.preferences;
        else account.preferences = previousPreferences;
        throw error;
      }
      if (!resumeOnly) {
        await stage("팔로우 목록 조회", async () => {
          const map = new Map();
          let finished = false;
          for (let page = 0; page < 30; page++) {
            const content = await get(
              `/service/v1/channels/followings?page=${page}&size=100&sortType=FOLLOW`,
            );
            const list = rows(content, "followingList", "data");
            let fresh = 0;
            for (const item of list) {
              const c = channel(item);
              if (CHANNEL_ID.test(c.id) && !map.has(c.id)) {
                map.set(c.id, c);
                fresh++;
              }
            }
            if (!list.length || list.length < 100) {
              finished = true;
              break;
            }
            if (!fresh) {
              report.warnings.push(
                "팔로우: 페이지가 반복되어 중단했습니다. 일부 기록일 수 있습니다.",
              );
              break;
            }
          }
          if (!finished)
            report.warnings.push(
              "팔로우: 조회 상한 또는 반복 페이지에 도달했습니다.",
            );
          await check();
          account.follows = [...map.values()];
          await persist(this.store);
        });
        await stage("통나무 파워 조회", async () => {
          const map = new Map();
          let next = null,
            numbered = 0,
            finished = false;
          for (let i = 0; i < 30; i++) {
            const cursor = !!next;
            const query =
              i === 0
                ? ""
                : cursor
                  ? `?next=${encodeURIComponent(next)}`
                  : `?page=${numbered++}&size=100`;
            const content = await get("/service/v1/log-power/balances" + query);
            const list = rows(content, "data", "balances");
            let fresh = 0;
            for (const item of list) {
              const c = channel(item);
              const amount = Number(pick(item, "amount", "balance"));
              if (
                CHANNEL_ID.test(c.id) &&
                c.id !== id &&
                Number.isFinite(amount) &&
                !map.has(c.id)
              ) {
                map.set(c.id, { ...c, amount });
                fresh++;
              }
            }
            next = pick(content, "page.next", "next", "nextCursor");
            if (next && typeof next === "object") {
              report.warnings.push(
                "통나무 파워: 알 수 없는 다음 페이지 형식입니다.",
              );
              break;
            }
            if (!list.length || (!i && !next && list.length < 99)) {
              finished = true;
              break;
            }
            if (i && !fresh && (cursor || numbered > 1)) {
              report.warnings.push(
                "통나무 파워: 응답이 반복되어 종료했습니다. 전체 목록 여부는 확인할 수 없습니다.",
              );
              break;
            }
          }
          if (!finished && map.size >= 99)
            report.warnings.push(
              "통나무 파워: API가 제공한 일부 채널만 표시될 수 있습니다.",
            );
          await check();
          account.power = [...map.values()].map((c) => ({
            ...c,
            name: account.follows.find((f) => f.id === c.id)?.name ?? c.name,
          }));
          await persist(this.store);
        });
        if (options.subscriptions) {
          for (const [label, key, suffix] of [
            ["구독 중인 채널", "subscriptions", ""],
            ["종료된 구독", "expiredSubscriptions", "/expired"],
          ]) {
            await stage(label, async () => {
              const list = rows(
                await get("/commercial/v1/subscribe/channels" + suffix),
                "data",
                "subscriptionList",
                "channels",
                "subscribeChannels",
              );
              const normalized = list
                .map(channel)
                .filter((c) => CHANNEL_ID.test(c.id));
              await check();
              account[key] = normalized;
              await persist(this.store);
            });
          }
        }
        if (options.donations)
          await stage("치즈 사용 내역 조회", async () => {
            const list = [];
            const year = new Date().getFullYear(),
              from = Math.max(
                2023,
                Math.min(year, Number(options.fromYear) || year),
              );
            for (let y = from; y <= year; y++)
              for (let page = 0; page < 30; page++) {
                const c = await get(
                  `/commercial/v1/product/purchase/history?page=${page}&size=100&searchYear=${y}`,
                );
                const data = rows(c, "data", "purchaseHistoryList", "list");
                // Preserve only documented fields useful for a personal history.
                for (const row of data)
                  list.push({
                    ...channel(row),
                    amount:
                      Number(
                        pick(row, "payAmount", "amount", "purchaseAmount"),
                      ) || 0,
                    time:
                      pick(row, "purchaseDate", "createdDate", "payDate") ??
                      null,
                    description: String(
                      pick(row, "productName", "message", "donationMessage") ??
                        "치즈 사용",
                    ),
                  });
                emit(`${y}년 치즈 사용 내역 · ${list.length}건`);
                const pages = Number(pick(c, "totalPages", "page.totalPages"));
                if (
                  !data.length ||
                  (Number.isFinite(pages)
                    ? page + 1 >= pages
                    : data.length < 100)
                )
                  break;
                if (page === 29)
                  report.warnings.push(
                    `${y}년 치즈 사용: 3,000건 조회 상한입니다.`,
                  );
              }
            await check();
            account.donations = list;
            await persist(this.store);
          });
      }
      if (
        resumeOnly ||
        options.chats !== false ||
        options.moderation === true
      ) {
        const map = new Map(account.follows.map((c) => [c.id, c]));
        for (const p of [...account.power].sort((a, b) => b.amount - a.amount))
          if (!map.has(p.id)) map.set(p.id, p);
        const custom = String(options.channels ?? "")
          .split(/[\s,]+/)
          .filter(Boolean);
        const limit = Math.min(
          30,
          Math.max(1, Number(options.channelLimit) || 5),
        );
        let targets;
        if (custom.length) {
          const ids = custom
            .map((x) => x.match(/(?:live\/)?([a-f0-9]{32})/i)?.[1])
            .filter((x) => CHANNEL_ID.test(x ?? ""));
          if (ids.length !== custom.length)
            throw new Error(
              "채널 ID 또는 치지직 라이브 주소 형식을 확인해 주세요.",
            );
          targets = [...new Set(ids)]
            .slice(0, 30)
            .map((id) => map.get(id) ?? { id, name: id.slice(0, 8) });
        } else {
          const ranking = [...account.power]
            .sort((a, b) => b.amount - a.amount)
            .map((c) => c.id);
          targets = [...new Set([...ranking, ...map.keys()])]
            .slice(0, limit)
            .map((id) => map.get(id));
        }
        const maxVideos = options.videosPerChannel;
        const budget = options.pageBudget;
        if (!targets.length)
          report.warnings.push(
            "채팅을 조회할 채널이 없습니다. 채널 ID를 직접 입력할 수 있습니다.",
          );
        const add = async (messages) => {
          await persist(this.store, () => this.store.addChats(id, messages));
          report.found += messages.length;
        };
        for (const room of targets) {
          await check();
          if (!resumeOnly && options.moderation === true) {
            account.moderation ??= {};
            emit(`${room.name} · 본인 차단 상태 조회`);
            try {
              const activity = normalizeActivity(
                await get(
                  `/manage/v1/channels/${room.id}/users/${id}/chat-activity-count`,
                ),
              );
              await check();
              account.moderation[room.id] = { ...activity, name: room.name };
            } catch (e) {
              issue("본인 차단 정보 (권한이 없으면 조회 불가)", e);
              account.moderation[room.id] = {
                status: "unavailable",
                reason: e.message,
                name: room.name,
                checkedAt: Date.now(),
              };
            }
            await persist(this.store);
          }
          if (!resumeOnly && options.chats === false) continue;
          if (!resumeOnly) {
            await stage(`${room.name} · 최근 본인 채팅 조회`, async () => {
              const c = await get(
                `/service/v1/channels/${room.id}/recent-chat-messages`,
              );
              await check();
              await add(ownChats(c, id, room, null, true));
            });
          }
          if (report.pages >= budget) continue;
          let videos = [];
          try {
            videos = rows(
              await get(
                `/service/v1/channels/${room.id}/videos?sortType=LATEST&pagingType=PAGE&page=0&size=${maxVideos}&videoType=REPLAY`,
                false,
              ),
              "data",
            ).slice(0, maxVideos);
          } catch (e) {
            issue(room.name + " 다시보기 목록", e);
          }
          // Continue unfinished videos even after newer uploads push them out
          // of the recent discovery window. Explicit channel selection still
          // limits which stored checkpoints can be used.
          const pending = rescan
            ? []
            : Object.entries(account.checkpoints)
                .filter(
                  ([key, cp]) =>
                    /^\d+$/.test(key) && cp?.channelId === room.id && !cp.done,
                )
                .sort((a, b) => (a[1].updatedAt ?? 0) - (b[1].updatedAt ?? 0))
                .map(([videoNo]) => ({ videoNo }));
          videos = [
            ...new Map(
              [...pending, ...videos].map((v) => [String(v.videoNo), v]),
            ).values(),
          ];
          for (const video of videos) {
            if (report.pages >= budget) break;
            if (!/^\d+$/.test(String(video.videoNo))) continue;
            const checkpoint = account.checkpoints[video.videoNo];
            if (checkpoint?.done && !rescan) {
              report.skipped++;
              continue;
            }
            await check();
            report.videos++;
            let cursor = rescan ? 0 : (checkpoint?.next ?? 0);
            if (cursor > 0) report.resumed++;
            const seen = new Set();
            try {
              while (report.pages < budget) {
                signal.throwIfAborted();
                if (seen.has(cursor))
                  throw new Error(
                    "다시보기 채팅 페이지가 반복되어 중단했습니다.",
                  );
                seen.add(cursor);
                const c = await get(
                  `/service/v1/videos/${video.videoNo}/chats?playerMessageTime=${encodeURIComponent(cursor)}&previousVideoChatSize=50`,
                  false,
                );
                report.pages++;
                const mine = ownChats(c, id, room, video);
                // This is a public response filtered by the collection's fixed owner ID.
                // Raw crowd messages are never saved.
                const next = Number(c.nextPlayerMessageTime);
                const done = c.nextPlayerMessageTime == null || next < 0;
                const valid = Number.isFinite(next) && next > cursor;
                if (!done && !valid) {
                  await add(mine);
                  throw new Error(
                    "다음 채팅 위치가 진행되지 않습니다. 마지막 위치를 보존했습니다.",
                  );
                }
                await add(mine);
                account.checkpoints[video.videoNo] = {
                  next: done ? cursor : next,
                  done,
                  channelId: room.id,
                  updatedAt: Date.now(),
                };
                await persist(this.store);
                emit(
                  `${room.name} · 다시보기 ${video.videoNo} · ${report.pages}/${budget}페이지 · 내 채팅 ${account.chats.length}개`,
                );
                if (done) {
                  report.completed++;
                  break;
                }
                cursor = next;
              }
            } catch (e) {
              issue(`${room.name} 다시보기 ${video.videoNo}`, e);
            }
          }
        }
        if (report.pages >= budget)
          report.warnings.push(
            `이번 실행의 ${budget.toLocaleString("ko-KR")}페이지 한도에 도달했습니다. 채팅만 이어서 수집을 누르면 목록 갱신 없이 이어갑니다. 한도는 수집 설정에서 변경할 수 있습니다.`,
          );
      }
      report.status = report.warnings.length ? "partial" : "complete";
      account.updatedAt = Date.now();
    } catch (error) {
      report.status =
        signal.aborted && !(error instanceof PersistenceError)
          ? "cancelled"
          : "error";
      if (report.status === "error") {
        report.warnings.push(error.message);
        report.error = { message: error.message, status: error.status ?? 0 };
      }
    } finally {
      report.finishedAt = Date.now();
      account.history.unshift(report);
      account.history = account.history.slice(0, 20);
      try {
        await persist(this.store);
      } catch (error) {
        report.status = "error";
        report.error = { message: error.message, status: 0 };
        if (!report.warnings.includes(error.message))
          report.warnings.push(error.message);
      } finally {
        this.controller = null;
      }
      this.notify({
        running: false,
        message:
          report.status === "cancelled"
            ? "수집을 중지했습니다. 저장된 기록은 유지됩니다."
            : report.status === "error"
              ? "수집을 완료하지 못했습니다. 상세 내용을 확인해 주세요."
              : "조회가 끝났습니다. 수집 범위와 알림을 확인해 주세요.",
        ...report,
      });
    }
    return report;
  }
}
