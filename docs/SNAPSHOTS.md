# Use CLI account snapshots in the dashboard

If Solana's public RPC denies browser traffic, export supported public accounts with the CLI, then import the file. The dashboard does not receive your CLI provider settings. This avoids requiring a browser RPC connection; it does not bypass a provider's access policy or guarantee that the provider will serve your CLI.

## Export a fresh snapshot

Use the existing source checkout with its dependencies installed. Set `SOLANA_RPC_URL` through your own environment or secret manager if you use a provider. Do not put a credential-bearing URL in a public plan, command pasted into an issue, shared screenshot or report. The default remains Solana's canonical public mainnet RPC.

```sh
node bin/launchops.mjs fees --mint PUBLIC_MINT --snapshot-out accounts.json
```

Replace `PUBLIC_MINT`. The output path must not already exist. `--snapshot-out` cannot be combined with `--snapshot` or `--out`: it is a new live account export. `--out` continues to write an interpreted fee report, which is a different format and cannot be imported as raw accounts.

The CLI verifies the provider's reported mainnet genesis hash, discovers supported fee recipients, then fetches base and vault accounts together at confirmed commitment. It rejects regressing slots, changed recipients/quote bindings, incomplete responses, unsafe numeric lamports, invalid account owners and malformed encodings. Unknown appended fee fields may still produce partial fee coverage. Unsupported lifecycle/quote/legacy layouts can refuse export. No signing or transaction submission occurs.

The file contains schemaVersion, mint, ordered addresses and a result with slot and projected public account fields. Program entries retain only the executable flag used by the observer; program binaries and provenance are not verified. Other entries retain owner, executable, exact lamports strings and base64 account data. Provider envelopes, URLs, diagnostics and unknown response properties are omitted. Base64 account data remains public chain data and is not decoded exhaustively by this tool; review any file before sharing.

## Import and interpret

Open LaunchOps → Launch overview → Import accounts, then select the new file. Imported files are processed locally in the browser tab and limited to 5 MiB. The dashboard deliberately labels the result **Imported accounts**, with network and confirmation unverified: a file is not independent proof of its origin, even when the CLI originally fetched it.

The observed slot is a point-in-time snapshot. It does not refresh, prove full history or establish token safety/tradability. Creator-wide vault balances remain separate from this mint's waiting counters. No claimability is established. Re-export to inspect a newer observation, using another filename.

## Checked example

On 2026-10-22, the CLI exported nine accounts for public mint `7LSsEoJGhLeZzGvDofTdNg7M3JttxQqGWNLo6vWMpump` at slot 459920222. Chrome imported that file, displayed a canonical pool observation and retained the unverified-import label. This verifies one CLI-to-browser path, not all providers, token modes or future interfaces. Direct browser RPC access remains provider-dependent; its previous smoke attempt returned HTTP 403.
