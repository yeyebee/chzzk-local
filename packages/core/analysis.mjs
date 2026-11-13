// Transparent local rules, independently authored. No model, telemetry or network.
import { pick, timestamp, CHANNEL_ID } from "./core.mjs";
export const DAY = 86400000,
  HOUR = 3600000;
export const RULES = [
  ["laugh", "웃음", /[ㅋㅎ]{2,}|\blol\b/i],
  ["reaction", "감탄·반응", /대박|미쳤|레전드|와[우아]|헐|ㄹㅇ|인정/],
  ["question", "질문", /[?？]|왜요|뭔가요|어떻게|언제|무엇|어디/],
  ["greeting", "인사", /안녕|반가|하이|좋은[ ]?(아침|저녁)|굿모닝|어서[ ]?오/],
  ["farewell", "마무리 인사", /수고|고생|잘[ ]?자|바이|내일[ ]?봐|좋은[ ]?밤/],
  [
    "cheer",
    "응원·칭찬",
    /화이팅|파이팅|최고|잘한다|잘하네|멋지|예쁘|이쁘|힐링|응원/,
  ],
  ["thanks", "감사", /감사|고마워|고맙/],
  ["affection", "애정 표현", /사랑|좋아해|결혼|사귀|애인/],
  ["welcome", "환영", /환영|뉴비|처음[ ]?(오|왔)|어서[ ]?오/],
  ["info", "정보 표현", /패치|업데이트|공식|출처|검색|위키|버전/],
  ["advice", "제안·조언", /해[ ]?보|하시면|가세요|누르|추천|왼쪽|오른쪽/],
  [
    "daily",
    "일상 이야기",
    /퇴근|출근|회사|학교|오늘[ ]?저|오늘[ ]?나|점심|저녁[ ]?먹|아침[ ]?먹/,
  ],
  ["music", "음악 이야기", /노래|신청곡|가수|멜로디|음악|플레이리스트/],
  ["food", "음식 이야기", /라면|치킨|피자|배고|맛있|먹방|야식/],
  ["game", "게임 이야기", /보스|퀘스트|공략|스킬|레벨|클리어|랭크|게임/],
  ["congrats", "축하", /축하|생일|기념일|축하해/],
  ["emote", "이모티콘", /\{:[^}]+:\}|[\u{1F300}-\u{1FAFF}]/u],
  ["link", "링크", /https?:\/\//i],
  ["roulette", "룰렛·뽑기", /룰렛|뽑기|돌림판/],
  ["mission", "미션", /미션|도전|챌린지/],
];
export function classify(text) {
  return RULES.filter(([, , r]) => r.test(text)).map(([id]) => id);
}
export const median = (values) => {
  const a = values.filter(Number.isFinite).sort((x, y) => x - y);
  return a.length
    ? (a[Math.floor((a.length - 1) / 2)] + a[Math.ceil((a.length - 1) / 2)]) / 2
    : 0;
};
export const sum = (a) => a.reduce((s, v) => s + (Number(v) || 0), 0);
export const dayKey = (t) => new Date(t + 4 * HOUR).toISOString().slice(0, 10); // KST 05:00 broadcast-day boundary
export const calendarDay = (t) =>
  new Date(t + 9 * HOUR).toISOString().slice(0, 10);
