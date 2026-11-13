const positions = new Map();

// Keep DOM size bounded without removing any stored rows. Only the visible page is built.
export function paginate(
  target,
  rows,
  draw,
  { pageSize = 50, scope = "" } = {},
) {
  const node =
    typeof target === "string" ? document.getElementById(target) : target;
  let state = positions.get(node);
  if (!state || state.scope !== scope) {
    state = { page: 0, scope };
    positions.set(node, state);
  }
  const render = () => {
    const pages = Math.max(1, Math.ceil(rows.length / pageSize));
    state.page = Math.max(0, Math.min(state.page, pages - 1));
    const content = document.createElement("div");
    content.className = "paged-content";
    content.append(
      draw(rows.slice(state.page * pageSize, (state.page + 1) * pageSize)),
    );
    node.replaceChildren(content);
    if (rows.length <= pageSize) return;
    const pager = document.createElement("div"),
      info = document.createElement("span");
    pager.className = "pager";
    info.textContent = `${state.page + 1} / ${pages.toLocaleString("ko-KR")} · ${rows.length.toLocaleString("ko-KR")}개`;
    for (const [label, direction] of [
      ["이전", -1],
      ["다음", 1],
    ]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary";
      button.textContent = label;
      button.disabled =
        direction < 0 ? state.page === 0 : state.page === pages - 1;
      button.dataset.pageDirection = String(direction);
      button.onclick = () => {
        state.page += direction;
        render();
      };
      if (direction > 0) pager.append(info);
      pager.append(button);
    }
    node.append(pager);
  };
  render();
}
