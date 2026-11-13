export class PersistenceError extends Error {
  constructor(cause) {
    super(
      "기록 저장에 실패했습니다. 저장 공간·권한을 확인하고 현재 기록을 JSON으로 내보내세요.",
      { cause },
    );
    this.name = "PersistenceError";
  }
}
export async function persist(store, operation = () => store.save()) {
  try {
    await operation();
    await store.flush?.();
  } catch (error) {
    throw error instanceof PersistenceError
      ? error
      : new PersistenceError(error);
  }
}
