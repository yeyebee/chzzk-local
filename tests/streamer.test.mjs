import test from "node:test";
import assert from "node:assert/strict";
import { StreamerCollector, newStreamer } from "../packages/core/streamer.mjs";
import {
  normalizeLive,
  normalizeDonation,
  newChatSummary,
  accumulateChat,
  buildBroadcastReport,
  buildViewerReport,
  DAY,
  AWARDS,
} from "../packages/core/analysis.mjs";
import {
  normalizeActivity,
  normalizeAudience,
} from "../packages/core/moderation.mjs";
import { exportStreamerHtml } from "../packages/core/report-export.mjs";
import { ApiError, validateApiUrl } from "../packages/core/api.mjs";
const owner = "a".repeat(32),
  uid = "b".repeat(32),
  now = Date.now(),
  start = now - DAY;
const messages = [
  {
    userIdHash: uid,
    profile: JSON.stringify({ nickname: "테스트 시청자" }),
    messageTime: start + 1000,
    playerMessageTime: 1000,
    content: "고유한 채팅 원문 ㅋㅋ",
    messageTypeCode: 1,
  },
];
function fixture() {
  const account = { me: { id: owner }, streamer: newStreamer() },
    store = {
      data: { activeId: owner, accounts: { [owner]: account } },
      save() {},
      get account() {
        return account;
      },
    };
  let requests = [],
    denied = false,
    failLives = false;
  const api = {
    assertAccount: async () => {},
    get: async (value) => {
      const u = new URL(value);
      requests.push(u.pathname);
      const p = u.pathname;
      if (p.endsWith("/my-role"))
        return { userRole: denied ? "MANAGER" : "STREAMER" };
      if (p.endsWith("/stats/lives")) {
        if (failLives) throw new ApiError("denied", 403);
        return {
          liveStatList: [
            {
              live: {
                liveId: 123,
                openDate: start,
                closeDate: start + 3600000,
                liveTitle: "합성 방송",
              },
              liveStatDetail: { avgCv: 12, peakCv: 20, uv: 60, duration: 3600 },
            },
          ],
        };
      }
      if (p.endsWith("/audience"))
        return {
          available: true,
          ageSexAvailable: true,
          sex: [
            { code: "MALE", rate: 55 },
            { code: "FEMALE", rate: 45 },
          ],
          ageBands: [],
          loginRate: 88,
        };
      if (p.endsWith("/subscribers"))
        return {
          data: [{ userIdHash: uid, nickname: "테스트 시청자", totalMonth: 4 }],
          totalPages: 1,
        };
      if (p.endsWith("/followers")) return { data: [] };
      if (p.endsWith("/videos"))
        return {
          data: [
            {
              videoNo: 44,
              liveOpenDate: start,
              duration: 3600,
              videoTitle: "합성 방송",
            },
          ],
        };
      if (p.endsWith("/chats"))
        return {
          videoChats: [...messages, ...messages],
          nextPlayerMessageTime: null,
        };
      if (p.endsWith("/chat-activity-count"))
        return {
          chatMessageCount: 20,
          restrict: false,
          restrictCount: 2,
          temporaryRestrict: true,
          temporaryRestrictCount: 4,
        };
      if (p.endsWith("/chat-messages"))
        return { data: messages, page: { next: null } };
      if (p.endsWith("/donations")) return { data: [] };
      if (p.endsWith("/subscription-gift-histories")) return { data: [] };
      throw new Error(p);
    },
  };
  return {
    account,
    store,
    api,
    requests,
    deny() {
      denied = true;
    },
    fail() {
      failLives = true;
    },
  };
}
test("official nested broadcast fields are normalized; missing metrics stay unknown", () => {
  const live = normalizeLive({
    live: {
      liveId: 42,
      openDate: start,
      closeDate: start + 3600000,
      liveTitle: "A",
    },
    liveStatDetail: { avgCv: 0, peakCv: 14 },
  });
  assert.equal(live.id, "42");
  assert.equal(live.averageViewers, 0);
  assert.equal(live.peakViewers, 14);
  assert.equal(live.visitors, null);
  assert.equal(normalizeLive({}), null);
});
test("activity unknown is distinct from false/zero and current status differs from history", () => {
  const a = normalizeActivity({
    chatMessageCount: 0,
    restrict: false,
    restrictCount: 8,
  });
  assert.equal(a.restricted, false);
  assert.equal(a.restrictCount, 8);
  assert.equal(a.temporary, null);
  assert.equal(a.temporaryCount, null);
  assert.equal(a.count, 0);
  assert.throws(() => normalizeActivity({ renamed: true }));
});
test("demographic privacy availability is honored even when stale percentages exist", () => {
  const a = normalizeAudience({
    available: true,
    ageSexAvailable: false,
    ageSexReason: "표본 부족",
    sex: [{ code: "MALE", rate: 70 }],
  });
  assert.equal(a.available, false);
  assert.deepEqual(a.sex, []);
  assert.equal(a.reason, "표본 부족");
  const b = normalizeAudience({
    ageSexAvailable: true,
    sex: [
      { code: "FEMALE", rate: 101 },
      { code: "MALE", rate: 0 },
    ],
  });
  assert.equal(b.sex[0].rate, null);
  assert.equal(b.sex[1].rate, 0);
});
test("anonymous donations cannot be attributed or retain a message", () => {
  const d = normalizeDonation(
    {
      donationTime: start,
      userIdHash: uid,
      nickname: "감춰야함",
      anonymous: true,
      payAmount: 120,
      refundmentAmount: 20,
      donationText: "비밀 문장",
    },
    true,
  );
  assert.equal(d.viewerId, null);
  assert.equal(d.amount, 100);
  assert.ok(!JSON.stringify(d).includes(uid));
  assert.ok(!JSON.stringify(d).includes("비밀 문장"));
});
test("role checks run before any studio or crowd collection", async () => {
  const f = fixture();
  f.deny();
  const c = new StreamerCollector(f.api, f.store, () => {}),
    report = await c.start({});
  assert.equal(report.status, "error");
  assert.equal(f.requests.length, 1);
});
test("MIN keeps aggregates only, FULL preserves fetched normal text without page duplicates", async () => {
  for (const mode of ["minimal", "examples", "full"]) {
    const f = fixture(),
      c = new StreamerCollector(f.api, f.store, () => {});
    await c.start({ storageMode: mode, audience: true, moderation: true });
    const d = f.account.streamer,
      r = d.replayStats["44"];
    assert.equal(r.viewers[uid].chat.count, 1);
    assert.equal(r.messages?.length ?? 0, mode === "full" ? 1 : 0);
    assert.equal(
      r.viewers[uid].chat.examples.length,
      mode === "minimal" ? 0 : 1,
    );
    if (mode === "minimal")
      assert.ok(!JSON.stringify(d).includes("고유한 채팅 원문"));
    assert.equal(d.moderation[uid].restrictCount, 2);
    assert.equal(d.audiences["123"].sex[0].rate, 55);
  }
});
test("downgrading retains old full text unless explicit purge requested", async () => {
  const f = fixture(),
    c = new StreamerCollector(f.api, f.store, () => {});
  await c.start({ storageMode: "full", details: true });
  await c.start({ storageMode: "minimal" });
  assert.equal(f.account.streamer.replayStats["44"].messages.length, 1);
  await c.start({ storageMode: "minimal", purgeExisting: true });
  assert.ok(!JSON.stringify(f.account.streamer).includes("고유한 채팅 원문"));
  assert.equal(f.account.streamer.replayStats["44"].viewers[uid].chat.count, 1);
});
test("failed snapshots preserve previous data and expose their old range", async () => {
  const f = fixture(),
    c = new StreamerCollector(f.api, f.store, () => {});
  await c.start({});
  const first = f.account.streamer.sources.lives.updatedAt;
  f.fail();
  await c.start({});
  assert.equal(f.account.streamer.lives.length, 1);
  assert.equal(f.account.streamer.sources.lives.status, "failed");
  assert.equal(f.account.streamer.sources.lives.updatedAt, first);
});
test("broadcast groups, overlap window, and replay scope are explicit", () => {
  const d = newStreamer(),
    t = Date.parse("2026-10-01T19:00:00+09:00");
  d.lives = [
    { id: "1", start: t, end: t + 3600000 },
    { id: "2", start: t + 3700000, end: t + 7200000 },
  ];
  d.donations = [{ time: t + 1000, amount: 100, viewerId: uid, rules: [] }];
  d.sources.lives = { status: "ok" };
  d.sources.donations = { status: "ok" };
  const b = buildBroadcastReport(d);
  assert.equal(b.days.length, 1);
  assert.equal(b.days[0].cheese, 100);
  const chat = newChatSummary();
  accumulateChat(chat, { messageTime: t, content: "안녕하세요" });
  d.replayStats.x = {
    pages: 1,
    done: true,
    start: t,
    duration: 7200,
    viewers: { [uid]: { name: "N", chat } },
  };
  d.range = { from: "2026-11-01", to: "2026-11-30" };
  assert.equal(buildViewerReport(d).scanned, 0);
  assert.equal(AWARDS.length, 46);
});
test("HTML export excludes identifiers, raw text, donation info by default and escapes names", () => {
  const d = newStreamer();
  d.subscribers = [{ id: uid, name: "<script>fake</script>", months: 3 }];
  d.details[uid] = {
    name: "<script>fake</script>",
    chat: newChatSummary(),
    messages: [{ text: "개인 원문" }],
  };
  d.donations = [
    {
      id: "x",
      time: start,
      viewerId: uid,
      name: "X",
      amount: 1234567,
      rules: [],
    },
  ];
  const html = exportStreamerHtml(d);
  for (const secret of [uid, "<script>", "개인 원문", "1234567"])
    assert.ok(!html.includes(secret));
  assert.ok(exportStreamerHtml(d, { names: true }).includes("&lt;script&gt;"));
});
test("new read endpoints remain allowlisted; mutations are excluded", () => {
  assert.ok(
    validateApiUrl(
      `https://api.chzzk.naver.com/manage/v1/channels/${owner}/stats/lives/123/audience`,
    ),
  );
  assert.throws(() =>
    validateApiUrl(
      `https://api.chzzk.naver.com/manage/v1/channels/${owner}/restrict-users`,
    ),
  );
});
test("an older selected period is found past multiple pages of newer broadcasts", async () => {
  const f = fixture(),
    original = f.api.get;
  const old = Date.parse("2026-01-10T12:00:00+09:00");
  f.api.get = async (value) => {
    const url = new URL(value);
    if (url.pathname.endsWith("/videos")) {
      const page = Number(url.searchParams.get("page"));
      return {
        data:
          page < 2
            ? Array.from({ length: 50 }, (_, i) => ({
                videoNo: 1000 + page * 50 + i,
                liveOpenDate: start,
                duration: 3600,
              }))
            : [{ videoNo: 99, liveOpenDate: old, duration: 3600 }],
      };
    }
    return original(value);
  };
  const collector = new StreamerCollector(f.api, f.store, () => {});
  await collector.start({ from: "2026-01-01", to: "2026-01-31" });
  assert.ok(f.account.streamer.replayStats["99"]);
});
test("completed per-viewer history picks up new messages without recounting old ones", async () => {
  const f = fixture(),
    original = f.api.get;
  let newest = false;
  f.api.get = async (value) =>
    new URL(value).pathname.endsWith("/chat-messages")
      ? {
          data: newest
            ? [
                {
                  ...messages[0],
                  messageTime: start + 2000,
                  content: "새 메시지",
                },
                ...messages,
              ]
            : messages,
          page: { next: null },
        }
      : original(value);
  const collector = new StreamerCollector(f.api, f.store, () => {});
  await collector.start({ details: true, storageMode: "full" });
  newest = true;
  await collector.start({ details: true, storageMode: "full" });
  const detail = f.account.streamer.details[uid];
  assert.equal(detail.chat.count, 2);
  assert.equal(detail.messages.length, 2);
  await collector.start({ details: true, storageMode: "full" });
  assert.equal(detail.chat.count, 2);
});
test("a page containing only cancelled donations replaces a stale successful snapshot with empty data", async () => {
  const f = fixture(),
    original = f.api.get;
  f.account.streamer.donations = [{ id: "old", amount: 100 }];
  f.api.get = async (value) =>
    new URL(value).pathname.endsWith("/donations")
      ? { data: [{ paymentStatus: "CANCELLED" }], totalPages: 1 }
      : original(value);
  await new StreamerCollector(f.api, f.store, () => {}).start({
    finance: true,
  });
  assert.deepEqual(f.account.streamer.donations, []);
  assert.notEqual(f.account.streamer.sources.donations.status, "failed");
});

