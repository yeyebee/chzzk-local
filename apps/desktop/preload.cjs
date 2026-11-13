const { contextBridge, ipcRenderer } = require("electron");
const commands = new Set([
  "openRepository",
  "state",
  "openLogin",
  "openStudio",
  "verify",
  "collect",
  "collectStreamer",
  "exportStreamer",
  "stop",
  "tracking",
  "exportJson",
  "exportCsv",
  "openData",
  "erase",
  "logout",
  "openChannel",
  "openReplay",
]);
contextBridge.exposeInMainWorld("localApp", {
  call: (name, payload) => {
    if (!commands.has(name))
      return Promise.reject(new Error("Unknown command"));
    return ipcRenderer.invoke("app-command", name, payload).catch((error) => {
      throw new Error(
        error.message.replace(
          /^Error invoking remote method '[^']+': (Error: )?/,
          "",
        ),
      );
    });
  },
  onProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("progress", handler);
    return () => ipcRenderer.removeListener("progress", handler);
  },
});
