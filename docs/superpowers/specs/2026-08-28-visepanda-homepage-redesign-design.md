# VisePanda immersive Homepage redesign

## Objective

Replace the public root Homepage with an independently expressed VisePanda travel entry inspired by the supplied interaction pattern: a full-viewport Chinese-landmark scene, a legible top fade, and a frosted planning prompt. Preserve existing product boundaries and route contracts.

## Information architecture

- `/` becomes the new public Homepage.
- `/homepage` renders the current `components/homepage/Homepage` experience unchanged as the relocated legacy landing route.
- The new page keeps `Open VisePanda` as the primary CTA to `/visepanda`, as required by ADR-0018.
- A secondary, clearly labelled `Explore the guide` button navigates to `/homepage`, satisfying the requested new route without replacing the product-entry CTA.

## Visual system and content

- Use the approved local `public/assets/visepanda/hero-beijing.jpg` through `next/image`; do not use the supplied Wandor external video, name, colours, fonts, copy, or Vite-specific structure.
- Retain the reference's spatial idea only: full-bleed landmark image, white-to-transparent top gradient, centered navigation, large calm heading, and rounded frosted prompt panel.
- Use existing VisePanda tokens/local fonts and the five-locale copy system. Chinese copy presents a Golden Route/Guide planning example without claiming live AI, booking, inventory, current facts, or persistence.
- The prompt panel is presentational. Its upload affordance is disabled/truthfully labelled unless an existing approved import surface owns the interaction; it must not create a new raw-file or persistence path.

## Components and accessibility

- Keep `app/page.tsx` a Server Component and compose a typed Homepage component. Isolate only required browser interaction behind a client component.
- Navigation uses real internal links, visible focus styles, semantic labels and at least 44 px touch targets.
- Mobile hides nonessential centre navigation, retains both route actions, avoids horizontal overflow, and respects Arabic RTL and reduced motion.
- The background remains a static approved image; no map is introduced and map-off remains the default.

## Verification and rollback

- Add test-first coverage for the root and `/homepage` route ownership plus both CTA destinations.
- Run the repository frontend gates and inspect desktop, 390x844, and Arabic RTL output before merge; no browser screenshot or deployment is claimed unless actually produced.
- Roll back by reverting only this branch's route/components/tests/docs. It creates no durable, provider, account, asset, or external state.
