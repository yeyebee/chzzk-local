import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const out = path.resolve("test-output");
fs.mkdirSync(out, { recursive: true });
const app = await electron.launch({
  executablePath: process.env.APP_UNDER_TEST || undefined,
  args: process.env.APP_UNDER_TEST ? ["--self-test"] : [".", "--self-test"],
  env,
  timeout: 60000,
});
try {
  const page = await app.firstWindow(),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForSelector("#onboarding");
  assert.equal(await page.locator('[data-tab="streamer"]').isVisible(), false);
  assert.equal(await page.locator('[data-go="streamer"]').isVisible(), false);
  await page.getByRole("button", { name: "예시 둘러보기" }).click();
  await page.waitForSelector("#demo-banner:visible");
  assert.equal(await page.locator("#metric-chat").innerText(), "84개");
  await page.screenshot({
    path: path.join(out, "dashboard-demo.png"),
    fullPage: true,
  });
  await page.locator('[data-tab="streamer"]').click();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setBounds({ width: 1050, height: 900 }),
  );
  const layout = await page.evaluate(() => {
    const rect = (id) => {
      const r = document.querySelector(id).getBoundingClientRect();
      return {
        top: r.top,
        bottom: r.bottom,
        left: r.left,
        right: r.right,
        height: r.height,
      };
    };
    return {
      buttons: [...document.querySelectorAll(".stream-actions button")].map(
        (b) => ({
          top: b.getBoundingClientRect().top,
          height: b.getBoundingClientRect().height,
          bottom: b.getBoundingClientRect().bottom,
        }),
      ),
      options: rect(".stream-export-options"),
      form: rect("#stream-form"),
      inputs: [
        ...document.querySelectorAll("#stream-form .form-grid input"),
      ].map((b) => ({
        left: b.getBoundingClientRect().left,
        right: b.getBoundingClientRect().right,
      })),
      viewport: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    };
  });
  assert.ok(layout.documentWidth <= layout.viewport + 2);
  assert.ok(layout.buttons.every((b) => Math.abs(b.height - 40) < 2));
  assert.ok(
    layout.options.top >= Math.max(...layout.buttons.map((b) => b.bottom)) + 8,
  );
  assert.ok(
    layout.inputs.every(
      (b) => b.left >= layout.form.left - 1 && b.right <= layout.form.right + 1,
    ),
  );
  await page.screenshot({ path: path.join(out, "streamer-layout.png") });
  assert.equal(await page.locator("#stream-summary .metric").count(), 4);
  await page.locator('[data-pane="audience"]').click();
  assert.match(await page.locator("#audience-sex").innerText(), /60%/);
  await page.locator('[data-pane="roster"]').click();
  await page.locator("#roster-restriction").selectOption("restricted");
  assert.match(await page.locator("#roster-list").innerText(), /초록연필/);
  assert.doesNotMatch(
    await page.locator("#roster-list").innerText(),
    /새벽산책/,
  );
  await page.locator("#roster-list button").click();
  assert.equal(await page.locator("#viewer-dialog").isVisible(), true);
  await page.getByRole("searchbox", { name: "시청자 원문 검색" }).fill("최고");
  assert.match(
    await page.locator(".raw-lines").innerText(),
    /ㅋㅋㅋㅋ 오늘도 최고/,
  );
  await page.locator("#viewer-close").click();
  await page.locator('[data-pane="awards"]').click();
  await page.screenshot({
    path: path.join(out, "streamer-demo.png"),
    fullPage: true,
  });
  await page.locator('[data-tab="privacy"]').click();
  assert.match(await page.locator("#privacy").innerText(), /전체 원문/);
  await page.locator('[data-tab="overview"]').click();

  await page.locator('[data-tab="chats"]').click();
  await page.locator("#search").fill("감사합니다");
  assert.match(await page.locator("#chat-count").innerText(), /21개/);
  assert.equal(await page.locator("#chat-table tr").count(), 21);
  await page.locator("#search").fill("없는문장123");
  assert.equal(await page.locator("#chat-table tr").count(), 1);
  await page.locator('[data-tab="watch"]').click();
  assert.equal(await page.locator("#tracking").isDisabled(), true);
  await page.locator("#exit-demo").click();
  await page.locator('[data-tab="overview"]').click();
  assert.equal(await page.locator("#onboarding").isVisible(), true);
  assert.equal(await page.locator("#metric-chat").innerText(), "0개");
  assert.equal(await page.locator('[data-tab="streamer"]').isVisible(), false);
  await page.screenshot({
    path: path.join(out, "dashboard-empty.png"),
    fullPage: true,
  });
  await page.locator('[data-tab="settings"]').click();
  assert.equal(await page.locator("#collection-form").isVisible(), true);
  const security = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0],
      p = win.webContents.getLastWebPreferences();
    return {
      sandbox: p.sandbox,
      contextIsolation: p.contextIsolation,
      nodeIntegration: p.nodeIntegration,
    };
  });
  assert.deepEqual(security, {
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
  });
  assert.deepEqual(errors, []);
  let loginOrigin = null;
  // Optional live-site smoke; the default regression suite is offline.
  if (process.env.LIVE_BROWSER_SMOKE === "1") {
    const opened = app.waitForEvent("window");
    await page.locator("#login-settings").click();
    const login = await opened;
    await login.waitForURL(/https:\/\/[^/]*naver\.com\//, {
      timeout: 45000,
      waitUntil: "domcontentloaded",
    });
    assert.ok(new URL(login.url()).hostname.endsWith("naver.com"));
    assert.equal(
      await login.evaluate(() => typeof window.localApp),
      "undefined",
    );
    await login.screenshot({ path: path.join(out, "chzzk-browser.png") });
    loginOrigin = new URL(login.url()).origin;
  }
  console.log(
    JSON.stringify({
      passed: true,
      rendererErrors: errors,
      security,
      loginOrigin,
      screenshots: out,
    }),
  );
} finally {
  await app.close();
}
