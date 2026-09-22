# VPJ-15 airport transport: Hongqiao T2 source research

Observed: 2026-09-22 Asia/Shanghai (tool clock: 2026-09-21 20:38:12 UTC). Scope: one candidate fact for Shanghai airport transport, editorial ID `SH-AIR-01`; this is not the existing Pudong `SH01` item. No source media or full article was downloaded or saved.

## Candidate and qualification

- Proposed fact: Shanghai Hongqiao Airport Terminal 2 has access to Shanghai Metro lines 2 and 10.
- Status: **candidate**, not independently reviewed, published, or eligible for product retrieval. A readable public page is evidence, not a content licence or an approval receipt.
- Geographic scope: Shanghai, China; SHA / Hongqiao Airport, Terminal 2 only. Do not generalize this to Terminal 1, Pudong Airport, Hongqiao Railway Station, or the separate Airport Link Line.
- Travel use: orient a traveler choosing rail transport from/to T2. This does not establish today's service availability, timetables, fares, walking routes, accessibility, payment eligibility, immigration eligibility, or a booked connection.
- Source recency: last checked 2026-09-22; primary readable publication is dated 2024-03-21. This check is a fresh observation of an older source, not a 2026 publication or transport operator live-status check. Before review/publication, verify the current station topology using a readable current official source; suggested editorial recheck deadline 2026-10-22 is a proposed workflow date, not a source guarantee.

## Sources and exact locators

### A. Readable government-hosted operator announcement

[Shanghai airports' metro stations accept foreign cards now](https://english.shanghai.gov.cn/en-Latest-WhatsNew/20240321/3c3ab971bc2a417cbb214ce53e7008c8.html)

- Publisher/host: Shanghai municipal government English portal; stated underlying source: Shanghai Metro's `shmetro` WeChat account. This is the government's hosted version of an operator announcement; the original WeChat publication was not independently opened.
- Visible publication date: March 21, 2024. No explicit revision identifier was visible; record the URL, displayed date, observation date, and locator as the observed version. No content hash or archived full-page copy was created.
- Locator: body paragraph immediately after the opening paragraph, beginning with the locations of the service centers; it enumerates Line 2 and Line 10 at Hongqiao Terminal 2. In this session's extracted page this was line 5; use the paragraph locator because extraction line numbers are not stable source identifiers.
- Observation: `web.open` returned readable HTML text. The body supports the station/line relationship. The surrounding card-payment claims are deliberately outside this candidate.
- Rights boundary: no explicit open/commercial redistribution licence was established. Keep attribution and the source link; candidate text below is a newly written concise factual statement. Do not copy the article, photograph, screenshot, diagrams, or transport tables. Government hosting and original phrasing do not themselves establish permission; rights/use qualification remains for the existing content review process.

### B. More recent government guide: corroboration only, access failed

[Traveling between Shanghai's airports and city center](https://english.shanghai.gov.cn/en-Individuals-Transportation-Airplane/20260813/7366238930024ac8b22e5adf82217bd8.html)

- Search extraction showed a body update date of June 4, 2026 and source Shanghai Airport Authority. The URL contains `20260813`; do not silently treat this as the publication date. The conflicting date indicators remain unresolved.
- Locator in search extraction: `Shanghai Hongqiao International Airport` → `Metro`, second terminal paragraph.
- Search extraction corroborates T2 / lines 2 and 10. Direct `web.open` returned 404, and direct Python HTTPS retrieval timed out during TLS handshake. Consequently this is **not** a successfully inspected current full page, nor the sole evidence for the candidate.
- Query used: `site.shanghai.gov.cn Hongqiao airport metro line 2 line 10 terminal 2 transportation`. Search discovery is not proof of commercial reuse permission.

### C. Airport operator: excluded as reusable source material

[Shanghai Airport Hongqiao home](https://www.shanghaiairport.com/enhq/) was readable. Its Airport Link Line notice places that line's T2 entrance near metro lines 2 and 10; it is only a cross-check and supplies no candidate wording. The linked [Metro page](https://www.shanghaiairport.com/enhq/gdjt/index.html) returned HTTP 521 through `web.open`.

[Website statement](https://www.shanghaiairport.com/enhq/WebsiteNotices/index.html) was readable. Its Intellectual Property/Copyright and Prohibited Behavior sections reserve content rights, restrict copying, and require written authorization for redistribution of service and other information. No such authorization was verified. This source is therefore not marked licensed or used as an ingestion/republication source; rewriting does not remove its restrictions.

## Proposed neutral assertion and original expressions

The following is an editorial proposal, to be mapped to the existing assertion contract by the implementation owner. It is not a replacement runtime schema or an imported external identifier.

```json
{
  "editorialId": "SH-AIR-01",
  "subject": { "kind": "airport_terminal", "airportIata": "SHA", "terminal": "2" },
  "predicate": "served_by_metro_lines",
  "object": { "network": "shanghai_metro", "lineNumbers": ["2", "10"] },
  "scope": { "country": "CN", "city": "Shanghai" }
}
```

- zh: 虹桥机场 T2 可接入上海地铁 2 号线和 10 号线。出发前查看当天运营公告，并以现场指引为准。
- en: For metro travel at Shanghai Hongqiao Airport T2, look for lines 2 and 10. Check service notices before traveling and follow signs at the airport.
- Both expressions communicate the same terminal and line set; the check-notices sentence is editorial advice, not an additional source-derived service guarantee. Retain the source date/link in the existing provenance presentation.

## Remaining acceptance

Source discovery and direct inspection of A/C: **PASS**, with B and the operator Metro page failures preserved above. Independent content/rights review, source registration, submission, publication, retrieval eligibility, Staging writes, withdrawal and native consumption of this new item: **UNRUN**. No remote writes, approval identities, publication receipts or user acceptance were fabricated. This one candidate does not complete city/scenario coverage or #205 acceptance.
