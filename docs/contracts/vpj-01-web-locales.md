# VPJ-01 Web release languages and legacy compatibility

Related to VPJ-01 #188; implements the Web language-discovery portion of ADR-0023.
This slice does not complete native/device acceptance or VPJ-41 same-Trip integration.

## Selection contract

`Locale`, `localeOptions`, five-language copy and existing payload parsers remain unchanged.
The complete metadata list continues to support labels, flags and currencies for legacy data.
`getLocaleSelectionOptions(currentLocale)` is the only language-picker discovery rule:

- Current zh/en: offer zh and en.
- Current es/ru/ar: offer zh, en and that current legacy value, preserving its original label.
- After switching to zh/en, remove the legacy option from discovery.

All 21 consumers previously mapping `localeOptions` use this helper. No currency, server,
TripProposal/Patch, RLS, privacy or licence behavior changes. Existing five-language copy and
payload tests remain meaningful compatibility coverage, not a five-language release promise.
Journey preview's existing bilingual controls are unchanged.

## Legacy entry and direction

The canonical Chat workspace (`/visepanda`) initializes its locale with the
existing `parseLocale` parser from the `locale` query parameter. For example,
`/visepanda?locale=ar` renders the Arabic selected label, Arabic title and document-level
`lang="ar" dir="rtl"`. Invalid/missing values use the existing zh fallback. Changing the
selection to English or Chinese updates document language/direction and removes legacy discovery.
Selection remains component-local; switching does not rewrite the URL or persist a preference.
Reloading a legacy URL therefore restores its explicit legacy locale.
Other routes retain their existing locale initialization; this is not a claim of cross-route
URL synchronization or complete legacy URL support on every page.

## Verification and rollback

The locale unit test checks release/active-legacy selection, metadata identity, parsing and wire
context preservation for every locale. The dedicated browser regression checks desktop and
390x844 selection, all legacy URL values, Arabic label/title/RTL, return to English/Chinese and
horizontal overflow. API responses in that regression are controlled fixtures; no live identity
or Trip capability is claimed. The existing keyboard/RTL test now enters through the explicit
legacy URL instead of advertising Arabic in a new user's picker.

See `artifacts/VPJ-01-web-locales/` for scope, verification and remaining gates. Revert this PR
for rollback; no storage or migration changes require data recovery.
