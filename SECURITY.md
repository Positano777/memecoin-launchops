# Security and credential handling

This is a read-only/simulation developer preview. No wallet connection, signing, transaction submission, fund transfer, or external messaging is implemented. Public plan fields do not prove ownership of the supplied addresses.

- Keep signing keys, seed phrases, API credentials and private records outside the repository. Public plans reject unknown fields and query-bearing metadata URLs. Input files still require review; an arbitrary secret hidden in a public name or URI path cannot be reliably detected.
- RPC URLs live only in `SOLANA_RPC_URL`. Do not publish credential-bearing endpoints. Fixed diagnostics omit provider bodies, URLs, raw logs, instruction payloads and arbitrary extensions.
- Responses and files have size limits. RPC is allowlisted to genesis/account reads and simulation, with HTTPS or loopback HTTP, no redirects, and 20-second timeout.
- Simulation uses `sigVerify:false` and replaces the blockhash. It proves neither signing authority nor executable safety. A provider can lie; genesis and account checks are not independent verification.
- Only exact supported creation accounts/parameters and compute-setting layouts can reach simulation. No arbitrary additional instructions are approved by this profile. Budget is not enforced or estimated. Metadata content, mint extensions, pool pause/liquidity, full program bytes, and future upgrades are not validated.
- State is schema checked and private-field extensions are rejected. Do not edit it while a watcher is running. Events are unsigned reports with deduplication hashes, not authenticated blockchain certificates.

## Dependency audit, 2026-10-22

`npm audit --omit=dev` reports **four affected packages at moderate severity**, zero high/critical: `@solana/web3.js`, `jayson`, `stream-json`, and `uuid`. The first two are dependency-chain reports. Underlying advisories:

- [stream-json nested-filter complexity](https://github.com/advisories/GHSA-528h-pc64-c93x)
- [stream-json JSONC rescanning](https://github.com/advisories/GHSA-hqr4-qq8f-hg3x)
- [stream-json assembler prototype pollution](https://github.com/advisories/GHSA-mjw6-4jj6-33hc)
- [uuid buffer bounds for v3/v5/v6](https://github.com/advisories/GHSA-w5hq-g745-h8pq)

LaunchOps imports public-key and wire-parsing interfaces from web3.js. Its RPC wrapper uses bounded built-in fetch/JSON parsing. It does not call the affected streaming filters/assembler or UUID v3/v5/v6 paths. This is a scoped call-path review, not proof the installed graph is vulnerability-free. npm's suggested fix changes the direct SDK major version; no untested forced upgrade or major transitive override was applied. Keep this preview out of sensitive production signing services and review dependency changes separately.

No dependency install hooks were run. The repository `.npmrc` disables scripts, and documented installation uses `npm ci --ignore-scripts`.

## Secret scans

Scan tracked/proposed source and complete Git history with gitleaks and the included contextual Solana-key/phrase rules before releases. Exclude installed node_modules from the source snapshot; dependency audit is a separate check. Scanner success is not proof of absence or a full security audit. Do not paste suspected secrets into public issues; revoke an actual exposed credential first.
