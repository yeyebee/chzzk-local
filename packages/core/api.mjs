export const API = "https://api.chzzk.naver.com";
export const COMM = "https://comm-api.game.naver.com";
const ROUTES = [
  /^\/service\/v1\/channels\/followings$/,
  /^\/service\/v1\/log-power\/balances$/,
  /^\/service\/v1\/channels\/[a-f0-9]{32}\/(videos|recent-chat-messages)$/i,
  /^\/service\/v[123]\/videos\/\d+(\/chats)?$/,
  /^\/service\/v1\/channels\/[a-f0-9]{32}$/i,
  /^\/commercial\/v1\/subscribe\/channels(\/expired)?$/,
  /^\/commercial\/v1\/product\/purchase\/history$/,
  /^\/manage\/v1\/channels\/[a-f0-9]{32}\/(my-role|stats\/lives|subscription-gift-histories|subscribers|followers)$/i,
  /^\/manage\/v2\/channels\/[a-f0-9]{32}\/donations$/i,
  /^\/manage\/v1\/channels\/[a-f0-9]{32}\/stats\/lives\/\d+\/audience$/i,
  /^\/manage\/v1\/channels\/[a-f0-9]{32}\/users\/[a-f0-9]{32}\/(chat-activity-count|chat-messages)$/i,
];
export function validateApiUrl(value) {
  const url = new URL(value);
  if (url.username || url.password || url.hash)
    throw new Error("허용되지 않은 API 주소");
  if (url.origin === COMM && url.pathname === "/nng_main/v1/user/getUserStatus")
    return url;
  if (
    url.origin === API &&
    ROUTES.some((pattern) => pattern.test(url.pathname))
  )
    return url;
  throw new Error("허용되지 않은 API 주소");
}
export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}
function wait(ms, signal) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const done = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(done, ms);
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(signal.reason);
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}
export class ChzzkApi {
  constructor(fetcher, { delay = 350, audit = () => {} } = {}) {
    this.fetcher = fetcher;
    this.delay = delay;
    this.nextRequestAt = 0;
    this.audit = audit;
  }
  async get(value, { signal, authenticated = true } = {}) {
    const url = validateApiUrl(value);
    for (let attempt = 0; attempt < 3; attempt++) {
      signal?.throwIfAborted();
      const due = Math.max(Date.now(), this.nextRequestAt);
      this.nextRequestAt = due + this.delay;
      await wait(Math.max(0, due - Date.now()), signal);
      signal?.throwIfAborted();
      const timeout = AbortSignal.timeout(20000);
      let response;
      try {
        response = await this.fetcher(url.href, {
          method: "GET",
          credentials: authenticated ? "include" : "omit",
          redirect: "error",
          headers: { Accept: "application/json" },
          signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        });
      } catch (error) {
        this.audit({
          time: Date.now(),
          host: url.hostname,
          path: url.pathname
            .replace(/[a-f0-9]{32}/gi, "{id}")
            .replace(/\/\d+(?=\/|$)/g, "/{id}"),
          authenticated,
          status: 0,
        });
        signal?.throwIfAborted();
        if (attempt < 2) continue;
        throw new ApiError(
          "네트워크 연결 또는 요청 시간 초과입니다. 잠시 후 다시 시도해 주세요.",
        );
      }
      this.audit({
        time: Date.now(),
        host: url.hostname,
        path: url.pathname
          .replace(/[a-f0-9]{32}/gi, "{id}")
          .replace(/\/\d+(?=\/|$)/g, "/{id}"),
        authenticated,
        status: response.status,
      });
      if (response.status === 429 || response.status >= 500) {
        if (attempt < 2) {
          const retryWait = Math.min(
            10000,
            Math.max(
              1000,
              Number(response.headers.get("Retry-After")) * 1000 ||
                1500 * (attempt + 1),
            ),
          );
          await wait(retryWait, signal);
          continue;
        }
      }
      if (!response.ok)
        throw new ApiError(
          response.status === 401
            ? "로그인이 필요합니다."
            : response.status === 403
              ? "치지직이 이 조회를 허용하지 않았습니다."
              : `치지직 응답 오류 (${response.status})`,
          response.status,
        );
      let body;
      try {
        body = await response.json();
      } catch {
        signal?.throwIfAborted();
        throw new ApiError("치지직에서 JSON이 아닌 응답을 받았습니다.");
      }
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw new ApiError("치지직 API 응답 형식이 바뀌었습니다.");
      if (
        body.code != null &&
        Number(body.code) !== 200 &&
        Number(body.code) !== 0
      )
        throw new ApiError(`치지직 API 오류 (${body.code})`, Number(body.code));
      if (!Object.hasOwn(body, "content"))
        throw new ApiError("치지직 API 응답 형식이 바뀌었습니다.");
      return body.content;
    }
  }
  async me(signal) {
    const c = await this.get(COMM + "/nng_main/v1/user/getUserStatus", {
      signal,
    });
    if (!c?.loggedIn || !/^[a-f0-9]{32}$/i.test(c.userIdHash ?? ""))
      throw new ApiError(
        "치지직에 먼저 로그인한 후 계정 확인을 눌러 주세요.",
        401,
      );
    return { id: c.userIdHash, nickname: String(c.nickname ?? "내 계정") };
  }
  async assertAccount(id, signal) {
    const me = await this.me(signal);
    if (me.id !== id)
      throw new ApiError(
        "로그인 계정이 바뀌어 수집을 중단했습니다. 계정 확인 후 다시 시작해 주세요.",
        409,
      );
    return me;
  }
}
