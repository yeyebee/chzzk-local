import { initializeStreamer, renderStreamer } from "./streamer.mjs";
import { initializePrivacy, renderPrivacy } from "./privacy.mjs";
import { viewerInsights } from "../core/analysis.mjs";
import { demoStreamer } from "./demo.mjs";
import { summaries } from "../core/core.mjs";
import { paginate } from "./pagination.mjs";
import { streamerEnabled } from "../core/preferences.mjs";
import { collectionOptions } from "../core/collection-options.mjs";
const $ = (id) => document.getElementById(id);
let state = { account: null, tracking: false },
  demo = false,
  page = 0,
  collectionAccount,
  toastTimer;
const pageSize = 40;
const n = (value) => Number(value || 0).toLocaleString("ko-KR");
const time = (value) =>
  new Date(value).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const duration = (ms) =>
  `${Math.floor(ms / 3600000)}시간 ${Math.floor((ms % 3600000) / 60000)}분`;
function el(tag, text, cls) {
  const e = document.createElement(tag);
  if (text != null) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}
function empty(parent, message) {
  const box = el("div", null, "empty");
  box.append(el("span", "◌", "empty-icon"), el("span", message));
  parent.replaceChildren(box);
}
function toast(text) {
  clearTimeout(toastTimer);
  $("toast").textContent = text;
  $("toast").hidden = false;
  toastTimer = setTimeout(() => ($("toast").hidden = true), 6500);
}
async function call(name, payload) {
  return window.localApp.call(name, payload);
}
function action(id, fn) {
  $(id).addEventListener("click", async () => {
    try {
      await fn();
    } catch (e) {
      toast(e.message);
    }
  });
}
function tab(name) {
  if (name === "streamer" && !demo && !streamerEnabled(state.account))
    name = "overview";
  if (name === "streamer") renderStreamer(state, demo);
  if (name === "privacy") renderPrivacy(state);
  document.querySelectorAll(".tab").forEach((e) => (e.hidden = e.id !== name));
  document
    .querySelectorAll(".nav")
    .forEach((e) => e.classList.toggle("active", e.dataset.tab === name));
  $("page-name").textContent = document
    .querySelector(`[data-tab="${name}"]`)
    .textContent.trim()
    .replace(/^[^가-힣]+/, "")
    .replace(/\s+\d+$/, "");
}
document
  .querySelectorAll("[data-tab]")
  .forEach((e) => e.addEventListener("click", () => tab(e.dataset.tab)));
document
  .querySelectorAll("[data-go]")
  .forEach((e) => e.addEventListener("click", () => tab(e.dataset.go)));
