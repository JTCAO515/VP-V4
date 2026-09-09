# Redirect boundary review fix

Base: `1d273ad22cf48b5a32840cddbfd70614ac7d8ef7`. Only the final review's redirect finding is addressed; SQL and previous acceptance evidence are unchanged.

- Swift's actual `URLSessionTaskDelegate` rejects every HTTP redirect using `completionHandler(nil)` before another request can be sent.
- `nativeFetch` forces Fetch `redirect: "error"` for every native Supabase client: password/refresh exchange, trusted proof provisioning, credential verification/JWKS/Auth fallback, and the returned JWT-bound `from`/`rpc` client. It preserves Request/init headers and cancellation signals.
- Controlled loopback source/sink servers exercised 307 and 308 through the real SDK. Credentials, refresh, service proof, JWKS, Auth fallback, reads and RPCs each observed a real first-hop redirect and **zero second-hop requests**. No external destination was contacted and no SDK raw exception or credential was logged. Three tests passed, zero skip; see `redirect-sdk-tests.log`.
- The assigned iOS 26.5 Simulator ran the real production URLSession/delegate path. Password and refresh redirects returned the original 307/308 failure, sink request counts stayed zero, and a subsequent normal refresh restored the same account from retained credentials. The same run also passed the ordinary real local Auth/Profile/Keychain/account-switch chain and default-disabled configuration: **3 tests, 0 failures, 0 skip**. Result: `/tmp/vpj04-native-model-1788997510220.xcresult`.
- Fresh 27-migration Supabase (59821) → Next (59831) complete normal identity, Cookie/Origin, concurrency and revocation regression passed: **1 test, 0 failures, 0 skip**. Exact synthetic cleanup assertions passed; see `redirect-normal-chain.log`.
- Lint, TypeScript check, 33 existing identity contract/security tests, ad-hoc Simulator build-for-testing, and diff checks passed. The SQL SHA256 remains `21fa91dd7e352edccf80ee6ec485e28f85f2f6ba0ee39d40c55f7d3da0618d79`.

Commands:

```sh
node --experimental-strip-types --test tests/security/identity/native-redirects.test.mjs
VP_IDENTITY_SUPABASE_WORKDIR=/Users/jtcao/Library/Caches/visepanda/native-local-session/instance-qrpqhzdi VP_IDENTITY_SUPABASE_API_URL=http://127.0.0.1:59721 VP_NATIVE_MODEL_ONLY=true node tests/integration/identity/run-native-simulator.mjs
VP_IDENTITY_SUPABASE_WORKDIR=/Users/jtcao/Library/Caches/visepanda/native-local-session/replay-k_ck2iz0 VP_IDENTITY_SUPABASE_API_URL=http://127.0.0.1:59821 VP_NATIVE_API_PORT=59831 VP_NATIVE_LOCAL_INTEGRATION=true node --test tests/integration/identity/native-local-session.test.mjs
```

Controlled transport fixtures prove redirect behavior only; the separately listed ordinary Auth/Keychain and fresh database runs prove the normal identity chain. Existing physical-device, iOS 17.5, push and remote-release unrun boundaries remain unchanged. The parent's additional budget regression is recorded separately in `budget-regression-root.json`; it does not represent a provider call or spend.
