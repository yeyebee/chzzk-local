import fs from "node:fs";
import path from "node:path";
import { mergeChats } from "../../packages/core/core.mjs";
import { validateDatabase } from "../../packages/core/database.mjs";
export const newAccount = (me) => ({
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
});
export class Store {
  constructor(directory) {
    this.directory = directory;
    fs.mkdirSync(directory, { recursive: true });
    this.file = path.join(directory, "records.json");
    this.data = { version: 1, activeId: null, tracking: false, accounts: {} };
    if (fs.existsSync(this.file)) {
      // A damaged file is never overwritten with an empty database.
      const loaded = JSON.parse(fs.readFileSync(this.file, "utf8"));
      if (loaded.version !== 1 || !loaded.accounts)
        throw new Error(
          "기록 파일 형식을 확인할 수 없습니다. records.json을 백업한 후 문의해 주세요.",
        );
      this.data = validateDatabase(loaded);
    }
  }
  save() {
    const temp = this.file + ".tmp";
    const fd = fs.openSync(temp, "w");
    try {
      fs.writeFileSync(fd, JSON.stringify(this.data));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temp, this.file);
  }
  activate(me) {
    this.data.activeId = me.id;
    this.data.accounts[me.id] ??= newAccount(me);
    this.data.accounts[me.id].me = me;
    this.save();
    return this.account;
  }
  get account() {
    return this.data.accounts[this.data.activeId] ?? null;
  }
  addChats(id, chats) {
    const a = this.data.accounts[id];
    a.chats = mergeChats(a.chats, chats);
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
    this.data = { version: 1, activeId: null, tracking: false, accounts: {} };
    this.save();
  }
}
