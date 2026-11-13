import { mergeChats } from "../../packages/core/core.mjs";
import { validateDatabase } from "../../packages/core/database.mjs";
const blank = () => ({
  version: 1,
  activeId: null,
  tracking: false,
  accounts: {},
});
export class BrowserStore {
  constructor(db) {
    this.db = db;
    this.data = blank();
    this.directory =
      "이 브라우저 프로필 → 확장 프로그램 전용 IndexedDB (chzzk-local)";
    this.queue = Promise.resolve();
    this.error = null;
    this.revision = 0;
    this.onError = () => {};
  }
  static async open() {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open("chzzk-local", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("records");
      r.onerror = () => reject(r.error);
      r.onsuccess = () => resolve(r.result);
    });
    const store = new BrowserStore(db),
      value = await new Promise((resolve, reject) => {
        const r = db.transaction("records").objectStore("records").get("state");
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    if (value) {
      if (value.version !== 1 || !value.accounts)
        throw new Error(
          "저장 데이터 형식을 인식하지 못했습니다. 덮어쓰지 않습니다.",
        );
      store.data = validateDatabase(value);
    }
    store.data.tracking = false;
    return store;
  }
  save() {
    const revision = ++this.revision;
    this.queue = this.queue
      .then(async () => {
        if (revision !== this.revision) return;
        await new Promise((resolve, reject) => {
          const tx = this.db.transaction("records", "readwrite");
          tx.objectStore("records").put(this.data, "state");
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error ?? new Error("기록 저장 중단"));
        });
        this.error = null;
      })
      .catch((error) => {
        this.error = error;
        this.onError(error);
      });
  }
  async flush() {
    await this.queue;
    if (this.error) throw new Error("로컬 저장 실패: " + this.error.message);
  }
  get account() {
    return this.data.accounts[this.data.activeId] ?? null;
  }
  activate(me) {
    this.data.activeId = me.id;
    this.data.accounts[me.id] ??= {
      me,
      follows: [],
      power: [],
      subscriptions: [],
      expiredSubscriptions: [],
      donations: [],
      chats: [],
      watches: [],
      checkpoints: {},
      history: [],
      updatedAt: null,
    };
    this.account.me = me;
    this.save();
    return this.account;
  }
  addChats(id, messages) {
    this.data.accounts[id].chats = mergeChats(
      this.data.accounts[id].chats,
      messages,
    );
    this.save();
  }
  addWatch(id, row) {
    const a = this.data.accounts[id];
    if (!a) return;
    const last = a.watches.at(-1);
    if (
      last &&
      last.channelId === row.channelId &&
      last.kind === row.kind &&
      row.start <= last.end + 1500 &&
      row.start >= last.start
    )
      last.end = Math.max(last.end, row.end);
    else a.watches.push(row);
    this.save();
  }
  clear() {
    this.data = blank();
    this.save();
  }
}
