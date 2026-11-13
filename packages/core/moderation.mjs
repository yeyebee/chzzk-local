// Only explicit API fields are accepted. Missing values never become zero/false.
const bool = (v) => (typeof v === "boolean" ? v : null);
const count = (v) =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;
export function normalizeActivity(data) {
  if (!data || typeof data !== "object")
    throw new Error("활동 정보 응답 형식 변경");
  const result = {
    count: count(data.chatMessageCount),
    restricted: bool(data.restrict),
    temporary: bool(data.temporaryRestrict),
    restrictCount: count(data.restrictCount),
    temporaryCount: count(data.temporaryRestrictCount),
    checkedAt: Date.now(),
    status: "ok",
  };
  if (
    [
      result.count,
      result.restricted,
      result.temporary,
      result.restrictCount,
      result.temporaryCount,
    ].every((v) => v === null)
  )
    throw new Error("활동 정보 필드를 확인할 수 없습니다.");
  return result;
}
export function normalizeAudience(data) {
  if (!data || typeof data !== "object")
    throw new Error("인구통계 응답 형식 변경");
  const available = data.available !== false && data.ageSexAvailable === true;
  const rate = (v) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100
      ? v
      : null;
  return {
    available,
    reason: String(
      data.ageSexReason ??
        data.reason ??
        (available ? "" : "치지직이 성별·연령 집계를 제공하지 않았습니다."),
    ),
    sex:
      available && Array.isArray(data.sex)
        ? data.sex.map((x) => ({ code: String(x.code), rate: rate(x.rate) }))
        : [],
    ages:
      available && Array.isArray(data.ageBands)
        ? data.ageBands.map((x) => ({
            band: String(x.band),
            rate: rate(x.rate),
          }))
        : [],
    loginRate: rate(data.loginRate),
    checkedAt: Date.now(),
  };
}
