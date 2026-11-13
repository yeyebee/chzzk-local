import test from "node:test";
import assert from "node:assert/strict";
import { Collector } from "../packages/core/collector.mjs";
import { newStreamer } from "../packages/core/streamer.mjs";
import {
  buildBroadcastReport,
  buildViewerReport,
  newChatSummary,
  messagePerson,
  normalizeDonation,
  normalizeGift,
  uniqueEvents,
  rankedAwards,
  AWARDS,
} from "../packages/core/analysis.mjs";
import { timestamp } from "../packages/core/core.mjs";
import { ChzzkApi } from "../packages/core/api.mjs";
import { purgeStreamerText } from "../packages/core/retention.mjs";
import { validateDatabase } from "../packages/core/database.mjs";
const owner = "a".repeat(32),
  viewer = "b".repeat(32),
  at = Date.parse("2026-11-10T12:00:00+09:00");
function data() {
  const d = newStreamer();
  d.range = { from: "2026-11-01", to: "2026-11-13" };
  d.sources.lives = { ...d.range, status: "ok" };
  d.lives = [{ id: "1", start: at, end: at + 3600000, title: "검증" }];
  return d;
}
test("changing periods cannot mix retained finance from an earlier snapshot", () => {
  const d = data();
  d.sources.donations = { from: "2026-10-01", to: "2026-10-31", status: "ok" };
  d.donations = [
    {
      id: "old",
      time: at - 31 * 86400000,
      amount: 900,
      viewerId: viewer,
      name: "가상",
      rules: [],
    },
  ];
  assert.equal(buildBroadcastReport(d).offStreamCheese, null);
  assert.equal(
    buildViewerReport(d).viewers.find((v) => v.id === viewer),
    undefined,
  );
});
test("unqueried donation and subscription fields are not presented as zero", () => {
  const d = data();
  d.followers = [{ id: viewer, name: "가상" }];
  d.sources.followers = { status: "ok" };
  const v = buildViewerReport(d).viewers[0];
  assert.equal(v.cheese, null);
  assert.equal(v.gifts, null);
  assert.equal(v.months, null);
});
test("invalid-only messages do not create attendance or end-of-broadcast awards", () => {
  const d = data();
  d.replayStats.x = {
    start: at,
    duration: 0,
    pages: 1,
    done: true,
    viewers: { [viewer]: { name: "가상", chat: newChatSummary() } },
  };
  assert.equal(buildViewerReport(d).viewers.length, 0);
});
test("null profile payload and fractional naive timestamps are handled explicitly", () => {
  assert.doesNotThrow(() =>
    messagePerson({ userIdHash: viewer, profile: "null" }),
  );
  assert.equal(timestamp("2026-11-10 12:00:00.123"), at + 123);
});
test("financial schema changes never silently manufacture zero amounts", () => {
  assert.throws(() =>
    normalizeDonation({
      donationTime: at,
      userIdHash: viewer,
      newAmountField: 100,
    }),
  );
});

test("equal anonymous events are preserved while repeated server event IDs are deduplicated", () => {
  for (const normalize of [
    () => normalizeDonation({ donationTime: at, amount: 100, anonymous: true }),
    () => normalizeGift({ createdDate: at, quantity: 1, anonymous: true }),
  ]) {
    assert.equal(uniqueEvents([normalize(), normalize()]).length, 2);
    assert.equal(
      uniqueEvents([
        { ...normalize(), sourceId: "server-1" },
        { ...normalize(), sourceId: "server-1" },
      ]).length,
      1,
    );
  }
});

