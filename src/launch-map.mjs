import { publicKey, requireThat } from "./common.mjs";
import {
  decodeBase58,
  encodeBase58,
} from "../vendor/receipt/vendor/decoders.mjs";
import {
  launchEvidence,
  parseEvidenceInput,
} from "../vendor/launch-evidence/launch-evidence.mjs";

const MAX = 2000;
const record = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
function list(v) {
  requireThat(
    Array.isArray(v) && v.length <= MAX,
    "Unsupported evidence list.",
  );
  return v;
}
function count(v) {
  requireThat(Number.isSafeInteger(v) && v >= 0, "Invalid evidence count.");
  return v;
}
function pct(v) {
  requireThat(
    typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1e9,
    "Invalid evidence amount.",
  );
  return v;
}
function signature(v) {
  requireThat(
    typeof v === "string" &&
      v.length <= 88 &&
      /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(v),
    "Invalid transaction signature.",
  );
  const bytes = decodeBase58(v);
  requireThat(
    bytes.length === 64 && encodeBase58(bytes) === v,
    "Invalid transaction signature.",
  );
  return v;
}
function tx(v) {
  const s = signature(v);
  return { signature: s, url: "https://solscan.io/tx/" + s };
}
function time(v) {
  if (v === null) return null;
  requireThat(
    Number.isSafeInteger(v) && v >= 0 && v <= 8e12,
    "Invalid evidence time.",
  );
  return v;
}
const REASONS = new Set([
  "block_unavailable",
  "block_fetch_failed",
  "creation_missing_from_block",
  "token_balance_metadata_missing",
  "sample_limit",
  "transaction_metadata_missing",
]);
export const MAP_LIMITS = Object.freeze([
  "Imported evidence is not independently verified blockchain data.",
  "The upstream launch-slot sampler excludes the creation transaction itself; its initial token allocations are not mapped.",
  "Positive fee-payer deltas can include transfers and repeated circulation. They are not unique supply held, purchases or current whale holdings.",
  "Dashed map lines associate a token with observations; they do not show wallet-to-wallet transfers or funding.",
  "Same-slot activity does not prove common control, insider access or Jito bundle membership.",
  "Creation fee payer and token creator are different roles; their identity relationship is unverified.",
  "Reported fee-payer outflows use upstream heuristics. This viewer does not independently decode sales, transfers, locks or burns.",
  "No complete wallet history, current balances, multi-hop trace, live monitoring or full launch-to-exit replay is established.",
]);

