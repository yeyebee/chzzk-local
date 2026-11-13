// Only reusable viewer collection settings belong here. A forced rescan and
// the one-off continuation action must never be remembered as defaults.
export function collectionOptions(value = {}) {
  const integer = (key, fallback, min, max) => {
    const number = Number(value[key]);
    return value[key] == null || value[key] === "" || !Number.isFinite(number)
      ? fallback
      : Math.min(max, Math.max(min, Math.trunc(number)));
  };
  const year = new Date().getFullYear();
  return {
    chats: value.chats !== false,
    subscriptions: value.subscriptions === true,
    donations: value.donations === true,
    moderation: value.moderation === true,
    channelLimit: integer("channelLimit", 5, 1, 30),
    videosPerChannel: integer("videosPerChannel", 3, 1, 50),
    pageBudget: integer("pageBudget", 300, 10, 10000),
    fromYear: integer("fromYear", year, 2023, year),
    channels: typeof value.channels === "string" ? value.channels : "",
  };
}