function ranking(id, list, value, format, emptyText) {
  const target = $(id);
  target.replaceChildren();
  if (!list.length) {
    empty(target, emptyText);
    return;
  }
  const max = list.reduce((max, row) => Math.max(max, row[value]), 1);
  list.slice(0, 6).forEach((r, i) => {
    const row = el("div", null, "rank"),
      bar = el("div", null, "rank-bar"),
      fill = el("i");
    fill.style.width = `${Math.max(1, (r[value] / max) * 100)}%`;
    bar.append(fill);
    row.append(
      el("span", String(i + 1).padStart(2, "0"), "rank-index"),
      el("span", r.name, "rank-label"),
      el("span", format(r[value]), "rank-value"),
      bar,
    );
    target.append(row);
  });
}
function recent(chats) {
  const target = $("recent-chats");
  target.replaceChildren();
  if (!chats.length) {
    empty(target, "계정을 연결하고 기록을 가져오면 내 채팅이 여기에 모입니다.");
    return;
  }
  chats.slice(0, 4).forEach((c) => {
    const row = el("div", null, "chat-row"),
      body = el("div"),
      heading = el("div");
    heading.append(el("strong", c.channelName), el("time", time(c.time)));
    body.append(heading, el("p", c.text));
    row.append(el("span", c.channelName.slice(0, 1), "avatar"), body);
    target.append(row);
  });
}
function history(account) {
  const target = $("collection-history");
  target.replaceChildren();
  if (!account?.history.length) {
    empty(target, "수집을 시작하면 조회 범위와 결과를 표시합니다.");
    return;
  }
  for (const h of account.history.slice(0, 5)) {
    const box = el("div", null, "history-item");
    box.append(
      el(
        "strong",
        `${time(h.startedAt)} · ${{ complete: "조회 완료", partial: "일부 조회 / 범위 제한", cancelled: "중지", error: "오류" }[h.status] ?? h.status}`,
      ),
    );
    box.append(
      el(
        "p",
        `다시보기 ${n(h.videos)}개 탐색 · 채팅 ${n(h.pages)}페이지 조회 · ${n(h.completed)}개 다시보기 끝까지 조회`,
      ),
    );
    if (h.collectionMode) {
      box.append(
        el(
          "p",
          `${h.collectionMode === "continuation" ? "채팅 이어서 수집" : "목록 갱신 + 채팅 수집"} · 실행 한도 ${n(h.pageBudget)}페이지 · ${n(h.resumed)}개 이어 읽음 · ${n(h.skipped)}개 완료 기록 건너뜀`,
        ),
      );
    }
    if (h.warnings?.length) {
      const list = el("ul");
      const counts = new Map();
      for (const warning of h.warnings)
        counts.set(warning, (counts.get(warning) ?? 0) + 1);
      for (const [warning, count] of counts)
        list.append(el("li", warning + (count > 1 ? ` (${n(count)}회)` : "")));
      box.append(list);
    }
    target.append(box);
  }
}
function channels(account) {
  const target = $("follow-list");
  target.replaceChildren();
  $("follow-count").textContent = `${n(account?.follows.length)}개`;
  const query = $("follow-search").value.trim().toLowerCase();
  const follows = (account?.follows ?? []).filter((c) =>
    c.name.toLowerCase().includes(query),
  );
  paginate(
    target,
    follows,
    (visible) => {
      const grid = el("div", null, "channel-grid");
      if (!visible.length) empty(grid, "조건에 맞는 채널이 없습니다.");
      for (const c of visible) {
        const b = el("button", null, "channel-tile");
        b.append(
          el("strong", c.name),
          el(
            "small",
            c.followedAt
              ? new Date(c.followedAt).toLocaleDateString("ko-KR", {
                  timeZone: "Asia/Seoul",
                }) + "부터 팔로우"
              : "채널 열기 ↗",
          ),
        );
        b.addEventListener("click", () => {
          if (demo) {
            toast("예시 채널입니다.");
            return;
          }
          call("openChannel", c.id).catch((e) => toast(e.message));
        });
        grid.append(b);
      }
      return grid;
    },
    { pageSize: 60, scope: (account?.me.id ?? "") + ":" + query },
  );
  for (const [id, key] of [
    ["sub-list", "subscriptions"],
    ["expired-list", "expiredSubscriptions"],
  ]) {
    const t = $(id);
    paginate(
      t,
      account?.[key] ?? [],
      (visible) => {
        const box = el("div");
        if (!visible.length) empty(box, "조회된 구독 기록이 없습니다.");
        for (const c of visible) box.append(el("p", c.name));
        return box;
      },
      { scope: account?.me.id },
    );
  }
  $("donation-list").replaceChildren();
  const donations = account?.donations ?? [];
  $("donation-total").textContent =
    `조회된 ${n(donations.length)}건 · 합계 ${n(donations.reduce((s, d) => s + d.amount, 0))}치즈`;
  paginate(
    "donation-list",
    donations,
    (visible) => {
      const box = el("div");
      if (!visible.length)
        empty(box, "수집 설정에서 치즈 사용 내역을 선택할 수 있습니다.");
      for (const d of visible)
        box.append(
          el("p", `${d.name} · ${n(d.amount)}치즈 · ${d.description}`),
        );
      return box;
    },
    { pageSize: 30, scope: account?.me.id },
  );
}
function renderChats() {
  let list = state.account?.chats ?? [];
  const query = $("search").value.toLowerCase(),
    room = $("chat-channel").value;
  const from = $("from-date").value
    ? Date.parse($("from-date").value + "T00:00:00+09:00")
    : 0;
  const to = $("to-date").value
    ? Date.parse($("to-date").value + "T23:59:59.999+09:00")
    : Infinity;
  list = list.filter(
    (c) =>
      c.text.toLowerCase().includes(query) &&
      (!room || c.channelId === room) &&
      c.time >= from &&
      c.time <= to,
  );
  const pages = Math.max(1, Math.ceil(list.length / pageSize));
  page = Math.min(page, pages - 1);
  $("chat-count").textContent =
    `${n(list.length)}개 메시지 · 수집된 기록 안에서 검색합니다.`;
  const target = $("chat-table");
  target.replaceChildren();
  for (const c of list.slice(page * pageSize, (page + 1) * pageSize)) {
    const row = el("tr"),
      first = el("td", c.channelName);
    first.append(el("small", time(c.time)));
    const source = el("td");
    if (c.videoNo) {
      const b = el("button", "다시보기 ↗", "subtle");
      b.addEventListener("click", () => {
        if (!demo)
          call("openReplay", {
            videoNo: c.videoNo,
            offsetMs: c.offsetMs,
          }).catch((e) => toast(e.message));
      });
      source.append(b);
    } else
      source.textContent = c.source === "replay" ? "다시보기" : "최근 메시지";
    row.append(first, el("td", c.text), source);
    target.append(row);
  }
  if (!list.length) {
    const tr = el("tr"),
      td = el(
        "td",
        "표시할 채팅이 없습니다. 수집 범위 또는 검색 조건을 확인해 주세요.",
        "empty",
      );
    td.colSpan = 3;
    tr.append(td);
    target.append(tr);
  }
  $("page-info").textContent = `${page + 1} / ${pages}`;
  $("prev").disabled = page === 0;
  $("next").disabled = page + 1 >= pages;
}
function collectionSettings() {
  const account = state.account;
  const key = demo ? "demo" : (account?.me.id ?? null);
  const form = $("collection-form");
  // Restore only on first load/account switch, never over unsaved edits during
  // a progress refresh or a login retry for the same account.
  if (collectionAccount !== key) {
    collectionAccount = key;
    const saved = collectionOptions({
      subscriptions: true,
      ...account?.preferences?.collection,
    });
    for (const [name, value] of Object.entries(saved)) {
      const input = form.elements.namedItem(name);
      if (input.type === "checkbox") input.checked = value;
      else input.value = value;
    }
    form.elements.namedItem("rescan").checked = false;
  }
  const checkpoints = Object.values(account?.checkpoints ?? {});
  const completed = checkpoints.filter((cp) => cp?.done).length;
  $("collection-checkpoints").textContent = checkpoints.length
    ? `이 계정에 저장된 다시보기: 완료 ${n(completed)}개 · 미완료 ${n(checkpoints.length - completed)}개. 선택 채널의 미완료 기록은 최근 목록에서 밀려나도 이어 읽습니다.`
    : "처음 수집한 뒤부터 완료한 다시보기와 읽던 위치를 이 기기에 기억합니다.";
  continuationButton(state.running);
}
function continuationButton(running) {
  const form = $("collection-form");
  $("collect-resume").disabled =
    !!running ||
    demo ||
    !state.account ||
    !form.elements.namedItem("chats").checked ||
    form.elements.namedItem("rescan").checked;
}
function render() {
  collectionSettings();
  const showStreamer = demo || streamerEnabled(state.account);
  document
    .querySelectorAll('[data-tab="streamer"], [data-go="streamer"]')
    .forEach((node) => {
      node.hidden = !showStreamer;
    });
  $("streamer-mode").checked = streamerEnabled(state.account);
  $("streamer-mode").disabled = !state.account || state.running || demo;
  $("streamer-mode-status").textContent = !state.account
    ? "계정 확인 후 설정할 수 있습니다."
    : demo
      ? "예시 화면입니다. 실제 계정 설정은 바뀌지 않습니다."
      : showStreamer
        ? "이 계정에 스트리머 메뉴가 표시됩니다."
        : "이 계정은 시청자용 메뉴를 사용합니다.";
  if (!showStreamer) {
    $("viewer-dialog").close();
    $("viewer-detail").replaceChildren();
    if (!$("streamer").hidden) tab("overview");
  }
  if (!$("streamer").hidden) renderStreamer(state, demo);
  if (!$("privacy").hidden) renderPrivacy(state);
  const insight = viewerInsights(state.account);
  $("viewer-insight-title").textContent = insight.title;
  $("viewer-insight-description").textContent = insight.explanation;
  $("viewer-style-list").replaceChildren(
    ...insight.styles.map((s) => el("span", s.label + " " + n(s.count))),
  );
  renderModeration();
  const a = state.account,
    s = summaries(a);
  $("nickname").textContent = a?.me.nickname ?? "연결할 계정이 없어요";
  $("avatar").textContent = a?.me.nickname?.slice(0, 1) ?? "나";
  $("account-state").textContent = demo
    ? "예시 데이터"
    : a
      ? state.verified
        ? "로그인 확인됨"
        : "저장된 계정 · 재확인 가능"
      : "치지직 로그인 후 시작";
  $("onboarding").hidden = !!a;
  $("demo-banner").hidden = !demo;
  $("metric-watch").textContent = duration(s.watch.totalMs);
  $("metric-chat").textContent = n(a?.chats.length) + "개";
  $("metric-follow").textContent = n(a?.follows.length) + "개";
  $("metric-power").textContent = n(
    a?.power.reduce((sum, r) => sum + r.amount, 0),
  );
  $("nav-chat-count").textContent = n(a?.chats.length);
  ranking(
    "chat-ranking",
    s.rooms,
    "count",
    (v) => n(v) + "개",
    "아직 찾은 채팅이 없습니다.",
  );
  ranking(
    "watch-ranking",
    s.watch.channels,
    "ms",
    duration,
    "재생시간 기록을 켜고 앱에서 시청해 보세요.",
  );
  ranking(
    "power-ranking",
    [...(a?.power ?? [])].sort((a, b) => b.amount - a.amount),
    "amount",
    (v) => n(v),
    "조회된 통나무 파워가 없습니다.",
  );
  $("hour-chart").replaceChildren();
  const max = Math.max(1, ...s.hours);
  for (let h = 0; h < 24; h++) {
    const b = el("div", null, "column" + (s.hours[h] === max ? " hot" : ""));
    b.style.height = `${Math.max(3, (s.hours[h] / max) * 100)}%`;
    b.title = `${h}시 · ${s.hours[h]}개`;
    $("hour-chart").append(b);
  }
  recent(a?.chats ?? []);
  channels(a);
  history(a);
  $("last-updated").textContent = a?.updatedAt
    ? "마지막 조회 " + time(a.updatedAt)
    : "아직 가져온 기록이 없습니다.";
  const selected = $("chat-channel").value;
  $("chat-channel").replaceChildren(new Option("모든 채널", ""));
  for (const c of s.rooms) $("chat-channel").append(new Option(c.name, c.id));
  $("chat-channel").value = selected;
  renderChats();
  $("tracking").checked = !!state.tracking;
  $("tracking").disabled = demo;
  $("tracking-label").textContent = state.tracking ? "켜짐" : "꺼짐";
  $("data-path").textContent = state.dataPath ?? "";
  $("collect-start").disabled = state.running || demo;
  $("collect-top").disabled = state.running || demo;
  if (state.progress) progress(state.progress, false);
}
async function refresh() {
  if (demo) return;
  state = await call("state");
  render();
}
function progress(p, update = true) {
  if (demo) return;
  state.running = !!p.running;
  $("progress").hidden = false;
  const authenticationFailure =
    !p.running && p.status === "error" && [401, 409].includes(p.error?.status);
  const authenticationRecovered =
    authenticationFailure && state.verifiedAt > (p.finishedAt ?? Infinity);
  $("progress").dataset.status = authenticationRecovered
    ? "ready"
    : (p.status ?? "running");
  $("progress-text").textContent = authenticationRecovered
    ? "계정을 확인했습니다. 기록 수집을 다시 시작해 주세요."
    : authenticationFailure
      ? p.error.status === 409
        ? "로그인 계정이 바뀌어 수집을 중지했습니다."
        : "치지직 로그인이 필요해 수집을 시작하지 못했습니다."
      : p.message;
  const reason =
    !p.running && !authenticationRecovered
      ? (p.error?.message ?? p.warnings?.[0])
      : null;
  $("progress-reason").textContent = reason ?? "";
  $("progress-reason").hidden = !reason;
  $("progress-login-actions").hidden =
    !authenticationFailure || authenticationRecovered;
  $("stop").hidden = !p.running;
  $("progress-bar").hidden = !p.running && p.status === "error";
  if (p.running) $("progress-bar").removeAttribute("value");
  else $("progress-bar").value = 1;
  $("progress-detail").textContent =
    `${n(p.pages)}페이지 조회 · ${n(p.videos)}개 다시보기 탐색${p.warnings?.length ? " · 알림 " + p.warnings.length + "개" : ""}`;
  $("stream-start").disabled = !!p.running || !state.account;
  $("streamer-mode").disabled = !!p.running || !state.account || demo;
  $("collect-start").disabled = !!p.running;
  $("collect-top").disabled = !!p.running;
  continuationButton(p.running);
  if (update && !p.running) refresh().catch((e) => toast(e.message));
}
window.localApp.onProgress((p) => progress(p));
for (const id of ["login", "login-settings", "progress-login"])
  action(id, () => call("openLogin"));
