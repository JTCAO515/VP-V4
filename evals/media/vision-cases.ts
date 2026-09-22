/** Authored synthetic text; no customer names, bookings, tickets or licensed source images. */
export const VISION_CASES = Object.freeze([
  { id: "ocr-en-v1", locale: "en" as const, lines: ["SYNTHETIC TRAVEL CARD", "Name: Maya Chen", "Date: 2026-10-08", "Departure: 09:05", "Gate: B12", "Amount: CNY 128.50", "Do NOT board train G102.", "Take train G120, NOT G102."],
    fields: ["Maya Chen", "2026-10-08", "09:05", "B12", "128.50", "Do NOT board train G102.", "Take train G120, NOT G102."] },
  { id: "ocr-zh-v1", locale: "zh" as const, lines: ["合成旅行卡（非真实订单）", "姓名：林晓雨", "日期：2026-10-08", "出发：09:05", "检票口：B12", "金额：128.50元", "不要乘坐G102次列车。", "请乘坐G120次，不是G102次。"],
    fields: ["林晓雨", "2026-10-08", "09:05", "B12", "128.50", "不要乘坐G102次列车。", "请乘坐G120次，不是G102次。"] },
]);

/** Frozen v1: normalize whitespace only. No fuzzy numbers, dates, negations or names. */
export function scoreVisionTranscript(caseId: string, transcript: string) {
  const fixture = VISION_CASES.find(value => value.id === caseId);
  if (!fixture) throw new Error("Unknown synthetic case");
  const compact = (value: string) => value.replace(/\s+/gu, "");
  const actual = compact(transcript);
  const fields = fixture.fields.map(expected => ({ expected, pass: actual.includes(compact(expected)) }));
  return { revision: "vision-exact-v1", fields, transcriptExact: actual === compact(fixture.lines.join("\n")),
    pass: fields.every(field => field.pass) && actual === compact(fixture.lines.join("\n")) };
}
