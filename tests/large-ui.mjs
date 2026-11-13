import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";

// Synthetic fixture only. No real profile, cookies, credentials or API requests.
const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
let exportedHtml = "";
const server = http.createServer(async (req, res) => {
  if (req.url === "/exported-report.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(exportedHtml);
    return;
  }
  const filename = path.resolve(
    root,
    "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname),
  );
  if (!filename.startsWith(root + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const type =
      {
        ".html": "text/html",
        ".mjs": "text/javascript",
        ".css": "text/css",
        ".png": "image/png",
        ".ico": "image/x-icon",
      }[path.extname(filename)] ?? "text/plain";
    res.writeHead(200, { "Content-Type": type + "; charset=utf-8" });
    res.end(await fs.readFile(filename));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    }),
    errors = [];
  page.setDefaultTimeout(60000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*", (route) =>
    route
      .request()
      .url()
      .startsWith(origin + "/")
      ? route.continue()
      : route.abort(),
  );
  await page.addInitScript(() => {
    const now = Date.parse("2026-11-12T20:00:00+09:00"),
      id = (i) => i.toString(16).padStart(32, "0");
    const longName = "긴이름" + "UnbrokenNickname".repeat(30);
    const summary = () => ({
      count: 1000000000000,
      chars: 9999999999999,
      laughChars: 500,
      hours: Array(24).fill(100),
      weekdays: Array(7).fill(1),
      rules: { laugh: 8 },
      days: { "2026-11-12": true },
      bins: { 0: true },
      first: now,
      last: now,
      examples: [],
      emotes: [],
    });
    const streamer = {
      version: 1,
      range: { from: "2024-01-01", to: "2026-11-13" },
      storageMode: "full",
      sources: {},
      lives: [],
      followers: [],
      subscribers: [],
      donations: [],
      gifts: [],
      replayStats: {},
      details: {},
      chatCounts: {},
      moderation: {},
      history: [],
    };
    for (const key of [
      "lives",
      "followers",
      "subscribers",
      "donations",
      "gifts",
    ])
      streamer.sources[key] = {
        ...streamer.range,
        status: "ok",
        updatedAt: now,
      };
    for (let i = 1; i <= 50000; i++) {
      streamer.followers.push({
        id: id(i),
        name: i === 1 ? longName : `합성 시청자 ${i}`,
        followedAt: now - 86400000,
      });
      streamer.chatCounts[id(i)] = 1000000000000 + i;
    }
    for (let i = 0; i < 3000; i++)
      streamer.lives.push({
        id: String(i + 1),
        title: i === 0 ? longName : `합성 방송 ${i}`,
        category: longName,
        start: now - i * 3600000,
        end: now - i * 3600000 + 1800000,
      });
    streamer.details[id(1)] = {
      name: longName,
      chat: summary(),
      done: true,
      messages: Array.from({ length: 100000 }, (_, i) => ({
        viewerId: id(1),
        time: now - i * 1000,
        text: i === 0 ? "긴원문" + "W".repeat(10000) : `전체 원문 테스트 ${i}`,
      })),
    };
    const account = {
      me: { id: id(999999), nickname: longName },
      follows: Array.from({ length: 10000 }, (_, i) => ({
        id: id(i + 1),
        name: i === 0 ? longName : `합성 채널 ${i}`,
      })),
      power: [{ id: id(1), name: longName, amount: 999999999999999 }],
      subscriptions: [],
      expiredSubscriptions: [],
      donations: [],
      history: [],
      watches: [],
      chats: Array.from({ length: 100000 }, (_, i) => ({
        channelId: id((i % 100) + 1),
        channelName: i % 100 === 0 ? longName : `합성 채널 ${i % 100}`,
        time: now - i * 1000,
        text: i === 0 ? "긴문장" + "W".repeat(10000) : `합성 채팅 ${i} ㅋㅋ`,
        source: "recent",
      })),
      streamer,
    };
    window.localApp = {
      onProgress: () => () => {},
      call: async (name) => {
        if (name === "state")
          return {
            account,
            runtime: "desktop",
            version: "1.1.1",
            audit: [],
            running: false,
            tracking: false,
            dataPath: "합성 테스트 프로필",
          };
        throw Error("Unexpected command " + name);
      },
    };
  });
  const started = Date.now();
  await page.goto(origin + "/packages/ui/index.html");
  await page.waitForFunction(
    () => document.body.dataset.ready === "true",
    null,
    { timeout: 120000 },
  );
  const loadMs = Date.now() - started,
    measurements = [];
  async function check(label) {
    const result = await page.evaluate(() => ({
      width: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      metrics: [...document.querySelectorAll(".metric")]
        .filter((e) => e.getClientRects().length)
        .map((e) => ({ width: e.clientWidth, content: e.scrollWidth })),
    }));
    measurements.push({ label, ...result });
    assert.ok(
      result.documentWidth <= result.width + 2,
      `${label}: document ${result.documentWidth} > viewport ${result.width}`,
    );
    assert.ok(
      result.metrics.every((e) => e.content <= e.width + 2),
      `${label}: metric overflow`,
    );
  }
  for (const width of [1920, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const tab of [
      "overview",
      "chats",
      "channels",
      "streamer",
      "privacy",
    ]) {
      await page.locator(`[data-tab="${tab}"]`).click();
      await check(`${width}/${tab}`);
    }
  }
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.locator('[data-tab="chats"]').click();
  assert.equal(await page.locator("#chat-table tr").count(), 40);
  await page.locator("#next").click();
  assert.match(await page.locator("#page-info").innerText(), /2 \/ 2500/);
  await page.locator('[data-tab="channels"]').click();
  assert.equal(await page.locator("#follow-list .channel-tile").count(), 60);
  await page.locator('#follow-list [data-page-direction="1"]').click();
  assert.match(
    await page.locator("#follow-list .pager").innerText(),
    /2 \/ 167/,
  );
  await page
    .getByRole("searchbox", { name: "팔로우 채널 검색" })
    .fill("합성 채널 9999");
  assert.equal(await page.locator("#follow-list .channel-tile").count(), 1);
  await page.locator('[data-tab="streamer"]').click();
  assert.equal(await page.locator("#broadcast-lives tbody tr").count(), 50);
  await page.locator('#broadcast-lives [data-page-direction="1"]').click();
  assert.match(
    await page.locator("#broadcast-lives .pager").innerText(),
    /2 \/ 60/,
  );
  await page.locator('[data-pane="roster"]').click();
  assert.equal(await page.locator("#roster-list tbody tr").count(), 50);
  await page.locator("#roster-search").fill("긴이름");
  await page.locator("#roster-list button").first().click();
  const dialog = await page
    .locator("#viewer-dialog")
    .evaluate((e) => ({ width: e.clientWidth, content: e.scrollWidth }));
  assert.ok(dialog.content <= dialog.width + 2, "dialog horizontal overflow");
  assert.ok((await page.locator(".raw-lines p").count()) <= 201);
  assert.match(await page.locator("#viewer-detail").innerText(), /100,000줄/);
  await page.setViewportSize({ width: 390, height: 900 });
  const smallDialog = await page
    .locator("#viewer-dialog")
    .evaluate((e) => ({ width: e.clientWidth, content: e.scrollWidth }));
  assert.ok(
    smallDialog.content <= smallDialog.width + 2,
    "narrow dialog horizontal overflow",
  );
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.locator("#viewer-close").click();
  await page.locator('[data-pane="awards"]').click();
  await check("1024/awards");
  await fs.mkdir(path.join(root, "test-output"), { recursive: true });
  await page.waitForTimeout(200); // Let the tab's background transition finish before capture.
  await page.screenshot({
    path: path.join(root, "test-output/large-data.png"),
  });
  exportedHtml = await page.evaluate(async () => {
    const { exportStreamerHtml } = await import("./../core/report-export.mjs");
    const { account } = await window.localApp.call("state");
    const d = account.streamer;
    return exportStreamerHtml(
      {
        ...d,
        followers: d.followers.slice(0, 5000),
        chatCounts: Object.fromEntries(
          Object.entries(d.chatCounts).slice(0, 5000),
        ),
        details: {},
      },
      { names: true, money: true },
    );
  });
  const exported = await browser.newPage({
    viewport: { width: 390, height: 900 },
  });
  await exported.goto(origin + "/exported-report.html");
  assert.equal(await exported.locator("tbody tr").count(), 5000);
  assert.ok(
    await exported.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 2,
    ),
    "exported HTML horizontal overflow",
  );
  await exported.close();
  assert.deepEqual(errors, []);
  const result = {
    passed: true,
    personalChats: 100000,
    viewers: 50000,
    fullMessages: 100000,
    follows: 10000,
    lives: 3000,
    loadMs,
    rendererErrors: errors,
    measurements,
  };
  await fs.writeFile(
    path.join(root, "test-output/large-data-results.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify({ ...result, measurements: measurements.length }));
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