for (const id of ["verify", "verify-settings", "progress-verify"])
  action(id, async () => {
    demo = false;
    state = await call("verify");
    render();
    toast(`${state.account.me.nickname} 계정을 확인했습니다.`);
  });
action("refresh", refresh);
$("streamer-mode").addEventListener("change", async () => {
  const enabled = $("streamer-mode").checked;
  try {
    state = await call("streamerMode", enabled);
    render();
    toast(
      enabled
        ? "스트리머 메뉴를 켰습니다."
        : "시청자용 메뉴로 변경했습니다. 보관한 기록은 유지됩니다.",
    );
  } catch (error) {
    $("streamer-mode").checked = streamerEnabled(state.account);
    toast(error.message);
  }
});
action("collect-top", () => tab("settings"));
action("stop", () => call("stop"));
action("export", async () => {
  if (demo) {
    toast("예시 데이터는 내보내지 않습니다.");
    return;
  }
  if (await call("exportJson")) toast("JSON 파일을 저장했습니다.");
});
action("csv", async () => {
  if (demo) {
    toast("예시 데이터는 내보내지 않습니다.");
    return;
  }
  if (await call("exportCsv")) toast("CSV 파일을 저장했습니다.");
});
action("open-data", () => call("openData"));
action("logout", async () => {
  state = await call("logout");
  demo = false;
  render();
  toast(
    state.runtime === "extension"
      ? "확장 계정 연결을 해제했습니다. 브라우저 로그인과 저장 기록은 유지됩니다."
      : "앱의 로그인 세션을 지웠습니다. 저장 기록은 유지됩니다.",
  );
});
action("erase", async () => {
  const result = await call("erase");
  if (result) {
    state = result;
    demo = false;
    $("progress").hidden = true;
    render();
    toast(
      state.runtime === "extension"
        ? "확장에 저장한 기록을 삭제했습니다. 일반 브라우저 로그인은 유지됩니다."
        : "앱에 저장한 기록과 로그인 세션을 삭제했습니다.",
    );
  }
});
$("tracking").addEventListener("change", async () => {
  try {
    state = await call("tracking", $("tracking").checked);
    render();
  } catch (e) {
    $("tracking").checked = state.tracking;
    toast(e.message);
  }
});
$("collection-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (demo) return;
  const formElement = e.currentTarget;
  const form = new FormData(formElement),
    options = Object.fromEntries(form.entries());
  for (const key of [
    "chats",
    "subscriptions",
    "donations",
    "rescan",
    "moderation",
  ])
    options[key] = form.has(key);
  options.resumeOnly = e.submitter?.id === "collect-resume";
  try {
    await call("collect", options);
    formElement.elements.namedItem("rescan").checked = false;
    toast(
      options.resumeOnly
        ? "목록 갱신 없이 다시보기 채팅을 이어서 수집합니다."
        : "목록을 갱신하고 채팅 수집을 시작합니다.",
    );
  } catch (e) {
    toast(e.message);
  }
});
$("collection-form").addEventListener("change", () =>
  continuationButton(state.running),
);
$("follow-search").addEventListener("input", () => channels(state.account));
for (const id of ["search", "chat-channel", "from-date", "to-date"])
  $(id).addEventListener("input", () => {
    page = 0;
    renderChats();
  });