test("successful empty finance is zero; failed snapshots stay out of current reports", () => {
  const d = data();
  d.sources.donations = { ...d.range, status: "ok" };
  assert.equal(buildBroadcastReport(d).days[0].cheese, 0);
  d.donations = [{ time: at, amount: 100, rules: [] }];
  d.sources.donations.status = "failed";
  assert.equal(buildBroadcastReport(d).days[0].cheese, null);
  assert.equal(d.donations.length, 1);
});
test("a disk error releases the collector lock and reports an error", async () => {
  const account = {
    me: { id: owner },
    follows: [],
    power: [],
    chats: [],
    history: [],
  };
  const store = {
    data: { activeId: owner, accounts: { [owner]: account } },
    save() {
      throw new Error("disk full");
    },
  };
  const api = {
    assertAccount: async () => {},
    get: async () => ({ data: [] }),
  };
  const collector = new Collector(api, store, () => {});
  await collector.start({ chats: false }).catch(() => {});
  assert.equal(collector.running, false);
  assert.equal(account.history[0].status, "error");
});
test("collector stays running until its last durable write is complete", async () => {
  let unblock, entered;
  const waiting = new Promise((r) => (entered = r)),
    gate = new Promise((r) => (unblock = r));
  let writes = 0;
  const account = {
    me: { id: owner },
    follows: [],
    power: [],
    chats: [],
    history: [],
  };
  const store = {
    data: { activeId: owner, accounts: { [owner]: account } },
    save() {},
    async flush() {
      if (++writes === 3) {
        entered();
        await gate;
      }
    },
  };
  const api = {
    assertAccount: async () => {},
    get: async () => ({ data: [] }),
  };
  const collector = new Collector(api, store, () => {}),
    task = collector.start({ chats: false });
  await Promise.race([waiting, new Promise((r) => setTimeout(r, 100))]);
  const busy = collector.running;
  unblock();
  await task;
  assert.equal(busy, true);
  assert.equal(writes, 3);
});
test("abort interrupts API throttling promptly", async () => {
  const abort = new AbortController();
  let calls = 0;
  const api = new ChzzkApi(
    async () => {
      calls++;
      return { ok: true, status: 200, json: async () => ({ content: [] }) };
    },
    { delay: 1000 },
  );
  await api.get("https://api.chzzk.naver.com/service/v1/channels/followings");
  const started = Date.now(),
    task = api.get(
      "https://api.chzzk.naver.com/service/v1/channels/followings",
      { signal: abort.signal },
    );
  abort.abort();
  await assert.rejects(task);
  assert.ok(Date.now() - started < 300);
  assert.equal(calls, 1);
});
test("raw-text deletion preserves aggregates and does not require authentication", () => {
  const d = data(),
    chat = newChatSummary();
  chat.count = 2;
  chat.examples = ["문장"];
  d.storageMode = "full";
  d.replayStats.x = {
    viewers: { [viewer]: { chat } },
    messages: [{ text: "원문" }],
  };
  d.donations = [{ message: "후원문장" }];
  purgeStreamerText(d);
  assert.equal(chat.count, 2);
  assert.equal(d.storageMode, "full");
  assert.deepEqual(chat.examples, []);
  assert.equal(d.replayStats.x.messages, undefined);
  assert.equal(d.donations[0].message, undefined);
});
test("valid JSON with an invalid database schema is rejected before overwrite", () => {
  assert.throws(() =>
    validateDatabase({
      version: 1,
      accounts: [],
      activeId: null,
      tracking: false,
    }),
  );
  assert.throws(() =>
    validateDatabase({
      version: 1,
      accounts: { [owner]: {} },
      activeId: owner,
      tracking: false,
    }),
  );
});
test("simultaneous API callers still respect the shared rate limit", async () => {
  const starts = [];
  const api = new ChzzkApi(
    async () => {
      starts.push(Date.now());
      return { ok: true, status: 200, json: async () => ({ content: [] }) };
    },
    { delay: 50 },
  );
  await Promise.all(
    [1, 2, 3].map(() =>
      api.get("https://api.chzzk.naver.com/service/v1/channels/followings"),
    ),
  );
  assert.ok(starts[1] - starts[0] >= 35);
  assert.ok(starts[2] - starts[1] >= 35);
});

test("bounded award ranking preserves all top-ten scores and Korean tie ordering", () => {
  const d = data();
  d.sources.subscribers = { status: "ok" };
  d.subscribers = Array.from({ length: 2000 }, (_, i) => ({
    id: i.toString(16).padStart(32, "0"),
    name: ["다람쥐", "나무", "가나다"][i % 3] + (i % 19),
    months: i % 30,
  }));
  for (const person of d.subscribers)
    d.chatCounts[person.id] = Number.parseInt(person.id, 16) % 40;
  const viewers = buildViewerReport(d).viewers;
  const ranked = rankedAwards(viewers);
  for (const [id, , , , fn] of AWARDS) {
    const expected = viewers
      .map((v) => ({ id: v.id, name: v.name, value: fn(v) }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "ko"))
      .slice(0, 10);
    assert.deepEqual(ranked.find((a) => a.id === id).rows, expected);
  }
});
