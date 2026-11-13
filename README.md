# 내 시청 기록 · CHZZK Local

치지직 개인 기록과 내 방송 통계를 **내 기기에서 수집·분석·보관**하는 Windows EXE / Chrome·Edge 확장 프로그램입니다. 개발자 **yeyebee**, MIT 오픈소스.

외부 분석 서버, AI API, 원격 오류 수집, 클라우드 동기화가 없습니다. 로그인은 치지직·네이버 웹페이지에서 직접 합니다. 비밀번호·쿠키 문자열·개발자 API 키를 입력할 필요가 없습니다. NAVER/치지직 공식 제품이 아닙니다.

[최신 릴리스](https://github.com/yeyebee/chzzk-local/releases/latest) · [데이터 사용 원리](docs/PRIVACY.md) · [기능과 한계](docs/FEATURES.md) · [API 명세](docs/API.md)

## 실행

### Windows EXE

1. 릴리스의 `MyViewingLog-1.1.0-Windows.exe`를 실행합니다. Windows x64용이며 별도 Node.js 설치는 필요 없습니다. 코드 서명은 없습니다.
2. **치지직 로그인 열기**에서 본인이 로그인한 뒤 대시보드의 **계정 확인**을 누릅니다.
3. 개인 기록은 **수집 설정**, 내 방송은 **스트리머 리포트**에서 수집합니다.
4. **데이터 사용 안내**에서 저장 경로, 수집 범위, 분류 기준, 최근 요청 진단을 확인합니다.

기존 1.0 사용자: 실행 중인 수집이 끝난 뒤 기존 프로그램을 닫고 새 EXE를 실행하세요. 같은 Windows 계정의 기존 기록·로그인을 사용합니다. 데이터 폴더명 `my-viewing-log`를 유지했습니다. 새 버전 실행 전 **전체 기록 JSON 내보내기**로 백업할 수 있습니다.

### Chrome / Edge 확장

1. 릴리스의 `CHZZK-Local-Extension-1.1.0.zip`을 **고정된 폴더에 압축 해제**합니다.
2. `chrome://extensions` 또는 `edge://extensions`에서 개발자 모드를 켭니다.
3. **압축해제된 확장 프로그램을 로드합니다**를 누르고 `manifest.json`이 있는 폴더를 선택합니다.
4. 확장 아이콘을 눌러 대시보드를 엽니다. 같은 브라우저에서 치지직에 로그인하고 **계정 확인**을 누릅니다.
5. 수집 또는 재생시간 기록 중에는 **대시보드 탭을 열어 두세요**. 기존 치지직 탭은 설치 후 새로고침해야 재생시간 측정이 시작됩니다.

확장 스토어 배포판이 아닌 로컬 설치본입니다. 업데이트는 같은 폴더에 새 파일을 덮어쓰고 확장 관리에서 새로고침합니다. 확장 삭제 전 JSON을 백업하세요. EXE와 확장의 저장소는 별개이며 자동 동기화/가져오기는 없습니다.

## 주요 기능

- **시청자**: 팔로우, 통나무 파워, 현재/종료 구독, 선택한 치즈 사용 내역, 본인 최근/다시보기 채팅, 채널·기간·문장 검색, 로컬 규칙 요약, CSV/JSON 내보내기.
- **재생시간**: 설치 후 플레이어 진행 시간. EXE는 내장 창, 확장은 같은 브라우저의 치지직 탭. 중복 시간을 합칩니다. 과거 포인트를 시청시간으로 환산하지 않습니다.
- **방송 분석**: 소유 채널의 방송일·길이·시간대·요일·카테고리·월별 변화·후원·선물·평균/최고 동시 시청자.
- **공식 성별·연령**: 방송별 스튜디오 집계, 제공 여부·사유·로그인 비율. 개별 시청자의 성별·나이를 추론하지 않습니다.
- **시청자 분석**: 구독/채팅/후원/출석 순위, 검색, 46개 수치·키워드 시상 기준, 개인별 상세, 저장한 원문 검색.
- **제한 정보**: 스트리머의 조회 대상 시청자에 대한 활동제한·임시차단 상태/누적 횟수와 정렬·필터. 개인 모드는 선택한 채널에서 본인 정보만 요청하며 **일반 시청자 권한으로 거절될 수 있습니다**. 거절·미제공은 0회와 구분합니다.
- **공유 파일**: 닉네임·후원 정보를 기본 제외한 HTML 리포트. 포함 여부를 따로 선택합니다. 스크립트·원문·계정 ID는 넣지 않습니다.

### 보관 정책은 사용자가 선택합니다

| 스트리머 보관 방식 | 남기는 데이터 |
|---|---|
| 최소 통계 (MIN, 기본값) | ID·닉네임·집계·시간 구간·유형별 횟수 |
| 예시 문장 | 최소 통계 + 시청자/다시보기당 최대 3문장, 상세 집계당 최대 3문장, 식별 가능한 후원 문장 최대 300자 |
| 전체 원문 (FULL) | 실제 조회한 정상 채팅 본문·작성자·시각·재생 위치 + 통계 |

선택 변경만으로 기존 원문을 지우지 않습니다. **보관한 원문만 삭제**는 재로그인 없이 원문·예시·후원 문장을 지우고 통계와 이후 수집 설정을 유지합니다. **기존 원문도 삭제**를 선택하면 최소/예시 방식에 맞게 제거합니다. 완료된 다시보기에서 원문을 새로 확보하려면 **처음부터 재조회**가 필요합니다. 최소 통계에도 식별자가 있으므로 익명 데이터가 아닙니다. 개인 모드는 본인 원문을 보관하며 다른 사람 원문을 버립니다.

## 알아둘 범위

스튜디오 연결은 **베타**입니다. 공개 웹 클라이언트의 경로·필드를 확인하고 합성 응답으로 검증했으며, 인증된 실제 스트리머 계정의 모든 API 성공을 검증하지는 않았습니다. 권한·서비스 변경·보관기간에 따라 거절될 수 있습니다.

정확한 과거 시청시간, 무채팅 시청자의 출석, 삭제/비공개 채팅 복구, 전체 채널 차단 목록, AI 성격/감정 판정은 미지원입니다. 채팅·후원·차단 실행 등 쓰기 요청도 하지 않습니다. 상한에 도달하면 부분 수집으로 표시하고 다음 실행에서 커서를 이어갑니다. [계산식과 제한](docs/FEATURES.md)을 확인하세요.

## 모노레포

API·분석·화면을 공유하고, 플랫폼별 로그인·저장·재생 관찰 코드를 분리합니다.

```text
apps/desktop/      Electron main, preload, JSON store, playback observer
apps/extension/    Manifest V3, IndexedDB, browser adapter, content script
packages/core/    API allowlist, collectors, analysis, export, moderation
packages/ui/      shared Korean dashboard and synthetic demo
packages/assets/  local icons
scripts/          extension packaging
tests/            logic, Electron UI, extension integration
docs/             privacy, API, features, validation
```

## 소스에서 실행·검증·빌드

Node.js 22 이상과 npm. Windows EXE 빌드는 Windows에서 검증했습니다.

```powershell
npm ci
npm test
npm start
npm run test:ui
npx playwright install chromium
npm run test:extension
npm run build
```

`npm run build:desktop`과 `npm run build:extension`도 별도 실행 가능합니다. 결과는 `dist/`. UI 테스트는 임시 프로필과 가상 기록만 사용합니다. 공개 API 점검은 `node tests/api-smoke.mjs`로 따로 실행합니다.

런타임 npm 의존성은 없습니다. 개발 도구는 lockfile로 고정하며 빌드 도구의 glob 처리 취약점을 피하도록 minimatch 버전을 override했습니다. 공개 소스·릴리스에 개인 기록, 쿠키, 프로필, 테스트 결과를 포함하지 않습니다.

[기여](CONTRIBUTING.md) · [보안](SECURITY.md) · [검증 범위](docs/VALIDATION.md) · [1.1.1 검토 내역](docs/REVIEW-2026-11-13.md) · [MIT](LICENSE)
