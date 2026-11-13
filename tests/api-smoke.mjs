import { _electron as electron } from "playwright";
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  args: [".", "--self-test"],
  env,
  timeout: 45000,
});
try {
  const page = await app.firstWindow();
  await page.waitForSelector("#login");
  const opened = app.waitForEvent("window");
  await page.locator("#login").click();
  const browser = await opened;
  await browser.waitForURL("https://chzzk.naver.com/", {
    waitUntil: "domcontentloaded",
  });
  const live = browser.locator('a[href*="/live/"]').first();
  await live.waitFor({ timeout: 30000 });
  const ids = await browser
    .locator('a[href*="/live/"]')
    .evaluateAll((links) =>
      [
        ...new Set(
          links
            .map((a) => a.href.match(/live\/([a-f0-9]{32})/i)?.[1])
            .filter(Boolean),
        ),
      ].slice(0, 8),
    );
  if (!ids.length) throw new Error("No live channel found");
  const result = await app.evaluate(async ({ session }, ids) => {
    const ses = session.fromPartition("persist:chzzk");
    const user = await (
      await ses.fetch(
        "https://comm-api.game.naver.com/nng_main/v1/user/getUserStatus",
        { credentials: "include" },
      )
    ).json();
    let list, r, video;
    for (const id of ids) {
      r = await ses.fetch(
        `https://api.chzzk.naver.com/service/v1/channels/${id}/videos?sortType=LATEST&pagingType=PAGE&page=0&size=3&videoType=REPLAY`,
        { credentials: "omit" },
      );
      list = await r.json();
      video = list.content?.data?.[0];
      if (video) break;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    const output = {
      loggedIn: !!user.content?.loggedIn,
      listStatus: r.status,
      listKeys: Object.keys(list.content ?? {}),
      videoCount: list.content?.data?.length ?? 0,
    };
    if (video) {
      const r2 = await ses.fetch(
        `https://api.chzzk.naver.com/service/v1/videos/${video.videoNo}/chats?playerMessageTime=0&previousVideoChatSize=50`,
        { credentials: "omit" },
      );
      const c = (await r2.json()).content;
      output.chats = {
        status: r2.status,
        keys: Object.keys(c ?? {}),
        count: c?.videoChats?.length,
        hasNext: !!c?.nextPlayerMessageTime,
        statusTypes: [
          ...new Set(c?.videoChats?.map((m) => m.messageStatusType) ?? []),
        ],
        typeCodes: [
          ...new Set(c?.videoChats?.map((m) => m.messageTypeCode) ?? []),
        ],
      };
    }
    return output;
  }, ids);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await app.close();
}
