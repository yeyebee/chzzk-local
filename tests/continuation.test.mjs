import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store } from "../apps/desktop/store.mjs";
import { Collector } from "../packages/core/collector.mjs";

const owner = "a".repeat(32),
  room = "b".repeat(32),
  other = "c".repeat(32);
function fixture() {
  const store = new Store(
    fs.mkdtempSync(path.join(os.tmpdir(), "view-log-resume-")),
  );
  store.activate({ id: owner, nickname: "가상 계정" });
  store.account.follows = [{ id: room, name: "선택 채널" }];
  return store;
}

test("continuation reuses private snapshots and resumes old videos outside the latest window within a shared budget", async () => {
  const store = fixture();
  store.account.donations = [{ amount: 100 }];
  store.account.checkpoints = {
    10: { channelId: room, next: 10, done: false },
    20: { channelId: room, next: 0, done: true },
    99: { channelId: other, next: 5, done: false },
  };
  const calls = [];
  let identityChecks = 0;
  const collector = new Collector(
    {
      assertAccount: async () => {
        identityChecks++;
      },
      get: async (url, { authenticated }) => {
        calls.push(url);
        assert.equal(authenticated, false);
        const u = new URL(url);
        if (u.pathname === `/service/v1/channels/${room}/videos`)
          return { data: [{ videoNo: 20 }, { videoNo: 30 }] };
        assert.match(u.pathname, /\/videos\/(10|30)\/chats$/);
        const cursor = Number(u.searchParams.get("playerMessageTime"));
        return {
          videoChats: [],
          nextPlayerMessageTime:
            u.pathname.includes("/10/") && cursor < 22 ? cursor + 1 : null,
        };
      },
    },
    store,
    () => {},
  );
  const options = {
    resumeOnly: true,
    rescan: true,
    subscriptions: true,
    donations: true,
    moderation: true,
    pageBudget: 10,
  };
  const first = await collector.start(options);
  assert.equal(first.status, "partial");
  assert.equal(first.pages, 10);
  assert.equal(first.resumed, 1);
  assert.equal(store.account.checkpoints[10].next, 20);
  assert.match(calls[1], /playerMessageTime=10&/);
  const second = await collector.start(options);
  assert.equal(second.status, "complete");
  assert.equal(second.pages, 4);
  assert.equal(second.skipped, 1);
  assert.equal(second.completed, 2);
  assert.equal(store.account.checkpoints[10].done, true);
  assert.equal(store.account.checkpoints[30].done, true);
  assert.equal(store.account.checkpoints[99].next, 5);
  assert.deepEqual(store.account.donations, [{ amount: 100 }]);
  assert.equal(store.account.follows[0].id, room);
  assert.ok(identityChecks >= 4);
  assert.ok(
    calls.every(
      (url) => !/followings|balances|recent-chat|commercial|manage/.test(url),
    ),
  );
  assert.equal(second.collectionMode, "continuation");
});

test("collection settings survive reopening per account without remembering a forced rescan", async () => {
  const store = fixture();
  store.account.preferences = { streamerMode: true };
  const api = {
    assertAccount: async () => {},
    get: async () => ({ data: [] }),
  };
  await new Collector(api, store, () => {}).start({
    resumeOnly: true,
    rescan: true,
    pageBudget: "1200",
    channelLimit: "8",
    videosPerChannel: "10",
    channels: room,
    moderation: true,
    donations: true,
    subscriptions: true,
  });
  const reopened = new Store(store.directory);
  const saved = reopened.account.preferences;
  assert.equal(saved.streamerMode, true);
  assert.equal(saved.collection.pageBudget, 1200);
  assert.equal(saved.collection.channelLimit, 8);
  assert.equal(saved.collection.videosPerChannel, 10);
  assert.equal(saved.collection.channels, room);
  assert.equal(saved.collection.moderation, true);
  assert.equal(saved.collection.rescan, undefined);
  assert.equal(saved.collection.resumeOnly, undefined);
  reopened.activate({ id: other, nickname: "다른 계정" });
  assert.equal(reopened.account.preferences?.collection, undefined);
  reopened.activate({ id: owner, nickname: "가상 계정" });
  assert.equal(reopened.account.preferences.collection.pageBudget, 1200);
});

test("a failed recent-video listing still allows a saved unfinished video to continue", async () => {
  const store = fixture();
  store.account.checkpoints[10] = { channelId: room, next: 5, done: false };
  const collector = new Collector(
    {
      assertAccount: async () => {},
      get: async (url) => {
        if (url.includes("/channels/")) throw Error("list unavailable");
        assert.match(url, /\/videos\/10\/chats\?playerMessageTime=5&/);
        return { videoChats: [], nextPlayerMessageTime: null };
      },
    },
    store,
    () => {},
  );
  const report = await collector.start({ resumeOnly: true });
  assert.equal(report.status, "partial");
  assert.equal(report.completed, 1);
  assert.equal(store.account.checkpoints[10].done, true);
  assert.match(report.warnings[0], /list unavailable/);
});

test("an explicit rescan starts at zero once; the next update skips the completed video", async () => {
  const store = fixture();
  store.account.checkpoints[10] = { channelId: room, next: 10, done: true };
  const cursors = [];
  const collector = new Collector(
    {
      assertAccount: async () => {},
      get: async (url) => {
        const u = new URL(url);
        if (u.pathname.endsWith("/videos")) return { data: [{ videoNo: 10 }] };
        if (u.pathname.endsWith("/chats")) {
          cursors.push(u.searchParams.get("playerMessageTime"));
          return { videoChats: [], nextPlayerMessageTime: null };
        }
        return { data: [] };
      },
    },
    store,
    () => {},
  );
  const report = await collector.start({ channels: room, rescan: true });
  assert.equal(report.status, "complete");
  assert.deepEqual(cursors, ["0"]);
  const next = await collector.start(store.account.preferences.collection);
  assert.equal(next.skipped, 1);
  assert.deepEqual(cursors, ["0"]);
});
