# AI-27 city-first Explore design

## Objective

Add the public route and presentation boundary for city-first Explore without creating a second POI/Fact truth source or exposing any unreviewed data.

## Scope and assumptions

- Routes are `/explore`, `/explore/[city]`, and `/[city]/[poi]`.
- The current repository has no durable, publicly readable Explore Projection owner. The UI therefore has no eligible city or POI to render at this stage.
- A valid future projection must be derived from canonical POIs and facts that satisfy the existing `isEligibleFact` predicate: reviewed, unexpired, and licence-allowed.
- Five locales, Arabic RTL, responsive keyboard access, metadata, and an explicit unavailable state are required.

## Design

Each route renders the same small `ExploreUnavailableWorkspace` client boundary. It owns locale selection and document language/direction only; it accepts no text input, does not fetch, store, rank, map, create a Trip, or offer Ask/Add controls. The `/explore` route explains the city-first boundary. A city or POI route treats path parameters as display context only and never interprets them as canonical identity or evidence.

The visual hierarchy uses the existing VisePanda product shell vocabulary: restrained route marker, city-first heading, a single unavailable card, and a linked return to the product. There are no place cards, category badges, freshness claims, images, maps, or SEO content pages while the authoritative eligible projection is absent.

## Safety and acceptance

- RL-08: zero Candidate/Draft/importer fixtures can appear because the surface has no data source, no fixture list, and no card renderer.
- RL-09: zero expired capability badges can appear because the surface renders no capability badge or Fact-derived attribute.
- Tests prove the routes exist, declare no data/seed/map/write behavior, retain the existing eligibility predicate as the only future acceptance rule, and carry locale/RTL source wiring.
- Desktop 1280×800, mobile 390×844, and Arabic RTL are inspected locally.

## Anti-goals and rollback

No database, API, policy, canonical identity, Trip Proposal, Chat, import, map, booking, current-data, cache, remote asset, or production claim is added. Rollback is a normal revert of the isolated Explore routes and components; no data or external state needs repair.
