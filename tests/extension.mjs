import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const extension = path.resolve("dist/extension"),
  profile = fs.mkdtempSync(path.join(os.tmpdir(), "chzzk-extension-test-"));
const context = await chromium.launchPersistentContext(profile, {
  channel: "chromium",
  headless: true,
  args: [
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
  ],
});
try {
  const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker")),
    id = new URL(worker.url()).host,
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const owner = "a".repeat(32),
    user = "b".repeat(32),
    start = Date.now() - 86400000;
  let loginId = owner;
  await context.route("https://comm-api.game.naver.com/**", (route) =>
    route.fulfill({
      json: {
        code: 200,
        content: {
          loggedIn: true,
          userIdHash: loginId,
          nickname: "확장 테스트 계정",
        },
      },
    }),
  );
  await context.route("https://api.chzzk.naver.com/**", (route) => {
    const p = new URL(route.request().url()).pathname;
    let content;
    if (p.endsWith("/my-role")) content = { userRole: "STREAMER" };
    else if (p.endsWith("/stats/lives"))
      content = {
        liveStatList: [
          {
            live: {
              liveId: 123,
              openDate: start,
              closeDate: start + 3600000,
              liveTitle: "검증용 방송",
            },
          },
        ],
      };
    else if (p.endsWith("/audience"))
      content = {
        available: true,
        ageSexAvailable: true,
        sex: [
          { code: "MALE", rate: 60 },
          { code: "FEMALE", rate: 40 },
        ],
        ageBands: [],
        loginRate: 80,
      };
    else if (p.endsWith("/subscribers"))
      content = {
        data: [{ userIdHash: user, nickname: "가상 시청자", totalMonth: 2 }],
        totalPages: 1,
      };
    else if (p.endsWith("/followers")) content = { data: [] };
    else if (p.endsWith("/videos"))
      content = {
        data: [
          {
            videoNo: 41,
            liveOpenDate: start,
            duration: 3600,
            videoTitle: "검증용 방송",
          },
        ],
      };
    else if (p.endsWith("/chats"))
      content = {
        videoChats: [
          {
            userIdHash: user,
            profile: JSON.stringify({ nickname: "가상 시청자" }),
            messageTime: start + 10000,
            playerMessageTime: 10000,
            content: "확장에만 보관되는 테스트 원문",
            messageTypeCode: 1,
          },
        ],
        nextPlayerMessageTime: null,
      };
    else if (p.endsWith("/chat-activity-count"))
      content = {
        chatMessageCount: 1,
        restrict: true,
        temporaryRestrict: false,
        restrictCount: 2,
        temporaryRestrictCount: 3,
      };
    else throw new Error("Unexpected API " + p);
    return route.fulfill({ json: { code: 200, content } });
  });
  await page.goto(`chrome-extension://${id}/packages/ui/index.html`);
  await page.waitForFunction(() => document.body.dataset.ready === "true");
  assert.equal(await page.locator('[data-tab="streamer"]').isVisible(), false);
  await page.locator("#verify").click();
  await page.waitForFunction(
    () =>
      document.getElementById("nickname").textContent === "확장 테스트 계정",
  );
  assert.equal(await page.locator('[data-tab="streamer"]').isVisible(), false);
  const denied = await page.evaluate(() =>
    window.localApp.call("collectStreamer", {}).then(
      () => false,
      () => true,
    ),
  );
  assert.equal(denied, true);
  await page.locator('[data-tab="settings"]').click();
  await page.locator("#streamer-mode").check();
  await page.waitForFunction(
    async () =>
      (await window.localApp.call("state")).account.preferences
        ?.streamerMode === true,
  );
  await page.locator('[data-tab="streamer"]').click();
  await page.locator("#storage-mode").selectOption("full");
  await page.locator("#stream-start").click();
  await page.waitForFunction(
    () =>
      document
        .getElementById("progress-text")
        .textContent.includes("스트리머 수집 종료"),
    {},
    { timeout: 30000 },
  );
  await page.locator('[data-pane="roster"]').click();
  assert.match(await page.locator("#roster-list").innerText(), /가상 시청자/);
  await page.locator("#roster-list button").click();
  assert.match(
    await page.locator("#viewer-detail").innerText(),
    /확장에만 보관되는 테스트 원문/,
  );
  await page.locator("#viewer-close").click();
  await page.reload();
  await page.waitForFunction(
    () =>
      document.getElementById("nickname").textContent === "확장 테스트 계정",
  );
  await page.locator('[data-tab="streamer"]').click();
  await page.locator('[data-pane="roster"]').click();
  assert.match(await page.locator("#roster-list").innerText(), /가상 시청자/);
  const duplicate = await context.newPage();
  await duplicate.goto(page.url());
  await duplicate.waitForFunction(() =>
    document.body.textContent.includes("다른 탭에서"),
  );
  await duplicate.close();
  const snapshot = await page.evaluate(() => window.localApp.call("state"));
  assert.equal(snapshot.account.streamer.replayStats["41"].messages.length, 1);
  assert.equal(snapshot.runtime, "extension");
  assert.ok(snapshot.audit.length > 0);
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#stream-purge").click();
  await page.waitForFunction(async () => {
    const state = await window.localApp.call("state");
    return !state.account.streamer.replayStats["41"].messages;
  });
  await page.locator('[data-tab="privacy"]').click();
  await page.locator('[data-tab="streamer"]').click();
  await page.locator('[data-pane="roster"]').click();
  await page.locator("#roster-list button").click();
  assert.doesNotMatch(
    await page.locator("#viewer-detail").innerText(),
    /확장에만 보관되는 테스트 원문/,
  );
  await page.locator("#viewer-close").click();
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.ready === "true");
  const purged = await page.evaluate(() => window.localApp.call("state"));
  const saved = purged.account.streamer;
  assert.equal(saved.replayStats["41"].messages, undefined);
  assert.equal(saved.replayStats["41"].viewers[user].chat.count, 1);
  assert.deepEqual(saved.replayStats["41"].viewers[user].chat.examples, []);
  assert.equal(saved.storageMode, "full");
  assert.equal(purged.account.preferences.streamerMode, true);
  await page.locator('[data-tab="streamer"]').click();
  await page.evaluate(() => window.localApp.call("streamerMode", false));
  await page.locator("#refresh").click();
  await page.waitForFunction(
    () => document.querySelector('[data-tab="streamer"]').hidden,
  );
  assert.equal(await page.locator("#overview").isVisible(), true);
  await page.locator('[data-tab="settings"]').click();
  await page.locator("#streamer-mode").check();
  await page.waitForFunction(
    async () =>
      (await window.localApp.call("state")).account.preferences
        ?.streamerMode === true,
  );
  loginId = "c".repeat(32);
  await page.locator("#verify-settings").click();
  await page.waitForFunction(
    async () =>
      (await window.localApp.call("state")).account.me.id === "c".repeat(32),
  );
  await page.waitForFunction(
    () => document.querySelector('[data-tab="streamer"]').hidden,
  );
  assert.equal(await page.locator('[data-tab="streamer"]').isVisible(), false);
  loginId = owner;
  await page.locator("#verify-settings").click();
  await page.waitForFunction(
    () => !document.querySelector('[data-tab="streamer"]').hidden,
  );
  assert.equal(
    (await page.evaluate(() => window.localApp.call("state"))).account.streamer
      .replayStats["41"].viewers[user].chat.count,
    1,
  );
  assert.deepEqual(errors, []);
  fs.mkdirSync("test-output", { recursive: true });
  await page.screenshot({
    path: "test-output/extension-demo.png",
    fullPage: true,
  });
  console.log(
    JSON.stringify({
      passed: true,
      rendererErrors: errors,
      source: "mocked API; isolated Chromium profile",
      tested: [
        "MV3 load",
        "API adapter",
        "FULL retention",
        "moderation",
        "IndexedDB persistence",
        "single dashboard lock",
        "raw-text purge persists across tab switches and reload",
        "viewer-first navigation and per-account opt-in persistence",
      ],
    }),
  );
} finally {
  await context.close();
}
