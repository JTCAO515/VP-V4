import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("AI-36 weather card preserves five-locale attribution and a no-network official-recheck boundary", () => {
  const card = readFileSync("components/chat/cards/WeatherObservationCard.ts", "utf8");
  for (const label of ["天气观测", "Weather observation", "Observación meteorológica", "Наблюдение за погодой", "ملاحظة الطقس"]) assert.match(card, new RegExp(label));
  assert.match(card, /data-weather-observation-card/);
  assert.match(card, /dir: props\.locale === "ar" \? "rtl" : "ltr"/);
  assert.match(card, /官方渠道复核/);
  assert.doesNotMatch(card, /fetch\(|https?:\/\/|href=/);
});
