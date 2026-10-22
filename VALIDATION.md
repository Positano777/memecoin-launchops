# Preview validation

Reviewed 2026-10-22 under Node.js 22.18.0 on Windows.

## Creator-fee milestone: v0.2.0-preview.1

All 93 tests pass: the original 75 plus 18 fee cases. New cases cover creator-wide versus mint-specific scope, exact large counters, SOL/USDC vaults, unknown trailing fields, holder/shared routing, zero counters, missing/frozen/mismatched vaults, account binding, coherent two-stage reads, changed recipients, stale slots, redaction, offline CLI and overwrite refusal. No signing or claim was tested or performed.

A read-only mainnet fee report for public example mint `7LSsEoJGhLeZzGvDofTdNg7M3JttxQqGWNLo6vWMpump` succeeded at slot 459905690: both curve/pool fee counters and distinct creator vault balances were readable. Its per-mint waiting total was 122360 raw SOL units at that instant. Vault balances were kept out of that total. This is one provider smoke test, not an independent income audit or a claimability test. Live USDC/holder/shared scenarios remain unverified; their regression cases are synthetic.

The refreshed dependency audit still reports four moderate affected packages, zero high/critical. No dependency versions or RPC method permissions changed. See [fee coverage](docs/FEES.md) before using these reports.

## Initial v0.1.0 preview checks

- The initial 75 tests cover public plan validation/redaction, exact transaction binding, SOL/USDC optional accounts, legacy and v0 static messages, rejection of lookup tables/extra programs/trailing data, simulation success/failure projection, lifecycle evidence/unknown coverage, canonical pool identity, stale slots, restart/outbox delivery, corrupt state, locking, bounded RPC transport, CLI behavior, overwrite refusal, receipt integration and vendored file hashes.
- The documented canonical pool derivation is checked against an independently specified public example, not only synthetic fixtures produced by our own helpers.
- Tests make no live RPC calls. Temporary files are isolated and removed by the tests.
- The inherited receipt runtime is copied from its pinned tested preview; its existing 37 tests were previously run upstream. LaunchOps adds integration/hash checks, not a claim to have reimplemented its accounting.

Run `npm ci --ignore-scripts`, then `npm test`. There is no TypeScript compile or application build step. Source is executable ESM. The package lock pins 57 installed dependencies; lifecycle scripts were not executed.

## Read-only mainnet smoke checks

Using canonical public Solana mainnet RPC:

| Check | Observation |
|---|---|
| Mainnet identity | Full expected genesis hash matched the provider response |
| Active curve | Mint `9U32MnGjepKLPFwGPgJUppiNhFemGa3JSho329qWpump`, slot 459897326: `curve_active` |
| Canonical pool | Mint `7LSsEoJGhLeZzGvDofTdNg7M3JttxQqGWNLo6vWMpump`, slot 459897741: `pool_observed`; derived pool matches the official example `GseMAnNDvntR5uFePZ51yZBXzNSn7GdFPkfHwfr6d77J` |
| Program IDs | All eight program IDs in the profile returned executable in one confirmed batch at slot 459898272 |
| Simulation transport | Synthetic unsigned creation transaction reached `simulateTransaction` at slot 459897739 and returned failure; its synthetic payer is unfunded. No positive live creation simulation was established. |

Mainnet smoke results are point-in-time provider reports, not independent binary/ABI validation or a complete launch history. Synthetic simulation never signed or broadcast a transaction and did not create or fund a wallet/coin. No transaction fee was paid by this project.

No live migration-pending interval was captured, no live USDC pool case was checked, and no funded creation simulation was performed. Those paths have synthetic regression coverage only. Metadata content, wallet balances, token extensions, pool trading status/liquidity, complete history, deployed executable provenance, and future upgrades remain unverified.

## Dependency and credential review

Clean installation from a separate source copy passed `npm ci --ignore-scripts` followed by all 75 tests. No dependency cache or node_modules was copied into that installation.

See SECURITY.md for four moderate affected-package reports, no reported high/critical advisories, call-path limits, and retained licenses. Dependency audit is separate from secret scanning. Gitleaks 8.30.1 scanned the tracked/proposed source snapshot with contextual Solana key/phrase rules and found zero matches. History is checked before release. Scanner success cannot prove absence of secrets or application vulnerabilities.

## Distribution

This preview is source plus CLI documentation and examples. No hosted site, background service, notification account, signing adapter, token, or trade was deployed. Release status remains prerelease.