test("interrupted latest-message refresh resumes without duplicating archived or new text", async () => {
  const f = fixture(),
    original = f.api.get;
  const collector = new StreamerCollector(f.api, f.store, () => {});
  await collector.start({ details: true, storageMode: "full" });
  const make = (offset) => ({
    ...messages[0],
    messageTime: start + offset,
    content: `새 메시지 ${offset}`,
  });
  const cursors = [];
  f.api.get = async (value) => {
    const url = new URL(value);
    if (!url.pathname.endsWith("/chat-messages")) return original(value);
    const cursor = url.searchParams.get("messageTimeLong");
    cursors.push(cursor);
    return cursor === "0"
      ? {
          data: [make(3000)],
          page: { next: { messageTimeLong: start + 3000 } },
        }
      : { data: [make(3000), make(2000), ...messages], page: { next: null } };
  };
  await collector.start({
    details: true,
    storageMode: "full",
    detailBudget: 1,
  });
  const detail = f.account.streamer.details[uid];
  assert.ok(detail.refresh);
  assert.equal(detail.chat.count, 2);
  await collector.start({
    details: true,
    storageMode: "full",
    detailBudget: 1,
  });
  assert.deepEqual(cursors, ["0", String(start + 3000)]);
  assert.equal(detail.refresh, undefined);
  assert.equal(detail.chat.count, 3);
  assert.equal(detail.messages.length, 3);
});
