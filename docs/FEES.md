# Creator fee report

`fees` is a point-in-time accounting aid, not an automatic claim service. It supports canonical SOL/USDC Pump coins, reusing LaunchOps account identity checks and exact-integer parsing. No new dependencies or RPC methods were added.

## What is separated

| Field | Scope and meaning |
|---|---|
| `sources[].waitingRaw` | This mint's waiting creator-fee counter on the curve or pool |
| `waitingForThisMintRaw` | Sum of the observed counters only, if all present sources have readable fee fields and agree on quote |
| `sources[].vault.raw` | Creator-wide gross native or quote-token balance; it may contain fees from other coins or unrelated funds |
| `recipientMode` | Observed holder flag or limited account-owner context; not verified entitlement or sharing configuration |
| `steps` | Conditional non-executable hints; live route and payer costs still require review |

The native Pump vault amount includes any rent reserve. The report does not subtract rent or label its entire balance claimable. PumpSwap's SOL source is a wrapped-SOL token vault, so its raw token amount is displayed separately from native account rent. Missing, frozen, mismatched or unprovided token vaults remain unknown. An absent vault is not turned into zero claimable funds.

The counter layouts follow the pinned interface reference: curve creator-fee u64 at byte 125, pool creator-fees u64 at byte 279; creator and quote fields are separately checked. A missing trailing counter remains null in this conservative preview rather than assuming a legacy zero. Full executable/ABI compatibility and all token extensions remain outside coverage. The [ABI record](abi-profile.json) names the inspected source artifact.

## Understand the route

The official [sweep documentation](https://github.com/pump-fun/pump-public-docs/blob/639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22/docs/instructions/SWEEP_FEES.md) distinguishes accumulated fees from payouts. Sweep is movement into a vault, not new earned income. For a reviewed single-recipient route, the reference sequences are:

- Curve: `sweep_creator_fee`, then `collect_creator_fee_v2`.
- Pool: `sweep_creator_fee`, then `collect_coin_creator_fee`.
- Sharing configurations instead need the appropriate transfer/distribution route after sweeps; holder-reward coins use their own distribution flow.

The [claim documentation](https://github.com/pump-fun/pump-public-docs/blob/639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22/docs/instructions/COLLECT_CREATOR_FEE.md) limits ordinary creator claims to coins without a migrated sharing configuration. This tool does not establish that condition. A system-owned on-curve recipient is only a `wallet_candidate_unverified`, never an approved claim route. No automatic claimant, instruction builder, or notification delivery is included.

## Snapshot and live coverage

Offline input is `{schemaVersion:1, mint, addresses, result}`. `addresses` starts with the six ordered base accounts used by the watcher, then unique recipient/vault accounts. `result` is the corresponding getMultipleAccounts result with one context slot. Address binding, account count and relevant owner/mint/authority/state fields are checked. Supplied files are not independently verified.

Live reads first discover recipients, then fetch the complete account set again using `minContextSlot`. The final read must preserve the discovered recipient/quote binding and have a non-regressing slot. Amounts may change between discovery and the final read; only the final coherent batch is reported. Raw provider diagnostics, unknown extensions and endpoints are omitted. Reports contain public activity, so review before sharing.

`balances_observed` describes readable counters and gross balances, not claimability. `partial` has exit code 2, preserving nulls and an explicit limitation. Malformed/unsupported evidence never becomes a clean zero. There is no lifetime/claimed income, valuation, annualized yield, or trade PnL calculation.
