import { newStreamer } from "../core/streamer.mjs";
import { newChatSummary, accumulateChat, DAY } from "../core/analysis.mjs";
export function demoStreamer() {
  const d = newStreamer(),
    now = Date.now(),
    ids = ["d", "e", "f"].map((c) => c.repeat(32)),
    names = ["새벽산책", "초록연필", "라디오친구"];
  d.storageMode = "full";
  d.range = {
    from: new Date(now - 30 * DAY).toISOString().slice(0, 10),
    to: new Date(now).toISOString().slice(0, 10),
  };
  d.subscribers = ids.map((id, i) => ({
    id,
    name: names[i],
    months: 12 - i * 3,
  }));
  for (let i = 0; i < 6; i++) {
    const start = now - (i + 1) * DAY,
      end = start + (2 + (i % 3)) * 3600000,
      id = String(1000 + i);
    d.lives.push({
      id,
      start,
      end,
      title: ["함께 걷는 저녁", "게임과 수다"][i % 2],
      category: i % 2 ? "게임" : "소통",
      averageViewers: 120 + i * 9,
      peakViewers: 180 + i * 14,
      visitors: 450 + i * 20,
    });
    const r = (d.replayStats[id] = {
      no: id,
      title: d.lives.at(-1).title,
      start,
      duration: (end - start) / 1000,
      pages: 3,
      done: true,
      viewers: {},
      messages: [],
    });
    ids.forEach((uid, j) => {
      const chat = newChatSummary();
      for (let k = 0; k < 10 + j; k++) {
        const m = {
          content: [
            "안녕하세요 반가워요",
            "ㅋㅋㅋㅋ 오늘도 최고",
            "이 게임 어떻게 하나요?",
          ][j],
          messageTime: start + k * 600000,
        };
        accumulateChat(chat, m, {
          keepExamples: true,
          start,
          duration: r.duration,
        });
        r.messages.push({
          viewerId: uid,
          name: names[j],
          time: m.messageTime,
          text: m.content,
        });
      }
      r.viewers[uid] = { name: names[j], chat };
    });
    d.donations.push({
      id: "demo-" + i,
      time: start + 3600000,
      amount: (i + 1) * 1000,
      viewerId: ids[i % 3],
      name: names[i % 3],
      rules: [],
      kind: "CHAT",
      silent: false,
    });
    d.audiences ??= {};
    d.audiences[id] = {
      available: true,
      sex: [
        { code: "MALE", rate: 60 },
        { code: "FEMALE", rate: 40 },
      ],
      ages: [
        { band: "20S", rate: 45 },
        { band: "30S", rate: 55 },
      ],
      loginRate: 80,
      checkedAt: now,
    };
  }
  d.moderation = Object.fromEntries(
    ids.map((id, i) => [
      id,
      {
        count: 500 - i * 90,
        restricted: i === 1,
        temporary: false,
        restrictCount: i,
        temporaryCount: 2 + i,
        checkedAt: now,
        status: "ok",
      },
    ]),
  );
  for (const key of ["lives", "subscribers", "followers", "donations", "gifts"])
    d.sources[key] = { ...d.range, updatedAt: now, status: "ok" };
  d.history = [
    {
      startedAt: now,
      status: "complete",
      requests: 48,
      pages: 18,
      lines: 198,
      warnings: ["화면 확인을 위한 가상 예시입니다. 실계정 기록이 아닙니다."],
    },
  ];
  return d;
}
