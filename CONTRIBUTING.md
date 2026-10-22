# Contribute

Keep changes small and evidence-backed. Run `npm ci --ignore-scripts` and `npm test`. Tests must work offline. Synthetic public-point fixtures deliberately have no signing keys and should never receive funds.

For interface changes, cite the official source revision and include a failing fixture. Unknown evidence must stay unknown; do not infer token safety, full history or tradability from account presence. Preserve exact integers, fixed diagnostics, output projection and receipt attribution.

For watch delivery, test crash/restart, duplicate IDs and corrupted state. At-least-once delivery is intentional. For dependencies, inspect exact versions/licenses and audit the resulting lockfile. Do not run install hooks or force a major SDK upgrade without compatibility checks.

Never submit credentials, raw provider errors, private keys, seed phrases, or confidential wallet records. Public issue reports should use sanitized data. New contributions are MIT; vendored notices remain intact.