/** Validate and project known fields before display/export. Never trust supplied URLs or prose. */
export function normalizeLaunchEvidence(input) {
  requireThat(record(input), "Expected launch evidence or a saved token scan.");
  let e = input;
  if (input.schema !== "positano.launch-evidence.v1") {
    requireThat(input.schema === undefined, "Unsupported evidence schema.");
    const l = input.launch;
    if (record(l)) {
      for (const key of ["devSells", "devTransfers", "devLocks", "devBurns"])
        list(l[key]);
      list(l.bundled?.wallets);
      if (l.launchSlotEvidence !== undefined) list(l.launchSlotEvidence);
    }
    list(input.partial);
    e = launchEvidence(parseEvidenceInput(input));
  }
  const mint = publicKey(e.mint).toBase58();
  requireThat(
    Number.isSafeInteger(e.scannedAt) &&
      e.scannedAt >= 0 &&
      e.scannedAt <= 8e15,
    "Invalid scan time.",
  );
  requireThat(
    record(e.coverage) &&
      ["complete", "incomplete", "unavailable", "unknown"].includes(
        e.coverage.launchBlock,
      ),
    "Invalid coverage.",
  );
  const c = e.coverage,
    created = e.creation !== null;
  requireThat(
    c.creation === (created ? "located" : "unavailable"),
    "Inconsistent creation coverage.",
  );
  const creation = created
    ? {
        slot: count(e.creation?.slot),
        blockTime: time(e.creation?.blockTime),
        source: tx(e.creation?.source?.signature),
        feePayer:
          e.creation?.feePayer === null
            ? null
            : publicKey(e.creation?.feePayer).toBase58(),
        feePayerIsCreator: "unverified",
      }
    : null;
  let details = null;
  if (c.launchBlockDetails !== null) {
    const d = c.launchBlockDetails;
    requireThat(
      record(d) &&
        creation &&
        d.slot === creation.slot &&
        d.source === "getBlock",
      "Coverage slot mismatch.",
    );
    const inspected = count(d.inspectedTransactions),
      relevant =
        d.relevantTransactions === null ? null : count(d.relevantTransactions);
    const reasons = list(d.reasons).map((v) => {
      requireThat(REASONS.has(v), "Unsupported coverage reason.");
      return v;
    });
    requireThat(
      relevant === null || inspected <= relevant,
      "Invalid coverage denominator.",
    );
    if (c.launchBlock === "complete")
      requireThat(
        relevant !== null && relevant === inspected && reasons.length === 0,
        "Incomplete coverage marked complete.",
      );
    else
      requireThat(
        reasons.length > 0 && c.launchBlock !== "unknown",
        "Invalid partial coverage.",
      );
    if (c.launchBlock === "unavailable")
      requireThat(
        relevant === null && inspected === 0,
        "Unavailable coverage has observations.",
      );
    details = {
      slot: creation.slot,
      source: "getBlock",
      relevantTransactions: relevant,
      inspectedTransactions: inspected,
      reasons,
    };
  } else requireThat(c.launchBlock === "unknown", "Coverage details missing.");
  const warnings = list(c.warnings).map(
    () => "Scan warning (raw diagnostic omitted)",
  );
  let observations = null;
  if (e.launchSlotObservations !== null) {
    requireThat(
      creation && record(e.launchSlotObservations),
      "Observations have no creation.",
    );
    const o = e.launchSlotObservations,
      seen = new Map(),
      transactions = [];
    const wallets = [
      ...new Set(
        list(o.netAcquiringFeePayers).map((v) => publicKey(v).toBase58()),
      ),
    ];
    for (const row of list(o.transactions)) {
      const source = tx(row?.source?.signature),
        wallet = publicKey(row?.wallet).toBase58(),
        amount = pct(row?.positiveDeltaPctOfSupply);
      requireThat(
        amount > 0 && wallets.includes(wallet),
        "Inconsistent gain observation.",
      );
      const previous = seen.get(source.signature);
      if (previous) {
        requireThat(
          previous.wallet === wallet &&
            previous.positiveDeltaPctOfSupply === amount,
          "Conflicting transaction observation.",
        );
        continue;
      }
      const value = { source, wallet, positiveDeltaPctOfSupply: amount };
      seen.set(source.signature, value);
      transactions.push(value);
    }
    const transactionCount = count(o.transactionCount);
    requireThat(
      transactionCount >= transactions.length,
      "Transaction count mismatch.",
    );
    if (details)
      requireThat(
        details.inspectedTransactions >= transactionCount,
        "Gain count exceeds inspected coverage.",
      );
    requireThat(
      !["unavailable"].includes(c.launchBlock) || transactions.length === 0,
      "Unavailable block has transaction evidence.",
    );
    observations = {
      netAcquiringFeePayers: wallets,
      summedPositiveDeltasPctOfSupply: pct(o.summedPositiveDeltasPctOfSupply),
      transactionCount,
      transactions,
      purchasesVerified: false,
      coordination: "unverified",
      jitoBundleMembership: "unverified",
    };
  } else requireThat(!creation, "Located creation has no observation summary.");
  const outflows = list(e.feePayerOutflows)
    .map((row) => {
      requireThat(
        creation && ["sale", "transfer", "lock", "burn"].includes(row?.kind),
        "Unsupported reported outflow.",
      );
      const source = tx(row.source?.signature);
      requireThat(
        row.signature === source.signature,
        "Outflow signature mismatch.",
      );
      return {
        signature: source.signature,
        source,
        kind: row.kind,
        secondsAfterLaunch: time(row.secondsAfterLaunch),
        pctOfSupply: pct(row.pctOfSupply),
      };
    })
    .sort(
      (a, b) =>
        (a.secondsAfterLaunch ?? Infinity) - (b.secondsAfterLaunch ?? Infinity),
    );
  return {
    schema: "positano.launch-evidence.v1",
    mint,
    scannedAt: e.scannedAt,
    sourceEngine: "RugHawk community fork",
    syntheticExample: input.syntheticExample === true,
    coverage: {
      creation: c.creation,
      launchBlock: c.launchBlock,
      launchBlockDetails: details,
      warnings,
    },
    creation,
    launchSlotObservations: observations,
    feePayerOutflows: outflows,
    limitations: [...MAP_LIMITS],
  };
}

/** Percentages here are gross observed deltas, never unique holdings/concentration. */
export function launchMapSummary(e) {
  const o = e.launchSlotObservations,
    grouped = new Map();
  for (const row of o?.transactions ?? []) {
    const v = grouped.get(row.wallet) ?? {
      wallet: row.wallet,
      positiveDeltaPctOfSupply: 0,
      transactions: [],
    };
    v.positiveDeltaPctOfSupply += row.positiveDeltaPctOfSupply;
    v.transactions.push(row);
    grouped.set(row.wallet, v);
  }
  const wallets = [...grouped.values()].sort(
    (a, b) =>
      b.positiveDeltaPctOfSupply - a.positiveDeltaPctOfSupply ||
      a.wallet.localeCompare(b.wallet),
  );
  const total = wallets.reduce((sum, w) => sum + w.positiveDeltaPctOfSupply, 0);
  for (const w of wallets)
    w.shareOfMappedGains = total
      ? (w.positiveDeltaPctOfSupply / total) * 100
      : 0;
  return {
    wallets,
    mappedTransactions: o?.transactions.length ?? 0,
    mappedGainPctOfSupply: total,
    reportedFeePayers: o?.netAcquiringFeePayers.length ?? 0,
    reportedGainPctOfSupply: o?.summedPositiveDeltasPctOfSupply ?? null,
    hasTransactionEvidence: (o?.transactions.length ?? 0) > 0,
  };
}
