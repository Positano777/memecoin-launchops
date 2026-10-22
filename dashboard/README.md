# LaunchOps dashboard — developer preview

A browser interface for the existing lifecycle, creator-fee and transaction-receipt engines. MIT, with retained third-party notices. Start with clearly marked synthetic data, inspect a public mint, or import an account snapshot. Download projected reports as JSON and transaction receipts as JSON or scriptless HTML.

## Run the checked-in build

From the repository root:

```sh
python -m http.server 8877 --bind 127.0.0.1 --directory dashboard/dist
```

Open http://127.0.0.1:8877. Static hosting needs only `dashboard/dist/`. No server, wallet connection, API key, analytics, browser storage, or dependency installation is required to serve this build. Hosting providers may separately log requests.

## Live RPC and imports

Live inspection sends public account addresses to `https://api.mainnet-beta.solana.com`. This provider can deny browser traffic, rate-limit, or fail; the browser smoke attempt on 2026-10-22 received HTTP 403. Live availability is not guaranteed. This preview does not accept private RPC credentials or proxy provider requests.

Import `examples/fees.synthetic.json` to try bound fee snapshots. For real data, use a LaunchOps fee snapshot with `schemaVersion`, `mint`, ordered `addresses`, and its raw `getMultipleAccounts` `result`. A raw six-account result is also accepted with the mint entered; it has partial vault coverage. Reports exported by this dashboard are projections, not re-importable raw account snapshots. Imported data is unverified and establishes neither network identity nor confirmation. Files stay in the tab; imports are limited to 5 MiB.

Receipt input is a saved `getTransaction` RPC JSON response with compiled encoding `json`, plus a public wallet appearing in it. The example and exact supported accounting limits come from the existing vendored receipt engine. Never put signing keys or secret-bearing RPC URLs in input files.

## Rebuild

The checked-in bundle was generated with esbuild **0.28.2**, using the repository's locked runtime dependencies. The bundler is a development tool, not a new runtime dependency. With that exact reviewed version already installed:

```sh
npm ci --ignore-scripts
node dashboard/build.mjs /absolute/path/to/esbuild/lib/main.js
npm test
```

Alternatively omit the argument if esbuild 0.28.2 is installed in your own build environment. The script rejects other versions, replaces Node SHA-256 with the existing noble implementation, injects Buffer, preserves package license notices, and writes SHA-256 asset hashes in `dist/build-manifest.json`. `bs58@4.0.1` omits a standalone license file; its README's explicit MIT declaration and credits are retained. Existing dependency advisories remain documented in the root SECURITY.md.

## Evidence limits

Lifecycle is a point-in-time supported-account observation. Current-step highlighting does not establish past transitions or complete history. Creator-wide vault balances include other coins and native rent; they are separate from per-mint waiting counters and are not presented as claimable earnings. Recipient routes require review. No signing, broadcasting, trading, claim construction, scheduled monitoring, or launch execution is implemented in the dashboard.
