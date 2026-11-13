import { RULES, AWARDS } from "../core/analysis.mjs";
export function initializePrivacy(call, toast) {
  document.getElementById("privacy").innerHTML =
    `<div class="page-title"><div class="eyebrow">YOUR DATA, EXPLAINED</div><h1>어디서 읽고, 어디에 남을까요<span>.</span></h1><p>데이터 흐름부터 계산식까지. 숨겨진 분석 서버 없이 확인할 수 있습니다.</p></div>
  <div class="privacy-lead"><strong>기록을 분석하는 곳은 이 PC입니다.</strong><p>네이버 로그인을 이용해 치지직에 읽기 요청을 보내고, 받은 자료를 앱 안에서 집계합니다. 운영자 서버·외부 AI·원격 오류 수집·클라우드 동기화는 없습니다.</p></div>
  <article class="panel"><h2>한 번의 수집이 지나가는 길</h2><div class="flow"><div><b>1. 직접 로그인</b><p>치지직·네이버 웹페이지<br>비밀번호는 네이버로</p></div><i>→</i><div><b>2. 읽기 요청</b><p>인증된 세션으로<br>치지직 API에 GET 요청</p></div><i>→</i><div><b>3. 로컬 계산</b><p>본인 메시지 필터·중복 제거<br>또는 스트리머 통계 집계</p></div><i>→</i><div><b>4. 로컬 저장</b><p>EXE: records.json<br>확장: IndexedDB<br>화면·파일로만 확인</p></div></div><p>스트리머 모드는 먼저 로그인 계정의 채널 ID와 <strong>STREAMER 소유자 권한</strong>을 확인합니다. 다른 채널 ID를 입력해 스튜디오 자료를 조회하는 기능은 제공하지 않습니다.</p></article>
  <article class="panel no-pad"><table><thead><tr><th>데이터</th><th>사용 목적</th><th>저장 방식</th></tr></thead><tbody>
  <tr><td>네이버 비밀번호</td><td>네이버 로그인 화면에서 본인이 입력</td><td>앱이 읽거나 별도 파일로 저장하지 않습니다.</td></tr>
  <tr><td>로그인 쿠키·세션</td><td>치지직·네이버 인증 요청</td><td>EXE는 전용 Chromium 프로필, 확장은 기존 브라우저 세션을 사용합니다. 쿠키 문자열을 추출하거나 백업에 넣지 않습니다.</td></tr>
  <tr><td>내 계정 ID·닉네임</td><td>계정별 기록 분리, 본인 채팅 필터</td><td>로컬 기록 저장소</td></tr>
  <tr><td>시청자 모드의 내 채팅</td><td>검색·다시보기 링크·통계</td><td>내 채팅 원문·시각·채널을 로컬에 저장합니다. 다른 사람 원문은 버립니다.</td></tr>
  <tr><td>스트리머 모드의 시청자</td><td>구독·채팅·후원 순위, 개인별 리포트</td><td>사용자가 최소 통계 / 예시 문장 / 전체 원문을 선택합니다. 모두 ID·닉네임·집계가 포함됩니다. 전체 방식은 조회한 원문·작성자·시각을 보관합니다.</td></tr>
  <tr><td>예시 문장 저장을 켠 경우</td><td>분류된 표현을 직접 확인</td><td>시청자/다시보기당 최대 3문장, 상세 집계당 최대 3문장. 식별 가능한 후원 메시지도 최대 300자 보관합니다. 옵션 변경만으로 기존 원문을 삭제하지 않습니다. 기존 원문 삭제를 따로 선택할 수 있습니다.</td></tr>
  <tr><td>후원·구독권 선물</td><td>방송일별 합계, 후원 순위</td><td>선택 수집. 익명·탈퇴 표시는 개인 ID와 연결하지 않습니다.</td></tr>
  <tr><td>재생시간</td><td>앱 내 플레이어의 진행 구간 합산</td><td>채널·구간 시작/끝 시각. EXE는 내장 창, 확장은 설치된 브라우저의 치지직 탭을 관찰합니다. 확장은 대시보드가 열려 있어야 합니다.</td></tr>
  <tr><td>조회 진단</td><td>어느 API에서 실패했는지 확인</td><td>최근 500건의 시각·호스트·ID를 제거한 경로·HTTP 상태. 응답 원문·쿠키·쿼리값은 기록하지 않습니다.</td></tr>
  </tbody></table></article>
  <div class="two-column"><article class="panel"><h2>접속하는 곳</h2><p><b>api.chzzk.naver.com</b><br>팔로우·포인트·스튜디오·다시보기 읽기 API</p><p><b>comm-api.game.naver.com</b><br>현재 로그인 계정 확인</p><p><b>chzzk.naver.com / studio.chzzk.naver.com / 네이버 로그인</b><br>사용자가 여는 로그인·방송 웹페이지. 이 웹페이지는 치지직 자체의 영상 CDN·광고·서비스 연결을 사용합니다.</p><p>API 조회기는 고정 허용 경로에 GET 요청만 보냅니다. EXE 대시보드는 외부 네트워크가 차단되며, 확장 대시보드는 두 API 호스트에만 연결할 수 있습니다. GitHub는 아래 버튼을 눌렀을 때만 외부 브라우저에서 엽니다.</p></article><article class="panel"><h2>저장 파일은 비밀 금고가 아닙니다</h2><p>통계와 기록은 <strong>앱 자체 암호화 없이 저장</strong>됩니다. EXE는 JSON, 확장은 브라우저 프로필 내 IndexedDB입니다. 같은 Windows 계정 권한으로 접근할 수 있는 프로그램이나 사람은 읽을 수 있습니다. Windows 계정·디스크 보호도 중요합니다.</p><code id="privacy-path"></code><p>EXE 로그인 세션은 위 폴더의 상위 앱 데이터 폴더 안 <code>Partitions/chzzk</code>에 있습니다. EXE 로그아웃은 세션을 지우며 전체 삭제는 기록·진단·세션을 함께 지웁니다. 확장은 일반 브라우저 로그인을 건드리지 않고 기록만 지웁니다. 확장 계정 연결 해제는 수집·재생시간 기록을 중지합니다. 디스크의 복구 불가능한 보안 삭제를 보장하지 않습니다.</p><p>직접 내보낸 파일과 파일 시스템 백업은 앱에서 삭제되지 않습니다. JSON에는 스트리머 자료와 시청자 식별자가 포함될 수 있으므로 공유 전 확인하세요.</p></article></div>
  <article class="panel"><h2>통계가 의미하는 것과 의미하지 않는 것</h2><ul class="readable-list"><li><b>과거 시청시간</b>: 통나무 파워를 시간으로 환산하지 않습니다. 설치 후 앱의 재생시간과 별도입니다.</li><li><b>출석</b>: 수집한 다시보기에 메시지를 남긴 횟수입니다. 말없이 본 시청자는 집계할 수 없습니다.</li><li><b>10분 활동 칸</b>: 방송의 10분 구간에 메시지가 한 번이라도 있으면 1칸입니다. 10분 내내 시청했다는 뜻이 아닙니다.</li><li><b>방송일</b>: 한국 시간 오전 5시에 날짜를 바꿉니다. 종료 30분 이내 재개한 방송은 앞 방송일에 묶고, 15분 미만의 방송일은 보통 하루 계산에서 제외합니다.</li><li><b>방송 중 후원</b>: 시작 10분 전부터 종료 10분 후까지의 후원을 그 방송일에 연결합니다. 나머지는 방송 외 후원입니다. 구독권은 장수와 결제액을 치즈로 임의 환산하지 않습니다.</li><li><b>방송일 분류</b>: 후원 없는 날 / 후원 있는 날 평균의 4배 이상인 이벤트일 / 중간값의 2배 이상인 날 / 중간값의 절반 미만인 날 / 나머지를 나눕니다. 공개된 로컬 분류 규칙입니다.</li><li><b>채팅 유형</b>: 아래 정규식에 맞는 메시지 수입니다. 중복 분류가 가능하며 성격·감정·의도를 추론하지 않습니다. AI 점수가 아닙니다.</li><li><b>부분 수집</b>: 기간·페이지·다시보기·상위 시청자 한도가 적용됩니다. 치지직의 모든 기록을 읽었다고 볼 수 없습니다. 실패한 자료는 기존 값을 보존하며 그 자료의 조회 기간을 표시합니다.</li></ul></article>
  <article class="panel"><h2>실행 형태와 기능 범위</h2><p>EXE와 Chrome/Edge 확장은 같은 API·집계·화면 코드를 사용합니다. 보관 위치와 로그인 세션, 재생시간을 관찰하는 창이 다릅니다. 두 저장소는 자동으로 동기화되지 않습니다.</p><table><thead><tr><th>기능</th><th>제공 범위</th></tr></thead><tbody><tr><td>개인 채팅·채널·후원</td><td>조회 범위 내 검색과 JSON/CSV 내보내기</td></tr><tr><td>방송 분석·46개 시상 기준·개인별 리포트</td><td>소유자 권한으로 읽고 로컬 규칙으로 계산</td></tr><tr><td>성별·연령</td><td>방송별 공식 집계만 표시. 개별 시청자 추정과 방송 간 단순 평균 없음</td></tr><tr><td>활동제한·임시차단</td><td>현재 상태와 서버 누적 횟수. 미제공/권한 부족은 조회 불가. 개인 모드는 지정한 채널만 확인하며 일반 시청자 권한으로 거절될 수 있음</td></tr><tr><td>원문 보관</td><td>시청자 모드는 본인 원문, 스트리머는 최소/예시/전체 선택</td></tr><tr><td>미제공 기능</td><td>과거 정확한 시청시간 복원, AI 성격 판정, 전체 채널 차단 목록 자동 탐색, 영구/임시 제재 실행, 클라우드 공유</td></tr></tbody></table><p>전체 원문은 비밀번호·토큰·원시 인증 응답을 뜻하지 않습니다. 수집 상한 내에서 읽은 정상 채팅의 본문·작성자·시각입니다. 삭제된 메시지나 비공개 기록을 복원하지 않습니다.</p><p>성별 비율의 제공 여부·표본 기준은 치지직이 결정합니다. 차단 횟수 0과 조회 불가는 다릅니다. 과거 제한 횟수가 있어도 현재 차단 상태라고 추정하지 않습니다.</p></article>
  <article class="panel"><details><summary>채팅 분류 규칙 직접 보기</summary><div id="privacy-rules"></div></details><details><summary>시상식 계산 기준 직접 보기</summary><div id="privacy-awards"></div></details></article>
  <article class="panel"><div class="panel-heading"><h2>최근 API 요청 — 이 PC에만 저장</h2><span class="tag">ID / 쿠키 / 응답 원문 제외</span></div><p>앱 조회기의 요청만 표시합니다. 내장 치지직 웹페이지의 전체 네트워크 로그는 아닙니다.</p><div class="table-scroll"><table><thead><tr><th>시각</th><th>호스트 / 경로</th><th>인증</th><th>응답</th></tr></thead><tbody id="audit-table"></tbody></table></div></article>
  <article class="panel"><h2>공개 소스와 버전</h2><p>개발자 <b>yeyebee</b> · MIT 라이선스 · <span id="app-version"></span></p><p>소스와 테스트, 개인정보 설명, 기능 비교표를 공개합니다. 공개 저장소·릴리스에는 개인 기록이나 로그인 프로필을 넣지 않습니다. 외부 업데이트를 자동 설치하지 않습니다.</p><button id="repository" class="secondary">GitHub 저장소 열기 ↗</button></article>`;
  for (const [id, label, pattern] of RULES) {
    const line = document.createElement("p");
    line.textContent = label + " — /" + pattern.source + "/" + pattern.flags;
    document.getElementById("privacy-rules").append(line);
  }
  for (const [, title, basis] of AWARDS) {
    const line = document.createElement("p");
    line.textContent = title + " — " + basis;
    document.getElementById("privacy-awards").append(line);
  }
  document
    .getElementById("repository")
    .addEventListener("click", () =>
      call("openRepository").catch((e) => toast(e.message)),
    );
}
export function renderPrivacy(state) {
  document.getElementById("privacy-path").textContent = state.dataPath ?? "";
  document.getElementById("app-version").textContent =
    "v" + (state.version ?? "1.1.0");
  const body = document.getElementById("audit-table");
  body.replaceChildren();
  for (const row of [...(state.audit ?? [])].reverse().slice(0, 20)) {
    const tr = document.createElement("tr");
    for (const text of [
      new Date(row.time).toLocaleTimeString("ko-KR", {
        timeZone: "Asia/Seoul",
      }),
      row.host + row.path,
      row.authenticated ? "로그인 세션" : "없음",
      row.status || "네트워크 오류",
    ]) {
      const td = document.createElement("td");
      td.textContent = text;
      tr.append(td);
    }
    body.append(tr);
  }
  if (!body.children.length) {
    const tr = document.createElement("tr"),
      td = document.createElement("td");
    td.colSpan = 4;
    td.textContent = "아직 조회한 API 요청이 없습니다.";
    tr.append(td);
    body.append(tr);
  }
}
