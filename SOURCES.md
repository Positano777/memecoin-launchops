# Source and reuse record

Reviewed 2026-10-22. This is an independent integration, not a Pump endorsement.

## Protocol facts

Official docs repository observed at revision **639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22**:

- [Coin creation](https://github.com/pump-fun/pump-public-docs/blob/639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22/docs/instructions/COIN_CREATION.md): create_v2 account roles, Token-2022, optional quote accounts, parameter limits and deprecated cashback.
- [PumpSwap](https://github.com/pump-fun/pump-public-docs/blob/639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22/docs/PUMP_SWAP_README.md): pool PDA seeds, canonical index, account fields and appended-field caveats.
- [Synthetic migration](https://github.com/pump-fun/pump-public-docs/blob/639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22/docs/SYNTHETIC_MIGRATION.md): curve completion precedes migration; pool-part activity can occur before pool creation. This observer does not count those trades.
- [Solana simulation RPC](https://solana.com/docs/rpc/http/simulatetransaction) and [multiple-account RPC](https://solana.com/docs/rpc/http/getmultipleaccounts): request and response contracts.

The npm registry artifact `@pump-fun/pump-sdk@4.1.0` was downloaded without execution; its SHA-512 integrity matched registry metadata. Its IDLs were inspected for discriminator/prefix facts and its PDA helpers cross-checked against documentation. Neither the SDK implementation nor its complete IDLs are shipped here. Package license metadata says MIT, but its 21-file archive omitted license text and the linked repository license endpoint returned 404. Hold redistribution pending license clarification. Source hashes and artifact integrity are recorded in [docs/abi-profile.json](docs/abi-profile.json).

The interface checker uses the standard Anchor discriminator hash and documented account derivations. Known prefixes may survive appended fields; this is not proof of complete ABI or deployed-code compatibility. Review [upstream issue 59](https://github.com/pump-fun/pump-public-docs/issues/59) before treating any IDL as executable provenance.

## Libraries reused

- `@solana/web3.js` **1.98.4**, MIT text inspected in its installed LICENSE. The exact transitive graph is in package-lock.json; package scripts are disabled. LaunchOps uses public-key/PDA and transaction parsing interfaces. It uses its own bounded RPC wrapper, not web3 Connection.
- Existing Positano receipt runtime at **20916fc2391326e5b9b69b1863c82fac02d1088a**, MIT, copied under `vendor/receipt` with LF-normalized text, original notices, and per-file SHA-256 manifest. No runtime behavior was changed. Its decoder bundle includes VTX-Labs/solana-explain pinned at **411a5f1aee7a7115f5bf739fcd5455f27a9ce591**, bs58 6.0.0 and base-x 5.0.1, all with retained MIT notices.

Current [PumpKit](https://raw.githubusercontent.com/nirholas/pumpkit/main/LICENSE) and [nirholas pump-fun-sdk](https://raw.githubusercontent.com/nirholas/pump-fun-sdk/main/LICENSE) license text is proprietary despite open-source descriptions. They are not dependencies or fork bases here. Historical versions require their own review.

## Network checks

The fee planner additionally follows the pinned official [sweep](https://github.com/pump-fun/pump-public-docs/blob/639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22/docs/instructions/SWEEP_FEES.md) and [collect](https://github.com/pump-fun/pump-public-docs/blob/639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22/docs/instructions/COLLECT_CREATOR_FEE.md) specifications. Counter offsets were checked against the existing inspected package IDLs recorded in docs/abi-profile.json. This independently authored read-only report does not redistribute official SDK implementation code or certify a claim route.

Canonical public mainnet RPC reported genesis hash `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d`. All eight program IDs used by the profile were observed executable in one confirmed account batch at slot **459898272**. This confirms provider-reported account properties, not binary provenance or program safety. Read-only observation examples are described in VALIDATION.md.
