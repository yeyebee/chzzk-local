# 보안

민감한 문제는 저장소의 Security → Report a vulnerability를 사용하세요. 사용할 수 없다면 비밀값 없는 요약으로 먼저 연락해 비공개 전달 방법을 정하세요. 공개 이슈에 실제 계정 데이터·인증 정보를 올리지 마세요.

EXE는 sandbox/contextIsolation을 켜고 nodeIntegration을 끕니다. 원격 페이지에는 앱 IPC를 노출하지 않으며 대시보드 발신 프레임·URL을 검사합니다. 확장은 MV3, 고정 API 호스트, 원격 코드 금지 CSP, 단일 대시보드 잠금을 사용합니다.

기록은 암호화하지 않으며 로그인 세션은 OS/브라우저 보호에 의존합니다. [데이터 흐름](docs/PRIVACY.md)을 확인하세요. 권한·비공개 자료 제한을 우회하지 않습니다.
