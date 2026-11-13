import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ownChats,
  mergeChats,
  timestamp,
  csv,
  mergedDuration,
  safeWatchInterval,
  rows,
  watchSummary,
} from "../packages/core/core.mjs";
import { Store } from "../apps/desktop/store.mjs";
import { validateApiUrl, ChzzkApi } from "../packages/core/api.mjs";
import { Collector } from "../packages/core/collector.mjs";
const id = "a".repeat(32),
  other = "b".repeat(32),
  room = { id: other, name: "테스트 채널" },
  at = 1780000000000;
function store() {
  return new Store(fs.mkdtempSync(path.join(os.tmpdir(), "view-log-unit-")));
}
test("only the owner’s normal chat survives; private crowd text is discarded", () => {
  const c = {
    videoChats: [
      {
        userIdHash: id,
        content: "내 채팅",
        messageTime: at,
        messageTypeCode: 1,
        playerMessageTime: 1234,
      },
      {
        userIdHash: other,
        content: "다른 사람",
        messageTime: at,
        messageTypeCode: 1,
      },
      {
        userIdHash: id,
        content: "삭제됨",
        messageStatusType: "BLIND",
        messageTime: at,
      },
      { userIdHash: id, content: "후원", messageTypeCode: 10, messageTime: at },
    ],
  };
  assert.equal(ownChats(c, id, room, { videoNo: 123 }).length, 1);
  assert.equal(ownChats(c, id, room, { videoNo: 123 })[0].text, "내 채팅");
  assert.equal(
    ownChats(
      { messages: [{ content: "본인 최근 메시지", messageTime: at }] },
      id,
      room,
      null,
      true,
    ).length,
    1,
  );
  assert.equal(
    ownChats(
      { messages: [{ userIdHash: other, content: "아님", messageTime: at }] },
      id,
      room,
      null,
      true,
    ).length,
    0,
  );
});
test("overlapping replay pages and recent history deduplicate without losing replay reference", () => {
  const recent = {
    channelId: other,
    time: at,
    text: "같은 내용",
    source: "recent",
    videoNo: null,
  };
  const replay = { ...recent, source: "replay", videoNo: "32" };
  const result = mergeChats([recent], [replay, recent]);
  assert.equal(result.length, 1);
  assert.equal(result[0].videoNo, "32");
  assert.equal(mergeChats(result, [{ ...recent, time: at + 1 }]).length, 2);
});
test("Korean timestamps, seconds, milliseconds and invalid date", () => {
  assert.equal(
    timestamp("2026-11-13 09:00:00"),
    Date.parse("2026-11-13T00:00:00Z"),
  );
  assert.equal(timestamp(1780000000), at);
  assert.equal(timestamp(at), at);
  assert.equal(timestamp(null), null);
  assert.equal(timestamp("bad-date"), null);
});
test("CSV safely quotes commas, multiline text and spreadsheet formulas", () => {
  const result = csv([
    ['=HYPERLINK("https://example.org")', "hello,\nworld", "  +CMD"],
  ]);
  assert.ok(result.startsWith("\ufeff"));
  assert.ok(result.includes("\"'=HYPERLINK"));
  assert.ok(result.includes('"hello,\nworld"'));
  assert.ok(result.includes("'  +CMD"));
});
test("overlapping playback intervals count once", () => {
  assert.equal(
    mergedDuration([
      { start: 100, end: 200 },
      { start: 50, end: 150 },
      { start: 300, end: 400 },
    ]),
    250,
  );
  const s = watchSummary([
    { channelId: "a", channelName: "A", start: 0, end: 100 },
    { channelId: "b", channelName: "B", start: 50, end: 150 },
  ]);
  assert.equal(s.totalMs, 150);
  assert.equal(s.channels[0].ms, 100);
});
test("watch measurements exclude pause, buffering, seek, sleep and navigation", () => {
  const before = { key: "a", playing: true, position: 100, rate: 1 };
  assert.equal(
    safeWatchInterval(before, { ...before, position: 105 }, 5000),
    5000,
  );
  assert.equal(
    safeWatchInterval(before, { ...before, position: 110, rate: 2 }, 5000),
    5000,
  );
  assert.equal(
    safeWatchInterval(before, { ...before, position: 100 }, 5000),
    null,
  );
  assert.equal(
    safeWatchInterval(
      before,
      { ...before, position: 105, playing: false },
      5000,
    ),
    null,
  );
  assert.equal(
    safeWatchInterval(before, { ...before, position: 305 }, 5000),
    null,
  );
  assert.equal(
    safeWatchInterval(before, { ...before, position: 105 }, 120000),
    null,
  );
  assert.equal(
    safeWatchInterval(before, { ...before, key: "b", position: 105 }, 5000),
    null,
  );
});
test("API allowlist rejects writes, external origins, credentials and traversal", () => {
  assert.equal(
    validateApiUrl(
      "https://api.chzzk.naver.com/service/v1/channels/followings?page=0",
    ).host,
    "api.chzzk.naver.com",
  );
  for (const url of [
    "https://evil.test/service/v1/channels/followings",
    "https://api.chzzk.naver.com.evil.test/service/v1/channels/followings",
    "https://user:pass@api.chzzk.naver.com/service/v1/channels/followings",
    "https://api.chzzk.naver.com/open/v1/chats/send",
    "file:///etc/passwd",
    "https://api.chzzk.naver.com/service/v1/channels/followings/../secret",
  ])
    assert.throws(() => validateApiUrl(url));
});
test("unexpected list schemas fail visibly instead of overwriting with empty data", () => {
  assert.throws(() => rows({ renamed: [] }, "data"));
  assert.deepEqual(rows({ data: [] }, "data"), []);
});
test("account storage is isolated and persists; corrupt data fails without overwrite", () => {
  const s = store();
  s.activate({ id, nickname: "첫 계정" });
  s.addChats(id, [{ channelId: other, time: at, text: "개인 기록" }]);
  s.activate({ id: other, nickname: "다른 계정" });
  assert.equal(s.account.chats.length, 0);
  assert.equal(s.data.accounts[id].chats.length, 1);
  const loaded = new Store(s.directory);
  assert.equal(loaded.data.accounts[id].chats.length, 1);
  fs.writeFileSync(s.file, "broken");
  assert.throws(() => new Store(s.directory));
  assert.equal(fs.readFileSync(s.file, "utf8"), "broken");
});
test("HTTP errors and identity mismatch are surfaced; credentials are not exported", async () => {
  let request;
  const api = new ChzzkApi(
    async (url, options) => {
      request = options;
      return new Response(
        JSON.stringify({
          code: 200,
          content: { loggedIn: true, userIdHash: id, nickname: "나" },
        }),
      );
    },
    { delay: 0 },
  );
  assert.equal((await api.me()).id, id);
  assert.equal(request.method, "GET");
  assert.equal(request.credentials, "include");
  await assert.rejects(api.assertAccount(other), /계정이 바뀌어/);
  const denied = new ChzzkApi(async () => new Response("{}", { status: 403 }), {
    delay: 0,
  });
  await assert.rejects(denied.me(), /허용하지/);
});
test("collector saves only own chats, resumes cursors, skips finished videos and reports limits", async () => {
  const s = store();
  s.activate({ id, nickname: "나" });
  const cursors = [];
  const mock = {
    assertAccount: async () => ({ id }),
    get: async (url) => {
      const u = new URL(url);
      if (u.pathname.endsWith("followings"))
        return {
          followingList: [{ channel: { channelId: other, channelName: "방" } }],
        };
      if (u.pathname.endsWith("balances")) return { data: [] };
      if (u.pathname.endsWith("recent-chat-messages")) return { messages: [] };
      if (u.pathname.endsWith("/videos")) return { data: [{ videoNo: 123 }] };
      if (u.pathname.endsWith("/chats")) {
        const cursor = Number(u.searchParams.get("playerMessageTime"));
        cursors.push(cursor);
        return {
          videoChats: [
            {
              userIdHash: id,
              content: "내 것 " + cursor,
              messageTime: at + cursor,
              messageTypeCode: 1,
            },
            { userIdHash: other, content: "남의 것", messageTime: at + cursor },
          ],
          nextPlayerMessageTime: cursor < 10 ? cursor + 1 : null,
        };
      }
      throw new Error("unexpected URL " + url);
    },
  };
  const c = new Collector(mock, s, () => {});
  const first = await c.start({ pageBudget: 10 });
  assert.equal(first.status, "partial");
  assert.equal(s.account.checkpoints["123"].next, 10);
  assert.equal(s.account.chats.length, 10);
  const next = await c.start({ pageBudget: 10 });
  assert.equal(next.status, "complete");
  assert.equal(cursors.at(-1), 10);
  assert.equal(s.account.chats.length, 11);
  assert.equal(s.account.checkpoints["123"].done, true);
  const length = cursors.length;
  await c.start({ pageBudget: 10 });
  assert.equal(cursors.length, length);
  assert.ok(s.account.chats.every((c) => !c.text.includes("남의")));
});
test("partial failure preserves previous private records", async () => {
  const s = store();
  s.activate({ id, nickname: "나" });
  s.account.follows = [room];
  s.save();
  const c = new Collector(
    {
      assertAccount: async () => ({ id }),
      get: async () => {
        throw new Error("offline");
      },
    },
    s,
    () => {},
  );
  const result = await c.start({ chats: false });
  assert.equal(result.status, "partial");
  assert.deepEqual(s.account.follows, [room]);
  assert.ok(result.warnings.length >= 2);
});
test("cancellation is recorded and saved; account mismatch aborts collection", async () => {
  const s = store();
  s.activate({ id, nickname: "나" });
  let c;
  c = new Collector(
    {
      assertAccount: async () => {
        c.stop();
      },
      get: async () => {
        throw new Error("not reached");
      },
    },
    s,
    () => {},
  );
  const result = await c.start({ chats: false });
  assert.equal(result.status, "cancelled");
  assert.equal(c.running, false);
  const e = Object.assign(new Error("계정 변경"), { status: 409 });
  const mismatch = new Collector(
    {
      assertAccount: async () => {
        throw e;
      },
    },
    s,
    () => {},
  );
  assert.equal((await mismatch.start({})).status, "error");
});