const num = (o, ...paths) => {
  const v = Number(pick(o, ...paths));
  return Number.isFinite(v) ? v : 0;
};
const text = (o, ...paths) => String(pick(o, ...paths) ?? "").slice(0, 300);
export function normalizeLive(row) {
  const start = timestamp(
    pick(
      row,
      "live.openDate",
      "liveStartDate",
      "liveOpenDate",
      "openDate",
      "startDate",
      "startTime",
      "liveStartTime",
    ),
  );
  const end = timestamp(
    pick(
      row,
      "live.closeDate",
      "liveEndDate",
      "liveCloseDate",
      "closeDate",
      "endDate",
      "endTime",
      "liveEndTime",
    ),
  );
  const seconds = num(
    row,
    "liveStatDetail.duration",
    "liveDuration",
    "duration",
    "liveTime",
    "durationSeconds",
  );
  const finish = end ?? (start && seconds > 0 ? start + seconds * 1000 : null);
  if (!start || !finish || finish <= start || finish - start > 7 * DAY)
    return null;
  const stat = (...keys) => {
    const value = pick(row, ...keys);
    return value != null && Number.isFinite(Number(value))
      ? Number(value)
      : null;
  };
  return {
    id: text(row, "live.liveId", "liveId", "id") || String(start),
    start,
    end: finish,
    title: text(row, "live.liveTitle", "liveTitle", "title"),
    category: text(
      row,
      "live.liveCategoryValue",
      "liveCategoryValue",
      "categoryValue",
      "categoryName",
      "videoCategoryValue",
    ),
    averageViewers: stat("liveStatDetail.avgCv", "averageConcurrentUserCount"),
    peakViewers: stat("liveStatDetail.peakCv", "maxConcurrentUserCount"),
    visitors: stat("liveStatDetail.uv", "totalUserCount"),
    views: stat("liveStatDetail.pv"),
    averageWatchSeconds: stat("liveStatDetail.avgKeepWatchingTime"),
  };
}
export function normalizePerson(row) {
  const id = text(row, "userIdHash", "user.userIdHash", "userId");
  if (!CHANNEL_ID.test(id)) return null;
  return {
    id,
    name: text(row, "nickname", "user.nickname", "userName") || id.slice(0, 8),
    months:
      num(row, "totalMonth", "accumulativeMonth", "month") +
      num(row, "otherPlatformMonth"),
    tier: num(row, "tier", "tierNo"),
    followedAt: timestamp(
      pick(row, "followDate", "createdDate", "followingDate"),
    ),
    subscribedAt: timestamp(
      pick(row, "subscribeDate", "subscriptionDate", "createdDate"),
    ),
  };
}
export function normalizeDonation(row, keepText = false) {
  const time = timestamp(
    pick(row, "donationTime", "createdDate", "payDate", "purchaseDate"),
  );
  if (!time) return null;
  const anonymous = [
    "anonymous",
    "isAnonymous",
    "anonymousYn",
    "isAnonymousDonation",
    "anonymousDonation",
    "leaveUser",
  ].some((k) => [true, 1, "1", "Y", "true"].includes(row[k]));
  const id = text(row, "userIdHash");
  const identified = !anonymous && CHANNEL_ID.test(id);
  const amount = Math.max(
    0,
    num(row, "payAmount", "amount") - num(row, "refundmentAmount"),
  );
  const status = text(row, "paymentStatus");
  if (/CANCEL|REFUND_COMPLETE|FAILED|FAILURE/.test(status)) return null;
  const message = text(row, "donationText", "message"),
    kind = text(row, "donationType") || "UNKNOWN",
    subtype = text(row, "donationSubType");
  const video = text(row, "donationVideoDescription");
  return {
    id:
      text(row, "donationId", "id") ||
      JSON.stringify([
        time,
        identified ? id : "anonymous",
        amount,
        kind,
        subtype,
      ]),
    time,
    amount,
    viewerId: identified ? id : null,
    name: identified
      ? text(row, "nickname") || id.slice(0, 8)
      : "익명 / 식별 안 됨",
    kind,
    subtype,
    rules: classify(message),
    silent: !message.trim(),
    clip: /chzzk|치지직/i.test(video),
    externalVideo: kind === "VIDEO" && !/chzzk|치지직/i.test(video),
    ...(keepText && identified ? { message } : {}),
  };
}
export function normalizeGift(row) {
  const time = timestamp(
    pick(
      row,
      "createdDate",
      "giftDate",
      "sendDate",
      "purchaseDate",
      "createdTime",
    ),
  );
  if (!time) return null;
  const id = text(row, "userIdHash", "sender.userIdHash");
  const anonymous = [
    "anonymous",
    "isAnonymous",
    "anonymousYn",
    "leaveUser",
  ].some((k) => [true, 1, "Y", "true"].includes(row[k]));
  const viewerId = !anonymous && CHANNEL_ID.test(id) ? id : null;
  return {
    id:
      text(row, "id", "giftId") ||
      JSON.stringify([
        time,
        viewerId,
        num(row, "quantity", "giftCount", "count"),
      ]),
    time,
    viewerId,
    name: viewerId
      ? text(row, "nickname", "sender.nickname") || id.slice(0, 8)
      : "익명 / 식별 안 됨",
    count: num(row, "quantity", "giftCount", "count", "subscriptionCount"),
    paidAmount: num(row, "payAmount", "paymentAmount"),
  };
}
export function newChatSummary() {
  return {
    count: 0,
    chars: 0,
    laughChars: 0,
    hours: Array(24).fill(0),
    weekdays: Array(7).fill(0),
    rules: {},
    days: {},
    bins: {},
    first: null,
    last: null,
    examples: [],
    emotes: [],
  };
}
function parsed(v) {
  if (v && typeof v === "object") return v;
  try {
    return JSON.parse(v ?? "{}");
  } catch {
    return {};
  }
}
export function accumulateChat(
  summary,
  message,
  { keepExamples = false, start = null, duration = 0 } = {},
) {
  const t = timestamp(message.messageTime ?? message.messageTimeLong),
    content = message.content ?? message.message;
  if (
    !t ||
    typeof content !== "string" ||
    !content.trim() ||
    (message.messageTypeCode != null &&
      Number(message.messageTypeCode) !== 1) ||
    (message.messageStatusType && message.messageStatusType !== "NORMAL")
  )
    return false;
  summary.count++;
  summary.chars += content.length;
  summary.laughChars += Math.min(20, (content.match(/ㅋ/g) ?? []).length);
  const kst = new Date(t + 9 * HOUR);
  summary.hours[kst.getUTCHours()]++;
  summary.weekdays[kst.getUTCDay()]++;
  summary.days[dayKey(t)] = true;
  summary.first = Math.min(summary.first ?? t, t);
  summary.last = Math.max(summary.last ?? t, t);
  for (const rule of classify(content))
    summary.rules[rule] = (summary.rules[rule] ?? 0) + 1;
  if (start && duration > 0 && t >= start && t < start + duration * 1000)
    summary.bins[Math.floor((t - start) / 600000)] = true;
  for (const token of content.match(/\{:[^}]+:\}/g) ?? [])
    if (summary.emotes.length < 100 && !summary.emotes.includes(token))
      summary.emotes.push(token);
  if (
    keepExamples &&
    summary.examples.length < 3 &&
    content.length <= 200 &&
    !summary.examples.includes(content)
  )
    summary.examples.push(content);
  return true;
}
export function mergeSummary(target, source) {
  target.count += source.count;
  target.chars += source.chars;
  target.laughChars += source.laughChars;
  for (let h = 0; h < 24; h++) target.hours[h] += source.hours[h];
  for (let d = 0; d < 7; d++) target.weekdays[d] += source.weekdays[d];
  for (const [k, v] of Object.entries(source.rules))
    target.rules[k] = (target.rules[k] ?? 0) + v;
  Object.assign(target.days, source.days);
  if (source.first)
    target.first = Math.min(target.first ?? source.first, source.first);
  if (source.last)
    target.last = Math.max(target.last ?? source.last, source.last);
  target.examples = [
    ...new Set([...target.examples, ...source.examples]),
  ].slice(0, 3);
  target.emotes = [...new Set([...target.emotes, ...source.emotes])].slice(
    0,
    100,
  );
}
export function messagePerson(message) {
  const p = parsed(message.profile);
  const id = String(message.userIdHash ?? "");
  return CHANNEL_ID.test(id)
    ? {
        id,
        name: String(p.nickname ?? id.slice(0, 8)),
        role: String(p.userRoleCode ?? ""),
      }
    : null;
}
export function streak(keys) {
  let best = 0,
    current = 0,
    last = -Infinity;
  for (const key of [...new Set(keys)].sort()) {
    const d = Date.parse(key);
    current = d - last === DAY ? current + 1 : 1;
    best = Math.max(best, current);
    last = d;
  }
  return best;
}
export function buildBroadcastReport(data) {
  const lives = [...(data.lives ?? [])].sort((a, b) => a.start - b.start),
    days = new Map();
  let previous;
  for (const live of lives) {
    const day =
      previous &&
      live.start - previous.end >= 0 &&
      live.start - previous.end <= 1800000
        ? previous.day
        : dayKey(live.start);
    previous = { ...live, day };
    const row = days.get(day) ?? {
      day,
      seconds: 0,
      lives: [],
      cheese: 0,
      gifts: 0,
      roulette: 0,
      donors: new Set(),
      donations: 0,
    };
    row.seconds += (live.end - live.start) / 1000;
    row.lives.push(live);
    days.set(day, row);
  }
  const active = [...days.values()].filter((d) => d.seconds >= 900);
  const findDay = (t) =>
    active.find((d) =>
      d.lives.some((l) => t >= l.start - 600000 && t <= l.end + 600000),
    );
  let offStreamCheese = 0;
  for (const d of data.donations ?? []) {
    const row = findDay(d.time);
    if (!row) {
      offStreamCheese += d.amount;
      continue;
    }
    row.cheese += d.amount;
    row.donations++;
    if (d.viewerId) row.donors.add(d.viewerId);
    if (d.rules.includes("roulette") || /ROULETTE/.test(d.kind))
      row.roulette += d.amount;
  }
  for (const g of data.gifts ?? []) {
    const row = findDay(g.time);
    if (row) row.gifts += g.count;
  }
  const typical = median(active.map((d) => d.cheese)),
    positive = active.filter((d) => d.cheese > 0),
    mean = positive.length
      ? sum(positive.map((d) => d.cheese)) / positive.length
      : 0;
  for (const row of active) {
    row.donors = row.donors.size;
    row.group = !row.cheese
      ? "후원 없음"
      : mean > 0 && row.cheese >= mean * 4
        ? "큰 이벤트일"
        : typical > 0 && row.cheese >= typical * 2
          ? "후원이 많은 날"
          : typical > 0 && row.cheese < typical * 0.5
            ? "후원이 적은 날"
            : "보통의 날";
  }
  const heat = Array.from({ length: 7 }, () => Array(24).fill(0)),
    hours = Array(24).fill(0),
    weekdays = Array(7).fill(0),
    categories = {};
  for (const l of lives) {
    weekdays[new Date(l.start + 9 * HOUR).getUTCDay()]++;
    categories[l.category || "미분류"] =
      (categories[l.category || "미분류"] ?? 0) + (l.end - l.start) / 1000;
    for (let t = l.start; t < l.end; ) {
      const next = Math.min(l.end, (Math.floor(t / HOUR) + 1) * HOUR),
        d = new Date(t + 9 * HOUR),
        secs = (next - t) / 1000;
      heat[d.getUTCDay()][d.getUTCHours()] += secs;
      hours[d.getUTCHours()] += secs;
      t = next;
    }
  }
  const months = {};
  for (const d of active) {
    const key = d.day.slice(0, 7),
      row = (months[key] ??= {
        month: key,
        days: 0,
        seconds: 0,
        cheese: 0,
        gifts: 0,
        roulette: 0,
      });
    row.days++;
    for (const k of ["seconds", "cheese", "gifts", "roulette"]) row[k] += d[k];
  }
  return {
    days: active,
    lives,
    hours,
    heat,
    weekdays,
    categories,
    months: Object.values(months).sort((a, b) =>
      b.month.localeCompare(a.month),
    ),
    totalSeconds: sum(active.map((d) => d.seconds)),
    medianSeconds: median(active.map((d) => d.seconds)),
    medianCheese: typical,
    meanCheese: active.length
      ? sum(active.map((d) => d.cheese)) / active.length
      : 0,
    offStreamCheese,
  };
}
export function buildViewerReport(
  data,
  { recentDays = 0, now = Date.now() } = {},
) {
  const viewers = new Map(),
    ensure = (id, name) => {
      if (!viewers.has(id))
        viewers.set(id, {
          id,
          name: name || id.slice(0, 8),
          chat: newChatSummary(),
          studioCount: null,
          months: 0,
          followedAt: null,
          donations: 0,
          cheese: 0,
          gifts: 0,
          donationDays: {},
          maxDonation: 0,
          silent: 0,
          video: 0,
          clip: 0,
          mission: 0,
          roulette: 0,
          attendance: 0,
          engagementBins: 0,
          early: 0,
          late: 0,
          full: 0,
        });
      return viewers.get(id);
    };
  for (const p of data.subscribers ?? [])
    Object.assign(ensure(p.id, p.name), {
      months: p.months,
      subscribedAt: p.subscribedAt,
    });
  for (const p of data.followers ?? [])
    Object.assign(ensure(p.id, p.name), { followedAt: p.followedAt });
  let replaySeconds = 0,
    scanned = 0,
    complete = 0;
  for (const replay of Object.values(data.replayStats ?? {})) {
    if (
      data.range &&
      replay.start &&
      (calendarDay(replay.start) < data.range.from ||
        calendarDay(replay.start) > data.range.to)
    )
      continue;
    if (!replay.pages) continue;
    scanned++;
    if (replay.done) complete++;
    replaySeconds += replay.duration || 0;
    let earliest = Infinity;
    for (const v of Object.values(replay.viewers))
      if (v.chat.first) earliest = Math.min(earliest, v.chat.first);
    for (const [id, source] of Object.entries(replay.viewers)) {
      const v = ensure(id, source.name);
      mergeSummary(v.chat, source.chat);
      v.attendance++;
      v.engagementBins += Object.keys(source.chat.bins).length;
      // End-of-stream awards require a fully scanned replay and known start/end.
      if (replay.done && replay.start) {
        if (source.chat.first === earliest) v.early++;
        const early = source.chat.first <= replay.start + 600000,
          late =
            source.chat.last >= replay.start + replay.duration * 1000 - 600000;
        if (late) v.late++;
        if (early && late) v.full++;
      }
    }
  }
  for (const [id, item] of Object.entries(data.details ?? {})) {
    const v = ensure(id, item.name);
    v.detailChat = item.chat;
  }
  for (const [id, count] of Object.entries(data.chatCounts ?? {}))
    ensure(id).studioCount = count;
  for (const [id, activity] of Object.entries(data.moderation ?? {}))
    ensure(id).moderation = activity;
  for (const d of data.donations ?? []) {
    if (!d.viewerId) continue;
    const v = ensure(d.viewerId, d.name);
    v.donations++;
    v.cheese += d.amount;
    v.maxDonation = Math.max(v.maxDonation, d.amount);
    const key = dayKey(d.time);
    v.donationDays[key] = (v.donationDays[key] ?? 0) + d.amount;
    v.lastDonation = Math.max(v.lastDonation ?? 0, d.time);
    if (d.silent) v.silent++;
    if (d.externalVideo) v.video++;
    if (d.clip) v.clip++;
    if (d.rules.includes("mission") || /MISSION/.test(d.kind)) v.mission++;
    if (d.rules.includes("roulette") || /ROULETTE/.test(d.kind)) v.roulette++;
  }
  for (const g of data.gifts ?? []) {
    if (g.viewerId) {
      const v = ensure(g.viewerId, g.name);
      v.gifts += g.count;
      v.lastGift = Math.max(v.lastGift ?? 0, g.time);
    }
  }
  let list = [...viewers.values()];
  for (const v of list) {
    v.analyzed = v.detailChat?.count ? v.detailChat : v.chat;
    v.count = v.studioCount ?? v.chat.count;
    v.last = Math.max(
      v.analyzed.last ?? 0,
      v.lastDonation ?? 0,
      v.lastGift ?? 0,
    );
    v.attendanceRate = scanned ? v.attendance / scanned : 0;
    v.engagementRate = replaySeconds
      ? Math.min(1, (v.engagementBins * 600) / replaySeconds)
      : 0;
    v.chatStreak = streak(Object.keys(v.analyzed.days));
    v.donationStreak = streak(Object.keys(v.donationDays));
    v.maxDayCheese = Math.max(0, ...Object.values(v.donationDays));
    v.activities = [
      v.chat.count,
      v.cheese,
      v.video,
      v.mission,
      v.gifts,
      v.months,
      v.followedAt,
    ].filter(Boolean).length;
  }
  if (recentDays) list = list.filter((v) => v.last >= now - recentDays * DAY);
  return {
    viewers: list,
    scanned,
    complete,
    replaySeconds,
    chatLines: sum(list.map((v) => v.chat.count)),
  };
}
export const AWARDS = [
  [
    "attendance",
    "자주 남긴 발자국",
    "출석한 다시보기 수",
    "회",
    (v) => v.attendance,
  ],
  [
    "count",
    "대화의 중심",
    "스튜디오 누적 채팅 수 우선, 없으면 수집한 다시보기 수",
    "줄",
    (v) => v.count,
  ],
  ["cheese", "든든한 응원", "식별 가능한 후원 합계", "치즈", (v) => v.cheese],
  ["gifts", "구독 선물", "구독권 선물 수", "장", (v) => v.gifts],
  ["months", "오래 함께", "현재 구독 누적 개월", "개월", (v) => v.months],
  [
    "follow",
    "오랜 팔로우",
    "조회 시점부터 팔로우 경과 일수",
    "일",
    (v) =>
      v.followedAt
        ? Math.max(0, Math.floor((Date.now() - v.followedAt) / DAY))
        : 0,
  ],
  [
    "streak",
    "이어지는 대화",
    "방송일(05시 경계) 기준 연속 채팅일",
    "일",
    (v) => v.chatStreak,
  ],
  [
    "bins",
    "대화가 이어진 구간",
    "메시지가 있는 다시보기 10분 칸. 실제 시청시간 아님",
    "칸",
    (v) => v.engagementBins,
  ],
  [
    "early",
    "가장 이른 인사",
    "끝까지 조회된 다시보기의 첫 채팅",
    "회",
    (v) => v.early,
  ],
  [
    "late",
    "마지막까지 대화",
    "끝까지 조회된 다시보기 종료 전 10분에 메시지",
    "회",
    (v) => v.late,
  ],
  [
    "full",
    "처음과 끝의 인사",
    "처음/끝 10분 모두 메시지가 남은 완전 조회 다시보기",
    "회",
    (v) => v.full,
  ],
  ["donations", "꾸준한 후원", "익명 제외 후원 건수", "회", (v) => v.donations],
  [
    "maxDonation",
    "한 번의 큰 응원",
    "가장 큰 단일 후원",
    "치즈",
    (v) => v.maxDonation,
  ],
  [
    "maxDay",
    "하루의 응원",
    "방송일별 후원 합계 중 최대",
    "치즈",
    (v) => v.maxDayCheese,
  ],
  [
    "donStreak",
    "이어지는 응원",
    "방송일 기준 연속 후원일",
    "일",
    (v) => v.donationStreak,
  ],
  ["silent", "말없이 응원", "메시지 없는 후원 건수", "회", (v) => v.silent],
  ["video", "영상 큐레이터", "치지직 클립 외 영상 후원", "회", (v) => v.video],
  ["clip", "클립 큐레이터", "치지직으로 표시된 클립 후원", "회", (v) => v.clip],
  [
    "mission",
    "미션 제안",
    "명시된 종류 또는 메시지 키워드. 실패 여부는 판단 안 함",
    "회",
    (v) => v.mission,
  ],
  [
    "roulette",
    "룰렛 참여",
    "명시된 종류 또는 메시지 키워드",
    "회",
    (v) => v.roulette,
  ],
  [
    "night",
    "새벽의 대화",
    "한국 시간 00~05시 분석 메시지",
    "줄",
    (v) => sum(v.analyzed.hours.slice(0, 6)),
  ],
  [
    "weekend",
    "주말의 대화",
    "토요일/일요일 분석 메시지",
    "줄",
    (v) => v.analyzed.weekdays[0] + v.analyzed.weekdays[6],
  ],
  [
    "length",
    "긴 이야기",
    "분석 메시지 총 글자 수",
    "자",
    (v) => v.analyzed.chars,
  ],
  [
    "laughChars",
    "웃음의 길이",
    "메시지당 최대 20개의 ㅋ",
    "개",
    (v) => v.analyzed.laughChars,
  ],
  [
    "variety",
    "다양한 이모티콘",
    "관측한 치지직 이모티콘 종류, 최대 100개",
    "종",
    (v) => v.analyzed.emotes.length,
  ],
  [
    "activities",
    "여러 방식의 참여",
    "채팅·후원·영상·미션·선물·구독·팔로우 확인 종류",
    "종",
    (v) => v.activities,
  ],
  ...RULES.map(([id, label]) => [
    "rule-" + id,
    label,
    `공개된 정규식에 맞는 분석 메시지 수. 문맥 오분류 가능`,
    "줄",
    (v) => v.analyzed.rules[id] ?? 0,
  ]),
];
export function rankedAwards(viewers) {
  return AWARDS.map(([id, title, basis, unit, fn]) => ({
    id,
    title,
    basis,
    unit,
    money: ["cheese", "maxDonation", "maxDay"].includes(id),
    donation: [
      "cheese",
      "maxDonation",
      "maxDay",
      "gifts",
      "donations",
      "donStreak",
      "silent",
      "video",
      "clip",
      "mission",
      "roulette",
    ].includes(id),
    rows: viewers
      .map((v) => ({ id: v.id, name: v.name, value: fn(v) }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "ko"))
      .slice(0, 10),
  }));
}
export function viewerInsights(account) {
  const result = newChatSummary();
  for (const chat of account?.chats ?? [])
    accumulateChat(result, { messageTime: chat.time, content: chat.text });
  const styles = RULES.map(([id, label]) => ({
    id,
    label,
    count: result.rules[id] ?? 0,
  }))
    .filter((x) => x.count)
    .sort((a, b) => b.count - a.count);
  const rooms = {};
  for (const row of account?.chats ?? []) {
    rooms[row.channelId] ??= { name: row.channelName, count: 0 };
    rooms[row.channelId].count++;
  }
  const ranked = Object.values(rooms).sort((a, b) => b.count - a.count),
    share = result.count ? (ranked[0]?.count ?? 0) / result.count : 0;
  return {
    chat: result,
    styles,
    rooms: ranked,
    title: !result.count
      ? "기록을 기다리는 중"
      : share >= 0.75
        ? "한 채널에 이야기를 모으는 시청자"
        : "여러 채널에 이야기를 나누는 시청자",
    explanation: result.count
      ? `수집된 내 채팅 ${result.count.toLocaleString("ko-KR")}개 중 가장 많이 채팅한 채널의 비중은 ${Math.round(share * 100)}%입니다. 성격이나 전체 시청 성향을 판정하지 않습니다.`
      : "채팅을 수집하면 공개된 규칙으로 집계합니다.",
  };
}
