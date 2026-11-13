# 읽기 API

2026-11-13 기준. 치지직 웹 클라이언트의 경로와 필드를 확인하고 독립 구현했습니다. 공식 Open API 앱 키/OAuth 등록 방식이 아니며 호환성 보장은 없습니다. 권한 거절·스키마 변경을 실패로 표시합니다.

모든 요청은 GET, 기본 간격 350ms, 제한 20초. 네트워크/429/5xx는 최대 3회, 지연 최대 10초. 인증 요청은 세션 포함, 공개 다시보기는 `credentials: omit`입니다.

| 목적 | GET 경로 (`api.chzzk.naver.com`) |
|---|---|
| 팔로우 | `/service/v1/channels/followings` |
| 포인트 | `/service/v1/log-power/balances` |
| 구독 | `/commercial/v1/subscribe/channels`, `/expired` |
| 치즈 사용 | `/commercial/v1/product/purchase/history` |
| 채널 | `/service/v1/channels/{id}` |
| 최근 내 채팅 | `/service/v1/channels/{id}/recent-chat-messages` |
| 다시보기 목록 | `/service/v1/channels/{id}/videos` |
| 다시보기 정보 | `/service/v3/videos/{videoNo}` |
| 다시보기 채팅 | `/service/v1/videos/{videoNo}/chats` |
| 소유자 역할 | `/manage/v1/channels/{id}/my-role` |
| 방송 이력 | `/manage/v1/channels/{id}/stats/lives?from=…&to=…` |
| 공식 성별·연령 | `/manage/v1/channels/{id}/stats/lives/{liveId}/audience` |
| 구독자 / 팔로워 | `/manage/v1/channels/{id}/subscribers`, `/followers` |
| 받은 후원 | `/manage/v2/channels/{id}/donations` |
| 구독권 선물 | `/manage/v1/channels/{id}/subscription-gift-histories` |
| 누적 채팅·제한 | `/manage/v1/channels/{id}/users/{userId}/chat-activity-count` |
| 상세 메시지 | `/manage/v1/channels/{id}/users/{userId}/chat-messages` |

계정 확인은 `comm-api.game.naver.com/nng_main/v1/user/getUserStatus`입니다.

활동 필드: `chatMessageCount`, `restrict`, `restrictCount`, `temporaryRestrict`, `temporaryRestrictCount`. 명시적 불리언/음이 아닌 정수만 받고 결측은 null입니다. 개인 모드에서 본인 ID를 조회해도 관리 권한으로 제한될 수 있습니다.

방송 이력: `liveStatList[].live`의 `liveId/openDate/closeDate/liveTitle`, `liveStatDetail`의 `duration/avgCv/peakCv/uv/pv`. 인구 집계: `available`, `ageSexAvailable`, `ageSexReason`, `sex[{code,rate}]`, `ageBands[{band,rate}]`, `loginRate`. 제공 불가 응답의 비율은 무시합니다.

공개 메시지: `videoChats`, `nextPlayerMessageTime`. 상세 메시지: `data/messages/chatMessages`, `page.next.messageTimeLong`. 알 수 없는 목록 스키마를 빈 목록으로 대체하지 않습니다.

확인 자료: [치지직 웹 클라이언트](https://chzzk.naver.com/), [치지직 스튜디오](https://studio.chzzk.naver.com/), [공식 API 문서](https://chzzk.gitbook.io/chzzk). 공개 클라이언트의 API 계약만 확인했으며 화면·분석·수집기는 별도 작성했습니다. 합성 응답 테스트와 소유자 인증 실계정 검증은 구분합니다.
