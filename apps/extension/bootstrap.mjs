import { initialize } from "./bridge.mjs";
// One dashboard owns the database. No service-worker lifetime dependency.
navigator.locks.request(
  "chzzk-local-dashboard",
  { ifAvailable: true },
  async (lock) => {
    if (!lock) {
      document.body.textContent =
        "다른 탭에서 내 시청 기록이 열려 있습니다. 기존 탭을 사용하세요.";
      return;
    }
    try {
      await initialize();
      await import("../../packages/ui/app.mjs");
      document.querySelector("#logout").textContent = "확장 계정 연결 해제";
      document.querySelector("#open-data").hidden = true;
      document
        .querySelector("#tracking")
        .closest(".tracking-card")
        .querySelector("p").textContent =
        "이 대시보드를 열어 두고, 같은 브라우저의 치지직 탭에서 재생하세요. 확장 설치 전 열린 치지직 탭은 새로고침이 필요합니다.";
      document
        .querySelector("#watch .explanation")
        .querySelectorAll("p")[1].textContent =
        "기록된 재생시간은 이 대시보드가 열린 동안 같은 브라우저의 치지직 탭에서 실제 재생이 진행된 구간입니다. 다른 브라우저·EXE·휴대폰은 포함되지 않습니다. 대시보드를 닫으면 기록과 수집이 중지됩니다.";
      document.querySelector("#onboarding p").textContent =
        "같은 브라우저에서 치지직에 로그인한 뒤 계정 확인을 누르세요.";
      await new Promise(() => {});
    } catch (error) {
      document.body.textContent =
        "확장을 시작하지 못했습니다: " + error.message;
    }
  },
);