action("prev", () => {
  page--;
  renderChats();
});
action("next", () => {
  page++;
  renderChats();
});
action("demo", () => {
  demo = true;
  const now = Date.now(),
    names = ["작은 숲 라디오", "오늘의 플레이", "느린 작업실"],
    ids = ["a".repeat(32), "b".repeat(32), "c".repeat(32)];
  const chats = Array.from({ length: 84 }, (_, i) => ({
    channelId: ids[i % 3],
    channelName: names[i % 3],
    text: [
      "오늘도 좋은 방송 감사합니다 🌿",
      "ㅋㅋㅋㅋ 이 장면 정말 재밌네요",
      "작업하면서 듣기 너무 좋아요",
      "다음 방송도 기다릴게요",
    ][i % 4],
    time: now - i * 2710000,
    source: i % 3 ? "replay" : "recent",
    videoNo: null,
  }));
  state = {
    ...state,
    tracking: false,
    running: false,
    progress: null,
    account: {
      me: { nickname: "기록을 모으는 나", id: "demo" },
      follows: names.map((name, i) => ({
        id: ids[i],
        name,
        followedAt: now - 86400000 * 100,
      })),
      power: names.map((name, i) => ({
        id: ids[i],
        name,
        amount: [12840, 8620, 4270][i],
      })),
      chats,
      watches: names.map((channelName, i) => ({
        channelId: ids[i],
        channelName,
        start: now - (i + 1) * 86400000,
        end: now - (i + 1) * 86400000 + [12600000, 7200000, 3300000][i],
      })),
      subscriptions: [{ name: names[0] }],
      expiredSubscriptions: [],
      donations: [],
      history: [],
      streamer: demoStreamer(),
      updatedAt: now,
    },
  };
  render();
});
action("exit-demo", async () => {
  demo = false;
  await refresh();
});
initializeStreamer(call, toast, (result) => {
  state = result;
  render();
});
initializePrivacy(call, toast);
$("from-year").value = new Date().getFullYear();
$("from-year").max = new Date().getFullYear();
refresh()
  .then(() => {
    document.body.dataset.ready = "true";
  })
  .catch((e) => toast(e.message))
  .finally(() => {
    document.body.inert = false;
  });
