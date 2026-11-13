import { CHANNEL_ID } from "./core.mjs";
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value);
export function validateDatabase(value) {
  const fail = () => {
    throw new Error(
      "기록 파일 구조가 올바르지 않습니다. 원본을 덮어쓰지 않습니다. JSON 백업을 확인해 주세요.",
    );
  };
  if (
    !object(value) ||
    value.version !== 1 ||
    !object(value.accounts) ||
    typeof value.tracking !== "boolean"
  )
    fail();
  if (
    value.activeId !== null &&
    (!CHANNEL_ID.test(value.activeId) ||
      !Object.hasOwn(value.accounts, value.activeId))
  )
    fail();
  for (const [id, account] of Object.entries(value.accounts)) {
    if (
      !CHANNEL_ID.test(id) ||
      !object(account) ||
      account.me?.id !== id ||
      typeof account.me.nickname !== "string"
    )
      fail();
    for (const key of [
      "follows",
      "power",
      "subscriptions",
      "expiredSubscriptions",
      "donations",
      "chats",
      "watches",
      "history",
    ])
      if (
        !Array.isArray(account[key]) ||
        account[key].some((row) => !object(row))
      )
        fail();
    if (!object(account.checkpoints)) fail();
    if (account.streamer) {
      const s = account.streamer;
      if (!object(s) || s.version !== 1) fail();
      for (const key of [
        "lives",
        "donations",
        "gifts",
        "subscribers",
        "followers",
        "history",
      ])
        if (!Array.isArray(s[key])) fail();
      for (const key of ["replayStats", "details", "chatCounts", "sources"])
        if (!object(s[key])) fail();
    }
  }
  return value;
}
