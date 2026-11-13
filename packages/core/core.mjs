// Pure data transformations. No network access and no third-party analysis.
export const CHANNEL_ID = /^[a-f0-9]{32}$/i;
export function pick(obj, ...paths) {
  for (const path of paths) {
    const value = path.split(".").reduce((o, k) => o?.[k], obj);
    if (value !== undefined && value !== null) return value;
  }
}
export function rows(data, ...keys) {
  if (Array.isArray(data)) return data;
  for (const key of keys)
    if (Array.isArray(pick(data, key))) return pick(data, key);
  throw new Error("API 응답 형식이 바뀌었습니다. 기존 기록은 유지됩니다.");
}
export function timestamp(value) {
  if (value === null || value === undefined || value === "") return null;
  if (/^\d{10,13}$/.test(String(value)))
    return Number(value) * (Number(value) < 1e12 ? 1000 : 1);
  let text = String(value);
  if (/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d(:\d\d(?:\.\d{1,9})?)?$/.test(text))
    text = text.replace(" ", "T") + "+09:00";
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : null;
}
export function channel(row) {
  return {
    id: String(
      pick(row, "channel.channelId", "channelId", "streamerChannelId") ?? "",
    ),
    name: String(
      pick(row, "channel.channelName", "channelName", "streamerName") ??
        "이름 미확인",
    ),
    followedAt: timestamp(
      pick(row, "personalData.following.followDate", "followDate"),
    ),
  };
}
export function ownChats(payload, owner, room, video = null, recent = false) {
  const list = recent
    ? rows(payload, "messages", "data", "recentChatMessages")
    : [...(payload.previousVideoChats ?? []), ...rows(payload, "videoChats")];
  return list.flatMap((item) => {
    // The recent-chat endpoint is scoped to the logged-in user. If an ID is
    // supplied, require an exact match even on that endpoint.
    if ((!recent || item.userIdHash) && item.userIdHash !== owner) return [];
    if (item.messageStatusType && item.messageStatusType !== "NORMAL")
      return [];
    if (item.messageTypeCode != null && Number(item.messageTypeCode) !== 1)
      return [];
    const text = item.content ?? item.message;
    const time = timestamp(
      item.messageTime ??
        item.messageTimeLong ??
        item.createdDate ??
        item.createdTime,
    );
    if (typeof text !== "string" || !text.trim() || !time) return [];
    return [
      {
        channelId: room.id,
        channelName: room.name,
        text: text.slice(0, 10000),
        time,
        videoNo: video ? String(video.videoNo) : null,
        offsetMs:
          Number.isFinite(Number(item.playerMessageTime)) &&
          item.playerMessageTime != null
            ? Number(item.playerMessageTime)
            : null,
        source: recent ? "recent" : "replay",
      },
    ];
  });
}
export function chatKey(row) {
  return JSON.stringify([row.channelId, row.time, row.text]);
}
export function mergeChats(old, incoming) {
  const result = new Map(old.map((row) => [chatKey(row), row]));
  for (const row of incoming) {
    const previous = result.get(chatKey(row));
    result.set(
      chatKey(row),
      previous?.videoNo && !row.videoNo ? previous : row,
    );
  }
  return [...result.values()].sort((a, b) => b.time - a.time);
}
export function csv(rows) {
  const cell = (value) => {
    let s = String(value ?? "");
    if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return "\ufeff" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
}
export function mergedDuration(intervals) {
  const sorted = intervals
    .filter(
      (x) =>
        Number.isFinite(x.start) && Number.isFinite(x.end) && x.end > x.start,
    )
    .sort((a, b) => a.start - b.start);
  let total = 0,
    from = null,
    to = null;
  for (const row of sorted) {
    if (from === null) {
      from = row.start;
      to = row.end;
    } else if (row.start <= to) to = Math.max(to, row.end);
    else {
      total += to - from;
      from = row.start;
      to = row.end;
    }
  }
  return total + (from === null ? 0 : to - from);
}
export function watchSummary(watches) {
  const groups = new Map();
  for (const row of watches) {
    const group = groups.get(row.channelId) ?? {
      id: row.channelId,
      name: row.channelName,
      intervals: [],
    };
    group.intervals.push(row);
    groups.set(row.channelId, group);
  }
  return {
    totalMs: mergedDuration([...watches]),
    channels: [...groups.values()]
      .map((g) => ({ id: g.id, name: g.name, ms: mergedDuration(g.intervals) }))
      .sort((a, b) => b.ms - a.ms),
  };
}
export function safeWatchInterval(previous, current, elapsedMs) {
  if (
    !previous ||
    previous.key !== current.key ||
    !previous.playing ||
    !current.playing
  )
    return null;
  if (elapsedMs <= 0 || elapsedMs > 8000) return null; // sleep / suspension / stalled event loop
  const advance = current.position - previous.position;
  if (
    !Number.isFinite(advance) ||
    advance < 0.1 ||
    advance > (elapsedMs / 1000) * 4 + 2
  )
    return null; // pause, stall, or seek
  return Math.min(
    elapsedMs,
    (advance / Math.max(0.25, current.rate || 1)) * 1000,
  );
}
export function summaries(account) {
  const chats = account?.chats ?? [];
  const byRoom = new Map(),
    words = new Map(),
    hours = Array(24).fill(0);
  for (const row of chats) {
    const room = byRoom.get(row.channelId) ?? {
      id: row.channelId,
      name: row.channelName,
      count: 0,
    };
    room.count++;
    byRoom.set(room.id, room);
    hours[new Date(row.time + 9 * 3600000).getUTCHours()]++;
    for (const word of row.text.match(/[가-힣a-zA-Z0-9]{2,}/g) ?? [])
      words.set(word, (words.get(word) ?? 0) + 1);
  }
  return {
    rooms: [...byRoom.values()].sort((a, b) => b.count - a.count),
    words: [...words.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
    hours,
    watch: watchSummary(account?.watches ?? []),
  };
}
