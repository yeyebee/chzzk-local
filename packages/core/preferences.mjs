import { persist } from "./persistence.mjs";

// This is an account-specific UI preference, not a claim about server permissions.
export const streamerEnabled = (account) =>
  account?.preferences?.streamerMode === true;

export async function setStreamerMode(store, enabled, running = false) {
  if (typeof enabled !== "boolean") throw new Error("기능 설정 형식 오류");
  if (running) throw new Error("수집을 중지한 뒤 기능 설정을 변경하세요.");
  const account = store.account;
  if (!account) throw new Error("먼저 계정을 확인해 주세요.");
  const previous = account.preferences;
  account.preferences = { ...(previous ?? {}), streamerMode: enabled };
  try {
    await persist(store);
  } catch (error) {
    if (previous === undefined) delete account.preferences;
    else account.preferences = previous;
    throw error;
  }
}
