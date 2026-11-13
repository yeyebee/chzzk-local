// Local deletion never requires a network request or streamer permission.
export function purgeStreamerText(data, mode = "minimal") {
  if (!data || mode === "full") return;
  for (const replay of Object.values(data.replayStats ?? {})) {
    delete replay.messages;
    if (mode === "minimal")
      for (const viewer of Object.values(replay.viewers ?? {}))
        viewer.chat.examples = [];
  }
  for (const detail of Object.values(data.details ?? {})) {
    delete detail.messages;
    if (mode === "minimal") detail.chat.examples = [];
  }
  if (mode === "minimal")
    for (const donation of data.donations ?? []) delete donation.message;
}
