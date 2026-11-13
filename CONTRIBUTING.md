# 기여

이슈와 PR을 환영합니다. 최소 합성 응답·테스트로 문제를 재현해 주세요. 실제 ID·닉네임·원문·쿠키·헤더·프로필·records.json은 공개하지 마세요.

공통 API/분석은 `packages/core`, 화면은 `packages/ui`, 플랫폼은 `apps/desktop`과 `apps/extension`입니다. 외부 분석 서버·원격 보고·쓰기 API는 현재 범위가 아닙니다. 새 API는 공식 서비스 클라이언트에서 경로·필드·권한을 확인하고 문서를 갱신합니다. 모르는 값은 0/false로 바꾸지 마세요.

필요한 테스트: `npm test`, `npm run test:ui`, `npm run test:extension`, `npm run test:large-ui`. 공개 커밋에 dist·test-output·프로필·export·개인 기록·비밀값을 포함하지 않습니다.
