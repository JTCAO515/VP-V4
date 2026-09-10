import type { Locale } from "@/lib/i18n";
import { opsSourceCopy } from "@/lib/i18n";
import type { SourceDeclaration, CandidateAddressAssertion } from "@/lib/server/knowledge/review/source-assertion";
export function SourceAssertionFields({ locale, disabled }: { locale: Locale; disabled: boolean }) {
 const c = opsSourceCopy[locale];
 return <fieldset disabled={disabled}>
  <legend>{c.source}</legend><p>{c.boundary}</p>
  <label>{c.sourceKey}<input name="sourceKey" required maxLength={128} pattern={"[a-z][a-z0-9_\\-]*"} /></label>
  <label>{c.revisionLabel}<input name="revisionLabel" required maxLength={120} /></label>
  <label>{c.publisher}<input name="publisher" required maxLength={160} /></label>
  <label>{c.uri}<input name="uri" required maxLength={1000} /></label>
  <label>{c.locator}<input name="locator" required maxLength={240} /></label>
  <label>{c.snippet}<textarea name="snippet" required maxLength={2000} rows={3} /></label>
  <label>{c.usageDeclaration}<textarea name="usageDeclaration" required maxLength={500} rows={2} /></label>
  <label>{c.subjectId}<input name="subjectId" required maxLength={128} pattern={"[a-z][a-z0-9_\\-]*"} /></label>
  <label>{c.lines}<textarea name="addressLines" required maxLength={482} rows={3} /></label>
  <label>{c.locality}<input name="locality" maxLength={120} /></label>
  <label>{c.countryCode}<input name="countryCode" required maxLength={2} pattern="[A-Z]{2}" /></label>
  <label>{c.zh}<textarea name="expressionZh" required maxLength={1000} rows={3} /></label>
  <label>{c.en}<textarea name="expressionEn" required maxLength={1000} rows={3} /></label>
 </fieldset>;
}
export function sourceFields(values: FormData): { source: SourceDeclaration; assertion: CandidateAddressAssertion; expressions: { zh: string; en: string } } {
 const get = (name: string) => String(values.get(name) ?? "");
 const locality = get("locality").trim();
 return {
  source: { sourceKey: get("sourceKey"), revisionLabel: get("revisionLabel"), publisher: get("publisher"), uri: get("uri"), locator: get("locator"), snippet: get("snippet"), usageDeclaration: get("usageDeclaration") },
  assertion: { subjectId: get("subjectId"), claimType: "address", value: { lines: get("addressLines").split("\n").map(line => line.trim()).filter(Boolean), ...(locality ? { locality } : {}), countryCode: get("countryCode") } },
  expressions: { zh: get("expressionZh"), en: get("expressionEn") },
 };
}
