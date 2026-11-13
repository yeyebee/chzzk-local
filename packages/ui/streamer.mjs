import {
  buildBroadcastReport,
  buildViewerReport,
  rankedAwards,
  RULES,
  sourceUsable,
  calendarDay,
} from "../core/analysis.mjs";
import { paginate } from "./pagination.mjs";
const $ = (id) => document.getElementById(id),
  n = (x) =>
    x == null
      ? "조회 안 됨"
      : Number(x).toLocaleString("ko-KR", { maximumFractionDigits: 1 });
const date = (t) =>
  t ? new Date(t).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "—";
const withUnit = (value, unit) =>
  value == null ? "조회 안 됨" : n(value) + unit;
const duration = (s) =>
  `${Math.floor(s / 3600)}시간 ${Math.floor((s % 3600) / 60)}분`;
const e = (tag, text, cls) => {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (cls) node.className = cls;
  return node;
};
const status = (x) =>
  x === true ? "제한 중" : x === false ? "제한 없음" : "조회 안 됨";
let current = {},
  invoke,
  toastFn,
  isDemo = false,
  selectedViewer = null,
  listPage = 0,
  formAccount,
  reportViewers = [];
function table(target, headers, rows) {
  paginate(
    target,
    rows,
    (visibleRows) => {
      const t = e("table"),
        head = e("tr"),
        body = e("tbody");
      headers.forEach((x) => head.append(e("th", x)));
      t.append(head);
      for (const row of visibleRows) {
        const tr = e("tr");
        for (const x of row) {
          const td = e("td");
          td.append(
            x instanceof Node ? x : document.createTextNode(String(x ?? "—")),
          );
          tr.append(td);
        }
        body.append(tr);
      }
      if (!rows.length) {
        const tr = e("tr"),
          td = e(
            "td",
            "표시할 기록이 없습니다. 수집 범위와 결과를 확인하세요.",
          );
        td.colSpan = headers.length;
        tr.append(td);
        body.append(tr);
      }
      t.append(body);
      return t;
    },
    { scope: current.account?.me.id },
  );
}
function viewerButton(v) {
  const b = e("button", v.name, "subtle");
  b.addEventListener("click", () => showViewer(v.id));
  return b;
}
export function initializeStreamer(
  call,
  toast,
  onState = (result) => renderStreamer(result),
) {
  invoke = call;
  toastFn = toast;
  $("streamer").innerHTML =
    `<div class="page-title"><div class="eyebrow">MY CHANNEL, MY DATA</div><h1>내 방송과 함께한 사람들<span>.</span></h1><p>스튜디오 이력과 공개 다시보기를 이 기기에서 분석합니다. 채널 소유자로 로그인해 주세요.</p></div>
  <div class="stream-tools"><div class="button-row stream-actions"><button id="studio-open" class="secondary">치지직 스튜디오 열기 ↗</button><button id="stream-export" class="secondary">HTML 리포트 저장</button><button id="stream-purge" class="danger">보관한 원문만 삭제</button></div><fieldset class="stream-export-options"><legend>HTML 공유 파일에 포함할 정보</legend><label class="check"><input id="export-names" type="checkbox"> 닉네임</label><label class="check"><input id="export-money" type="checkbox"> 후원 정보</label><span>기본은 둘 다 제외합니다.</span></fieldset></div>
  <article class="panel"><details id="stream-options" open><summary>조회 범위와 보관 방식</summary><form id="stream-form"><div class="form-grid"><label>시작일<input name="from" id="stream-from" type="date" required></label><label>종료일<input name="to" id="stream-to" type="date" required></label><label>다시보기 개수 한도<input name="replayLimit" type="number" min="1" max="500" value="20"></label><label>다시보기 채팅 페이지 한도<input name="pageBudget" type="number" min="1" max="20000" value="500"></label><label>구독자·팔로워 페이지 한도<input name="memberPages" type="number" min="1" max="200" value="20"></label><label>상세 조회할 시청자 수<input name="viewerLimit" type="number" min="1" max="200" value="50"></label><label>상세 메시지 페이지 한도<input name="detailBudget" type="number" min="1" max="10000" value="300"></label><label>성별·연령 조회할 최신 방송 수<input name="audienceLimit" type="number" min="1" max="100" value="10"></label></div>
  <label class="full-label">시청자 채팅 보관 방식<select id="storage-mode" name="storageMode"><option value="minimal">최소 통계 (MIN) — 원문 저장 안 함</option><option value="examples">예시 문장 — 통계 + 시청자별 소량 예시</option><option value="full">전체 원문 (FULL) — 조회된 메시지의 원문·작성자·시각</option></select></label><p>전체 원문은 이번에 실제 조회한 메시지만 저장합니다. 삭제·미공개 메시지나 수집 상한 밖의 메시지는 포함되지 않습니다. 기존에 통계만 수집한 다시보기의 원문을 원하면 처음부터 재조회를 선택하세요.</p>
  <div class="check-row"><label><input name="finance" type="checkbox"> 받은 후원·구독권 선물</label><label><input name="audience" type="checkbox" checked> 성별·연령 공식 집계</label><label><input name="moderation" type="checkbox" checked> 누적 채팅·차단 정보</label><label><input name="details" type="checkbox"> 시청자별 과거 메시지</label></div>
  <label class="check"><input name="rescan" type="checkbox"> 다시보기·상세 메시지를 처음부터 재조회</label><label class="check"><input name="purgeExisting" type="checkbox"> 최소/예시 방식으로 바꿀 때 기존에 저장한 원문도 삭제 (최소 방식은 예시도 삭제)</label><p>옵션만 변경하면 기존 원문은 유지됩니다. 재조회는 해당 기록을 새 집계로 교체합니다. 전체 JSON 내보내기에는 보관한 원문·식별자가 포함됩니다.</p><button id="stream-start" type="submit" class="primary">내 채널 기록 수집 시작 ↗</button></form></details></article>
  <div id="stream-summary" class="metrics"></div><p id="stream-range" class="caption"></p><div class="mode-bar" id="stream-tabs"><button data-pane="broadcast" class="mode-selected">방송 분석</button><button data-pane="audience">시청자 성별·연령</button><button data-pane="awards">시청자 시상식</button><button data-pane="roster">시청자 목록·차단</button><button data-pane="sources">수집 결과</button></div>
  <section id="pane-broadcast" class="stream-pane"><div class="two-column"><article class="panel"><h2>시간대별 방송 시간</h2><div id="stream-hours" class="hour-chart"></div><div class="chart-axis"><span>00시</span><span>06시</span><span>12시</span><span>18시</span><span>23시</span></div></article><article class="panel"><h2>방송 카테고리</h2><div id="stream-categories"></div></article></div><article class="panel"><h2>요일 × 시간 (한국 시간)</h2><div id="stream-heat" class="heatmap"></div><p>색이 진할수록 해당 요일·시간에 방송한 시간이 많습니다.</p></article><article class="panel"><h2>방송일별 기록</h2><p>오전 5시 경계, 종료 후 30분 이내 재개는 같은 방송일. 15분 미만 방송일 제외.</p><div id="broadcast-days" class="table-scroll"></div></article><article class="panel"><h2>월별 변화</h2><div id="broadcast-months" class="table-scroll"></div></article><article class="panel"><h2>방송별 시청 지표</h2><p>평균·최고 동시 시청자와 순 방문자는 스튜디오가 반환한 수치입니다.</p><div id="broadcast-lives" class="table-scroll"></div></article></section>
  <section id="pane-audience" class="stream-pane" hidden><article class="panel"><h2>방송별 공식 성별·연령 집계</h2><p>개인의 성별·나이를 추정하지 않습니다. 집계 비율을 방송 간 단순 평균하지 않습니다. 비로그인 시청자, 표본·개인정보 기준에 따라 집계가 제공되지 않을 수 있습니다.</p><select id="audience-live" aria-label="성별·연령을 볼 방송"></select><p id="audience-reason"></p><div class="two-column"><div id="audience-sex"></div><div id="audience-age"></div></div></article></section>
  <section id="pane-awards" class="stream-pane" hidden><div class="toolbar"><label>활동 범위 <select id="award-recency"><option value="0">확인된 전체 시청자</option><option value="30">최근 30일 활동 흔적</option><option value="90">최근 90일 활동 흔적</option></select></label><label>후원 표시 <select id="award-money"><option value="hide">후원 관련 상 숨기기</option><option value="show">후원 관련 상 표시</option></select></label></div><p>독립적인 46개 수치·키워드 기준입니다. 출석과 활동 구간은 채팅 흔적이며 실제 시청시간이 아닙니다. 순위는 조회된 사람·자료에 한정됩니다.</p><div id="stream-awards" class="award-grid"></div></section>
  <section id="pane-roster" class="stream-pane" hidden><div class="toolbar"><input id="roster-search" type="search" placeholder="닉네임 검색" aria-label="시청자 검색"><select id="roster-sort" aria-label="시청자 정렬"><option value="months">구독 개월순</option><option value="count">채팅 수순</option><option value="cheese">후원순</option><option value="attendance">출석순</option><option value="temporaryCount">임시차단 횟수순</option><option value="restrictCount">활동제한 횟수순</option></select><select id="roster-restriction" aria-label="차단 상태 필터"><option value="all">모든 상태</option><option value="restricted">현재 활동제한</option><option value="temporary">현재 임시차단</option><option value="history">제한 이력 있음</option><option value="unknown">조회 안 됨 / 불가</option></select></div><p>현재 상태는 조회 시점 기준입니다. 누적 횟수는 기간 필터와 무관한 서버 누적값이며 상세 조회 상한 밖의 시청자는 조회 안 됨으로 표시됩니다.</p><div id="roster-list" class="panel table-scroll"></div><div class="pager"><button id="roster-prev" class="secondary">이전</button><span id="roster-page"></span><button id="roster-next" class="secondary">다음</button></div></section>
  <section id="pane-sources" class="stream-pane" hidden><article class="panel"><h2>자료별 조회 범위와 결과</h2><div id="stream-sources" class="table-scroll"></div><div id="stream-history"></div></article></section>
  <dialog id="viewer-dialog"><button id="viewer-close" class="secondary">닫기</button><div id="viewer-detail"></div></dialog>`;
  $("stream-from").value = calendarDay(Date.now() - 89 * 86400000);
  $("stream-to").value = calendarDay(Date.now());
  $("stream-purge").onclick = async () => {
    if (isDemo) return;
    try {
      const result = await call("purgeStreamerRaw");
      if (result) {
        $("viewer-dialog").close();
        $("viewer-detail").replaceChildren();
        selectedViewer = null;
        onState(result);
        toast(
          "원문·예시·후원 문장을 삭제했습니다. 집계와 이후 보관 방식은 유지됩니다.",
        );
      }
    } catch (error) {
      toast(error.message);
    }
  };
  $("studio-open").onclick = () =>
    call("openStudio").catch((x) => toast(x.message));
  $("stream-form").onsubmit = async (event) => {
    event.preventDefault();
    if (isDemo) return;
    const f = new FormData(event.target),
      o = Object.fromEntries(f);
    for (const k of [
      "finance",
      "audience",
      "moderation",
      "details",
      "purgeExisting",
      "rescan",
    ])
      o[k] = f.has(k);
    try {
      await call("collectStreamer", o);
      toast("스트리머 기록 수집을 시작합니다.");
    } catch (x) {
      toast(x.message);
    }
  };
  $("stream-export").onclick = async () => {
    if (isDemo) {
      toast("예시 데이터는 내보내지 않습니다.");
      return;
    }
    try {
      if (
        await call("exportStreamer", {
          names: $("export-names").checked,
          money: $("export-money").checked,
        })
      )
        toast("HTML 리포트를 저장했습니다.");
    } catch (x) {
      toast(x.message);
    }
  };
  $("stream-tabs").addEventListener("click", (event) => {
    const b = event.target.closest("[data-pane]");
    if (!b) return;
    document
      .querySelectorAll(".stream-pane")
      .forEach((p) => (p.hidden = p.id !== "pane-" + b.dataset.pane));
    $("stream-tabs")
      .querySelectorAll("button")
      .forEach((p) => p.classList.toggle("mode-selected", p === b));
  });
  $("audience-live").onchange = renderAudience;
  for (const id of [
    "roster-search",
    "roster-sort",
    "roster-restriction",
    "award-recency",
    "award-money",
  ])
    $(id).addEventListener("input", () => {
      listPage = 0;
      renderLists();
    });
  $("roster-prev").onclick = () => {
    listPage--;
    renderLists();
  };
  $("roster-next").onclick = () => {
    listPage++;
    renderLists();
  };
  $("viewer-close").onclick = () => {
    $("viewer-dialog").close();
    selectedViewer = null;
  };
}
function renderAudience() {
  const d = current.account?.streamer ?? {},
    a = d.audiences?.[$("audience-live").value];
  $("audience-reason").textContent = a
    ? a.available
      ? `공식 집계 · 로그인 비율 ${a.loginRate == null ? "조회 안 됨" : n(a.loginRate) + "%"} · ${date(a.checkedAt)} 조회`
      : a.reason
    : "아직 조회하지 않았습니다. 성별·연령 옵션으로 수집해 주세요.";
  table(
    "audience-sex",
    ["성별", "비율"],
    (a?.sex ?? []).map((x) => [
      { MALE: "남성", FEMALE: "여성" }[x.code] ?? x.code,
      x.rate == null ? "조회 안 됨" : n(x.rate) + "%",
    ]),
  );
  table(
    "audience-age",
    ["연령대", "비율"],
    (a?.ages ?? []).map((x) => [
      {
        UNDER_20: "20세 미만",
        "20S": "20대",
        "30S": "30대",
        "40S": "40대",
        OVER_50: "50세 이상",
      }[x.band] ?? x.band,
      x.rate == null ? "조회 안 됨" : n(x.rate) + "%",
    ]),
  );
}
function renderLists() {
  const recentDays = Number($("award-recency").value);
  const awardViewers = recentDays
    ? reportViewers.filter((v) => v.last >= Date.now() - recentDays * 86400000)
    : reportViewers;
  const awards = rankedAwards(awardViewers).filter(
    (a) => $("award-money").value === "show" || !a.donation,
  );
  $("stream-awards").replaceChildren();
  for (const a of awards) {
    const box = e("article", null, "panel award");
    box.append(e("h2", a.title), e("p", a.basis));
    if (!a.rows.length) box.append(e("p", "해당하는 관측 기록 없음"));
    else {
      a.rows.slice(0, 3).forEach((v, i) => {
        const p = e("div", null, "award-row");
        p.append(
          e("span", `${i + 1}. `),
          viewerButton(v),
          e("b", n(v.value) + a.unit),
        );
        box.append(p);
      });
      if (a.rows.length > 3) {
        const more = e("details");
        more.append(e("summary", "Top 10 보기"));
        a.rows.slice(3).forEach((v, i) => {
          const p = e("p");
          p.append(
            e("span", `${i + 4}. `),
            viewerButton(v),
            e("span", ` · ${n(v.value)}${a.unit}`),
          );
          more.append(p);
        });
        box.append(more);
      }
    }
    $("stream-awards").append(box);
  }
  let viewers = reportViewers,
    q = $("roster-search").value.toLowerCase(),
    filter = $("roster-restriction").value,
    sort = $("roster-sort").value;
  viewers = viewers
    .filter((v) => v.name.toLowerCase().includes(q))
    .filter((v) => {
      const m = v.moderation;
      return (
        filter === "all" ||
        (filter === "restricted" && m?.restricted === true) ||
        (filter === "temporary" && m?.temporary === true) ||
        (filter === "history" &&
          (m?.restrictCount > 0 || m?.temporaryCount > 0)) ||
        (filter === "unknown" &&
          (!m ||
            m.status !== "ok" ||
            m.restricted == null ||
            m.temporary == null))
      );
    });
  const value = (v) =>
    ["temporaryCount", "restrictCount"].includes(sort)
      ? (v.moderation?.[sort] ?? -1)
      : (v[sort] ?? -1);
  viewers.sort(
    (a, b) => value(b) - value(a) || a.name.localeCompare(b.name, "ko"),
  );
  const pages = Math.max(1, Math.ceil(viewers.length / 50));
  listPage = Math.max(0, Math.min(listPage, pages - 1));
  table(
    "roster-list",
    [
      "시청자",
      "구독",
      "채팅",
      "후원",
      "출석",
      "활동제한",
      "임시차단",
      "제한 / 임시 누적",
    ],
    viewers
      .slice(listPage * 50, listPage * 50 + 50)
      .map((v) => [
        viewerButton(v),
        withUnit(v.months, "개월"),
        n(v.count),
        n(v.cheese),
        n(v.attendance),
        status(v.moderation?.restricted),
        status(v.moderation?.temporary),
        `${n(v.moderation?.restrictCount)} / ${n(v.moderation?.temporaryCount)}`,
      ]),
  );
  $("roster-page").textContent =
    `${listPage + 1} / ${pages} · ${n(viewers.length)}명`;
  $("roster-prev").disabled = listPage === 0;
  $("roster-next").disabled = listPage === pages - 1;
}
function showViewer(id) {
  selectedViewer = id;
  const d = current.account?.streamer ?? {},
    v = reportViewers.find((x) => x.id === id);
  if (!v) return;
  const box = $("viewer-detail");
  box.replaceChildren(
    e("h1", v.name),
    e(
      "p",
      `구독 ${withUnit(v.months, "개월")} · 채팅 ${withUnit(v.count, "줄")} · 후원 ${withUnit(v.cheese, "치즈")} · 선물 ${withUnit(v.gifts, "장")}`,
    ),
    e(
      "p",
      `채팅 수 출처: ${v.studioCount != null ? "스튜디오 누적" : "수집한 다시보기"} / 유형 분석: ${v.detailChat?.count ? "상세 과거 메시지 전체 수집 범위" : "선택 기간 다시보기"}`,
    ),
    e(
      "p",
      `출석 ${v.attendance}개 다시보기 · 활동한 10분 칸 ${v.engagementBins}개 · 마지막 흔적 ${date(v.last)}`,
    ),
  );
  const detail = d.details?.[id];
  if (detail)
    box.append(
      e(
        "p",
        `상세 메시지 갱신: ${date(detail.updatedAt)} · ${!detail.done ? "과거 기록 수집 중" : detail.refresh ? "새 메시지 이어서 조회 필요" : "마지막 조회에서 과거 기록 끝까지 확인"}`,
      ),
    );
  const m = v.moderation;
  box.append(
    e("h2", "제한 정보"),
    e(
      "p",
      `활동제한 ${status(m?.restricted)} / 누적 ${n(m?.restrictCount)}회 · 임시차단 ${status(m?.temporary)} / 누적 ${n(m?.temporaryCount)}회`,
    ),
    e(
      "p",
      m?.reason ??
        (m
          ? date(m.checkedAt) + " 조회"
          : "상세 조회 대상에 아직 포함되지 않았습니다."),
    ),
  );
  const chips = e("div", null, "style-chips");
  for (const [key, label] of RULES)
    if (v.analyzed.rules[key])
      chips.append(e("span", `${label} ${n(v.analyzed.rules[key])}`));
  box.append(e("h2", "키워드별 메시지 수"), chips, e("h2", "보관한 예시 문장"));
  for (const line of v.analyzed.examples) box.append(e("p", line));
  if (!v.analyzed.examples.length)
    box.append(e("p", "보관한 예시가 없습니다."));
  const raw = [
    ...Object.values(d.replayStats ?? {}).flatMap((r) =>
      (r.messages ?? []).filter((m) => m.viewerId === id),
    ),
    ...(d.details?.[id]?.messages ?? []),
  ];
  const unique = [
    ...new Map(raw.map((m) => [JSON.stringify([m.time, m.text]), m])).values(),
  ].sort((a, b) => b.time - a.time);
  box.append(e("h2", `보관한 전체 기간 원문 ${n(unique.length)}줄`));
  const input = e("input");
  input.type = "search";
  input.placeholder = "저장된 원문 검색";
  input.setAttribute("aria-label", "시청자 원문 검색");
  const lines = e("div", null, "raw-lines");
  const render = () => {
    lines.replaceChildren();
    const matches = unique.filter((m) =>
      m.text.toLowerCase().includes(input.value.toLowerCase()),
    );
    lines.append(
      e(
        "p",
        `${n(matches.length)}개 중 최근 200개 표시 · 전체는 JSON 내보내기`,
      ),
    );
    matches
      .slice(0, 200)
      .forEach((m) => lines.append(e("p", date(m.time) + " · " + m.text)));
  };
  input.oninput = render;
  box.append(input, lines);
  render();
  if (!$("viewer-dialog").open) $("viewer-dialog").showModal();
}
export function renderStreamer(state, demo = false) {
  if (current.account?.me.id !== state.account?.me.id) {
    $("viewer-dialog").close();
    $("viewer-detail").replaceChildren();
    selectedViewer = null;
  }
  current = state;
  isDemo = demo;
  const d = state.account?.streamer ?? {},
    b = buildBroadcastReport(d),
    v = buildViewerReport(d);
  reportViewers = v.viewers;
  $("stream-start").disabled = demo || state.running || !state.account;
  $("stream-export").disabled = !state.account?.streamer;
  $("stream-purge").disabled =
    demo || state.running || !state.account?.streamer;
  if (formAccount !== state.account?.me.id) {
    formAccount = state.account?.me.id;
    $("storage-mode").value = d.storageMode ?? "minimal";
  }
  $("stream-summary").replaceChildren();
  for (const [label, value, small] of [
    [
      "방송한 날",
      sourceUsable(d, "lives") ? n(b.days.length) + "일" : "조회 안 됨",
      "15분 이상 방송일",
    ],
    [
      "총 방송 시간",
      sourceUsable(d, "lives") ? duration(b.totalSeconds) : "조회 안 됨",
      "스튜디오 이력",
    ],
    [
      "보통 방송 길이",
      sourceUsable(d, "lives") ? duration(b.medianSeconds) : "조회 안 됨",
      "방송일 길이 중간값",
    ],
    [
      "관측한 시청자",
      n(v.viewers.length) + "명",
      `${v.scanned}개 다시보기 · ${v.complete}개 끝까지 조회`,
    ],
  ]) {
    const card = e("article", null, "metric");
    card.append(e("div", label), e("strong", value), e("small", small));
    $("stream-summary").append(card);
  }
  $("stream-range").textContent =
    `선택 기간: ${d.range ? d.range.from + " ~ " + d.range.to : "아직 수집하지 않음"} · 다시보기 채팅 ${n(v.chatLines)}줄 · 방송 밖 후원 ${b.offStreamCheese != null ? n(b.offStreamCheese) + "치즈" : "조회 안 됨"}. 구독·채팅 누적·상세 메시지는 선택 기간과 범위가 다릅니다. 자료별 조회 범위를 확인하세요.`;
  $("stream-hours").replaceChildren();
  const max = Math.max(1, ...b.hours);
  b.hours.forEach((s, h) => {
    const col = e("div", null, "column");
    col.style.height = Math.max(2, (s / max) * 100) + "%";
    col.title = `${h}시 · ${duration(s)}`;
    $("stream-hours").append(col);
  });
  $("stream-categories").replaceChildren();
  Object.entries(b.categories)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .forEach(([name, s]) =>
      $("stream-categories").append(e("p", name + " · " + duration(s))),
    );
  $("stream-heat").replaceChildren();
  const heatMax = Math.max(1, ...b.heat.flat());
  b.heat.forEach((row, day) => {
    const line = e("div", null, "heat-row");
    line.append(e("span", "일월화수목금토"[day]));
    row.forEach((s, h) => {
      const cell = e("span", s ? "" : "·");
      cell.style.background = `rgba(188,246,116,${0.06 + (0.7 * s) / heatMax})`;
      cell.title = `${"일월화수목금토"[day]} ${h}시 ${duration(s)}`;
      line.append(cell);
    });
    $("stream-heat").append(line);
  });
  const finance = b.financeAvailable,
    gifts = b.giftsAvailable;
  table(
    "broadcast-days",
    ["방송일", "길이", "제목", "후원", "선물", "분류"],
    b.days
      .slice()
      .reverse()
      .map((x) => [
        x.day,
        duration(x.seconds),
        x.lives.map((l) => l.title).join(" / "),
        finance ? n(x.cheese) : "조회 불가 / 안 됨",
        gifts ? n(x.gifts) : "조회 불가 / 안 됨",
        finance ? x.group : "분류 안 됨",
      ]),
  );
  table(
    "broadcast-months",
    ["월", "방송일", "방송 시간", "후원", "선물"],
    b.months.map((x) => [
      x.month,
      x.days,
      duration(x.seconds),
      finance ? n(x.cheese) : "조회 안 됨",
      gifts ? n(x.gifts) : "조회 안 됨",
    ]),
  );
  table(
    "broadcast-lives",
    ["시작", "제목", "평균 동시", "최고 동시", "순 방문자"],
    b.lives
      .slice()
      .reverse()
      .map((x) => [
        date(x.start),
        x.title,
        n(x.averageViewers),
        n(x.peakViewers),
        n(x.visitors),
      ]),
  );
  const previous = $("audience-live").value;
  $("audience-live").replaceChildren(
    ...b.lives
      .slice()
      .reverse()
      .map((l) => new Option(date(l.start) + " · " + l.title, l.id)),
  );
  if ([...$("audience-live").options].some((o) => o.value === previous))
    $("audience-live").value = previous;
  renderAudience();
  renderLists();
  const labels = {
    lives: "방송 이력",
    subscribers: "현재 구독자",
    followers: "팔로워",
    donations: "후원",
    gifts: "구독권 선물",
  };
  table(
    "stream-sources",
    ["자료", "마지막 성공 범위", "조회 결과", "갱신 시각"],
    Object.entries(d.sources ?? {}).map(([k, s]) => [
      labels[k] ?? k,
      ["subscribers", "followers"].includes(k)
        ? "조회 당시 목록"
        : `${s.from ?? "—"} ~ ${s.to ?? "—"}`,
      s.status === "ok"
        ? "조회됨"
        : s.status === "partial"
          ? "부분 수집 · 상한/제외 안내 확인"
          : `실패 · 이전 자료 보관, 현재 통계에서 제외 · ${s.error}`,
      date(s.updatedAt),
    ]),
  );
  $("stream-history").replaceChildren();
  for (const h of (d.history ?? []).slice(0, 5)) {
    const item = e("div", null, "history-item");
    item.append(
      e("strong", date(h.startedAt) + " · " + h.status),
      e(
        "p",
        `${n(h.requests)}개 요청 · ${n(h.pages)}개 다시보기 채팅 페이지 · ${n(h.lines)}줄 신규 집계`,
      ),
    );
    for (const warning of h.warnings ?? []) item.append(e("p", warning));
    $("stream-history").append(item);
  }
}
