import {
  buildBroadcastReport,
  buildViewerReport,
  rankedAwards,
} from "./analysis.mjs";
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function exportStreamerHtml(
  data,
  { names = false, money = false } = {},
) {
  const broadcast = buildBroadcastReport(data),
    viewers = buildViewerReport(data),
    awards = rankedAwards(viewers.viewers);
  const aliases = new Map(
    viewers.viewers.map((v, i) => [
      v.id,
      `시청자 ${String(i + 1).padStart(3, "0")}`,
    ]),
  );
  const display = (value) => (value == null ? "조회 안 됨" : escape(value));
  const label = (v) => escape(names ? v.name : aliases.get(v.id));
  const rows = viewers.viewers
    .sort((a, b) => b.count - a.count)
    .map(
      (v) =>
        `<tr><td>${label(v)}</td><td>${display(v.count)}</td><td>${display(v.months)}</td><td>${display(v.attendance)}</td>${money ? `<td>${display(v.cheese)}</td>` : ""}</tr>`,
    )
    .join("");
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>로컬 스트리머 리포트</title><style>body{font:15px/1.8 system-ui,sans-serif;margin:40px auto;max-width:1100px;padding:20px;color:#20382c;background:#f6faf6}h1{font-size:36px}table{border-collapse:collapse;width:100%}td,th{padding:10px;border-bottom:1px solid #cad8cc;text-align:left}.awards{display:grid;grid-template-columns:repeat(3,1fr);gap:15px}article{background:white;padding:18px;border:1px solid #cad8cc;border-radius:8px}small{color:#596e5e}</style><h1>내 방송과 시청자</h1><p>이 파일은 로컬에서 생성했습니다. 외부 연결·스크립트·ID·채팅 원문을 포함하지 않습니다. 닉네임 ${names ? "포함" : "익명화"}, 후원 금액 ${money ? "포함" : "제외"}.</p><p>방송 ${broadcast.lives.length}회 / ${Math.round(broadcast.totalSeconds / 360) / 10}시간 · 집계한 다시보기 ${viewers.scanned}개(완전 조회 ${viewers.complete}개) · 시청자 ${viewers.viewers.length}명</p><p>출석은 메시지가 남은 다시보기 횟수입니다. 실제 시청시간·무채팅 시청자를 나타내지 않습니다. 유형은 공개된 로컬 규칙으로 집계합니다. 후원·방송 자료는 선택 기간을 포함하는 성공/부분 수집 자료만 사용합니다. 누적 채팅·구독 현황·상세 메시지는 기간이 다를 수 있습니다.</p><h2>시상식</h2><div class="awards">${awards
    .filter((a) => a.rows.length && (!a.donation || money))
    .map(
      (a) =>
        `<article><h3>${escape(a.title)}</h3><small>${escape(a.basis)}</small><ol>${a.rows
          .slice(0, 3)
          .map((v) => `<li>${label(v)} · ${v.value} ${escape(a.unit)}</li>`)
          .join("")}</ol></article>`,
    )
    .join(
      "",
    )}</div><h2>시청자 목록</h2><table><thead><tr><th>시청자</th><th>채팅</th><th>구독 개월</th><th>다시보기 흔적</th>${money ? "<th>치즈</th>" : ""}</tr></thead><tbody>${rows}</tbody></table><h2>수집 범위</h2><p>${escape(data.range?.from ?? "미확인")} ~ ${escape(data.range?.to ?? "미확인")}</p><ul>${(data.history?.[0]?.warnings ?? []).map((w) => `<li>${escape(w)}</li>`).join("")}</ul></html>`;
}
