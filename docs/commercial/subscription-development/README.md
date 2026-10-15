# Monthly subscription development contract

Issue [AGENT-018 #225](https://github.com/JTCAO515/VP-V4/issues/225). This isolated default-off catalog implements the accepted Free + monthly subscription development direction. It does not enable sales or grant capacity. The old non-renewing Journey Pass remains a separate, unchanged 720-hour product and ledger.

## Consumer interface

Import from `lib/server/entitlements/subscription-development/index.ts`:

- `subscriptionDevelopmentCatalog` / `SubscriptionDevelopmentCatalog`: deeply frozen canonical policy snapshot, schema `subscription-development/1`, catalog version `3`, policy `subscription-development-policy/1`.
- `validateSubscriptionDevelopmentCatalog(unknown)`: asserts the exact closed snapshot, rejecting unknown or missing keys, altered values/types and unsupported versions. Key ordering is irrelevant. Consumers must validate parsed JSON before using it. Future changes require explicit version support; never silently accept the latest version.
- `subscriptionDevelopmentPresentation(locale, input?)` / `SubscriptionDevelopmentPresentation`: frozen zh/en display input. Includes non-sale state and shared benefits; excludes development quantities, remaining balance, entitlement eligibility and subscribed status. Unsupported locale or catalog fails closed.
- `subscriptionDevelopmentStoreKitConfiguration(input?)`: fresh local-only Apple configuration, containing one auto-renewable monthly subscription group. Its synthetic `0.99` test price has no sales meaning. Canonical product price and real SKU remain `null`, with `purchasable=false` and `saleState=development_only`.

`catalog.json`, `presentation.en.json`, `presentation.zh.json` and `monthly.storekit` are generated from that interface. Native and backend consumers share the same versions. Generated JSON is input, not a second entitlement or ledger authority. The unified entitlements index is intentionally left for Main integration; this nested index is the complete candidate export surface.

## Policy and compatibility

Free reuses the existing authority by reference: four complete tasks in an account rolling 168-hour window and burst two in 24 hours. Free and subscription share explicit cross-Trip preferences and Trip/data controls; basic memory, correction, export/deletion and usable first value remain Free. Existing consent, scope, lifecycle and actor isolation still govern access.

Monthly subscription development baseline is a new snapshot: 80 complete ServiceTasks per verified Apple period and burst 12 per account rolling 24 hours. These are developer inputs, not an actual balance, cost-economics conclusion or promise of sale capacity. They are never included in the presentation exports. They do not rename old Ask quantities. Complete-task settlement, partial release, clarification/repair, new-scope admission, cancellation, one lifetime settlement, unknown-cost reconciliation and rolling-window accounting reuse the accepted task semantics. A wait expires 24 hours after first wait, clamped to the verified period end; retries do not extend it. Crossing periods expires the reservation and requires explicit resume with current eligibility and capacity, without automatic next-period debit.

The subscription period is defined only by trusted verified Apple purchase/expires boundaries, start inclusive and end exclusive. It has no elapsed-hour constant or device-calendar calculation. Ledger ownership of verified period identity, qualification, renewal/revocation/expiry state and atomic capacity allocation remains with #226/#227. This catalog cannot create a period or grant. Persist the catalog/policy/capacity snapshot on the corresponding original period; never rewrite old grants. A restore, refunded-period replay or repeated renewal for the same period cannot refill capacity. Only a distinct verified period may allocate its new snapshot, never before that period starts; legacy Pass queue arithmetic does not apply. Refund affects the matching period only; unused capacity does not carry forward.

Paid development scope concerns research, constraint checks, complex coordination and continuing tasks. Commission metadata never improves organic ranking: apply the same fit rules to commissioned and uncommissioned candidates, disclose commercial exits and candidate coverage, and preserve independent assistant value when users book elsewhere. No external execution, contracting or fulfillment is enabled here.

Arrival/post-purchase activation, eSIM, payment-channel changes, unlimited service and included human service remain excluded. Annual subscription is research requiring repeat-travel/continuing-value, cost and responsibility evidence; it is not a product in this catalog. Real sales require actual account SKU, storefront price, tax, contracting entity, cost and public entitlement verification. Historical USD Pass experiments are not a monthly price.

## Generate and verify

From repository root, using the existing Node runtime (no install required):

```sh
node lib/server/entitlements/subscription-development/generate.mjs
node lib/server/entitlements/subscription-development/generate.mjs --check
node --test tests/contract/subscription-development/catalog.test.mjs
sh tests/contract/subscription-development/probe-storekit.sh
```

The last command compiles an isolated temporary macOS app using the installed Xcode StoreKitTest framework, ad-hoc signs only that temporary probe with debugging entitlement, loads the local file, and requests `Product.products`. It checks `.autoRenewable`, month/value 1, subscription group, test price and nonempty display price. It never purchases, logs into Apple, uses a simulator, creates an external product or changes a global signing configuration. Temporary files are removed on exit. This is local product-read evidence only, separate from any Sandbox transaction, renewal, refund, restore or ledger acceptance.

Apple documents that [local StoreKit configurations](https://developer.apple.com/documentation/xcode/setting-up-storekit-testing-in-xcode) describe subscription groups and auto-renewable subscriptions and do not upload products/prices to App Store Connect. The installed Xcode StoreKit core recognizes `RecurringSubscription`, `subscriptionGroupID` and `recurringSubscriptionPeriod`; the runtime probe provides the actual product-type/period check. Do not infer a Sandbox transaction from JSON shape or successful compilation.

Source tests pin original legacy catalog, generator and generated bytes to base `61caa52a03cb59ff0075b8cf59c63994c30821e1`. Tests exercise all nested missing/extra keys and leaf type/value changes, immutability, unsupported versions/locales, default-off sales, Free authority reuse, period distinction, display claim boundaries and deterministic output bytes. Downstream Native display/API/ledger integration and real Sandbox/provider/human acceptance require their own evidence.