setInterval(() => {
  if (!demo && !document.hidden) refresh().catch(() => {});
}, 15000);

function renderModeration() {
  const target = $("my-moderation"),
    t = el("table"),
    head = el("tr");
  for (const text of [
    "채널",
    "활동제한",
    "임시차단",
    "누적 제한 / 임시",
    "조회 시각 / 안내",
  ])
    head.append(el("th", text));
  t.append(head);
  const list = Object.entries(state.account?.moderation ?? {}),
    fmt = (v) =>
      v === true ? "제한 중" : v === false ? "제한 없음" : "조회 불가",
    count = (v) => (v == null ? "조회 불가" : n(v));
  for (const [id, m] of list) {
    const row = el("tr");
    for (const text of [
      m.name ?? id.slice(0, 8),
      fmt(m.restricted),
      fmt(m.temporary),
      count(m.restrictCount) + " / " + count(m.temporaryCount),
      time(m.checkedAt) + (m.reason ? " · " + m.reason : ""),
    ])
      row.append(el("td", text));
    t.append(row);
  }
  target.replaceChildren(t);
  if (!list.length)
    target.append(
      el(
        "p",
        "아직 조회하지 않았습니다. 수집 설정에서 내 차단 상태·횟수를 선택하세요.",
      ),
    );
}
