import {
  PROGRAMS,
  publicKey,
  requireThat,
  LaunchError,
} from "../src/common.mjs";
import { ReadRpc } from "../src/rpc.mjs";
import { observe } from "../src/lifecycle.mjs";
import { baseAddresses, feeAddresses, feeReport } from "../src/fees.mjs";
export const PUBLIC_RPC = "https://api.mainnet-beta.solana.com";
export function formatRaw(raw, decimals = 9) {
  if (raw === null || raw === undefined) return "Unknown";
  requireThat(
    typeof raw === "string" &&
      /^-?(0|[1-9][0-9]{0,39})$/.test(raw) &&
      Number.isInteger(decimals) &&
      decimals >= 0 &&
      decimals <= 18,
    "Invalid amount.",
  );
  const n = BigInt(raw),
    a = n < 0n ? -n : n,
    factor = 10n ** BigInt(decimals),
    fraction = (a % factor)
      .toString()
      .padStart(decimals, "0")
      .replace(/0+$/, "");
  return `${n < 0n ? "-" : ""}${a / factor}${fraction ? "." + fraction : ""}`;
}
export function fromSnapshot(mint, snapshot, source = "supplied_snapshot") {
  publicKey(mint);
  const bundled =
    snapshot?.schemaVersion === 1 && Array.isArray(snapshot.addresses);
  if (bundled)
    requireThat(
      snapshot.mint === mint &&
        baseAddresses(mint).every((a, i) => snapshot.addresses[i] === a),
      "Snapshot does not match the entered mint.",
    );
  const result = bundled ? snapshot.result : snapshot;
  const lifecycle = observe(mint, {
    context: result?.context,
    value: result?.value?.slice(0, 6),
  });
  const fees = feeReport(
    mint,
    bundled
      ? snapshot
      : { schemaVersion: 1, mint, addresses: baseAddresses(mint), result },
  );
  return {
    schemaVersion: 1,
    tool: "LaunchOps dashboard report",
    source,
    mint,
    generatedAt: new Date().toISOString(),
    lifecycle,
    fees,
  };
}
export async function inspectMint(mint, rpc = new ReadRpc(PUBLIC_RPC)) {
  publicKey(mint);
  await rpc.verifyMainnet();
  const first = await rpc.call("getMultipleAccounts", [
    baseAddresses(mint),
    { encoding: "base64", commitment: "confirmed" },
  ]);
  let keys;
  try {
    keys = feeAddresses(mint, first);
  } catch {
    const report = fromSnapshot(mint, first, "live_rpc");
    report.lifecycle.coverage.genesisHashChecked = true;
    report.fees.coverage.genesisHashChecked = true;
    return report;
  }
  const result = await rpc.call("getMultipleAccounts", [
    keys,
    {
      encoding: "base64",
      commitment: "confirmed",
      minContextSlot: first.context.slot,
    },
  ]);
  requireThat(
    Number.isSafeInteger(result?.context?.slot) &&
      result.context.slot >= first.context.slot,
    "RPC returned a stale observation. Retry.",
  );
  requireThat(
    JSON.stringify(feeAddresses(mint, result)) === JSON.stringify(keys),
    "Recipient or quote changed during this read. Retry.",
  );
  const report = fromSnapshot(
    mint,
    { schemaVersion: 1, mint, addresses: keys, result },
    "live_rpc",
  );
  report.lifecycle.coverage.genesisHashChecked = true;
  report.fees.coverage.genesisHashChecked = true;
  report.fees.source.kind = "live_rpc";
  return report;
}
export const STATUS = {
  curve_active: {
    label: "Curve active",
    description: "An incomplete bonding curve was observed.",
    step: 0,
  },
  migration_pending: {
    label: "Migration pending",
    description: "The curve is complete; the checked canonical pool is absent.",
    step: 1,
  },
  pool_observed: {
    label: "Pool observed",
    description:
      "The canonical pool address and supported account fields match.",
    step: 2,
  },
  not_observed: {
    label: "Not observed",
    description: "The mint and checked accounts are absent in this response.",
    step: -1,
  },
  unknown: {
    label: "Unknown",
    description:
      "The available evidence does not establish a supported lifecycle state.",
    step: -1,
  },
};
