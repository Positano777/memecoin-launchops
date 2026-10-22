import { PublicKey } from "@solana/web3.js";
import {
  PROGRAMS,
  QUOTES,
  publicKey,
  pda,
  ata,
  uint,
  requireThat,
} from "./common.mjs";
import { observe, watchAddresses } from "./lifecycle.mjs";

function accountBytes(account, minimum) {
  requireThat(
    account?.executable === false &&
      Array.isArray(account.data) &&
      account.data[1] === "base64" &&
      typeof account.data[0] === "string" &&
      account.data[0].length <= 32768,
    "Unsupported account encoding.",
  );
  const b = Buffer.from(account.data[0], "base64");
  requireThat(
    b.length >= minimum && b.toString("base64") === account.data[0],
    "Malformed account data.",
  );
  return b;
}
export function baseAddresses(mint) {
  const a = watchAddresses(mint);
  return [PROGRAMS.pump, PROGRAMS.swap, mint, a.curve, a.poolSOL, a.poolUSDC];
}
function sources(mint, result) {
  const lifecycle = observe(mint, {
    context: result?.context,
    value: result?.value?.slice(0, 6),
  });
  requireThat(
    ["curve_active", "migration_pending", "pool_observed"].includes(
      lifecycle.lifecycle,
    ),
    "Cannot establish a supported curve/pool observation.",
  );
  const rows = [];
  if (result.value[3]) {
    const b = accountBytes(result.value[3], 115),
      creator = new PublicKey(b.subarray(49, 81)).toBase58();
    const q = new PublicKey(b.subarray(83, 115)).toBase58(),
      quote = q === PROGRAMS.system ? QUOTES.SOL : q;
    requireThat(
      [QUOTES.SOL, QUOTES.USDC].includes(quote) && creator !== PROGRAMS.system,
      "Unsupported quote or creator.",
    );
    requireThat(b.length < 125 || b[124] <= 1, "Malformed holder-reward flag.");
    rows.push({
      program: "Pump",
      account: baseAddresses(mint)[3],
      creator,
      quote,
      holderRewards: b.length >= 125 ? b[124] === 1 : null,
      waitingRaw: b.length >= 133 ? b.readBigUInt64LE(125).toString() : null,
      vault: pda(PROGRAMS.pump, "creator-vault", publicKey(creator).toBuffer()),
      balanceKind: quote === QUOTES.SOL ? "native_lamports" : "token_raw",
    });
  }
  if (lifecycle.pool) {
    const index = lifecycle.pool.quoteMint === QUOTES.SOL ? 4 : 5,
      b = accountBytes(result.value[index], 243),
      creator = new PublicKey(b.subarray(211, 243)).toBase58();
    requireThat(
      creator !== PROGRAMS.system,
      "Legacy pool creator-fee recipient is unavailable.",
    );
    requireThat(b.length < 271 || b[270] <= 1, "Malformed holder-reward flag.");
    rows.push({
      program: "PumpSwap",
      account: lifecycle.pool.address,
      creator,
      quote: lifecycle.pool.quoteMint,
      holderRewards: b.length >= 271 ? b[270] === 1 : null,
      waitingRaw: b.length >= 287 ? b.readBigUInt64LE(279).toString() : null,
      vault: pda(PROGRAMS.swap, "creator_vault", publicKey(creator).toBuffer()),
      balanceKind: "token_raw",
    });
  }
  requireThat(
    rows.length > 0 && new Set(rows.map((r) => r.quote)).size === 1,
    "Fee sources disagree on quote.",
  );
  for (const row of rows)
    row.balanceAccount =
      row.balanceKind === "native_lamports"
        ? row.vault
        : ata(row.vault, row.quote, PROGRAMS.token);
  return { lifecycle, rows };
}
export function feeAddresses(mint, result) {
  const { rows } = sources(mint, result);
  return [
    ...new Set([
      ...baseAddresses(mint),
      ...rows.flatMap((r) => [r.creator, r.balanceAccount]),
    ]),
  ];
}
function rawBalance(account, row) {
  if (account === undefined) return { status: "not_supplied", raw: null };
  if (account === null) return { status: "account_absent", raw: null };
  try {
    requireThat(
      account.executable === false,
      "Executable vault is unsupported.",
    );
    if (row.balanceKind === "native_lamports") {
      // Show gross lamports only. Owner/layout and rent reserve are not claimability checks.
      const n =
        typeof account.lamports === "number" &&
        Number.isSafeInteger(account.lamports) &&
        account.lamports >= 0
          ? BigInt(account.lamports)
          : uint(account.lamports);
      return {
        status: "gross_balance_only",
        raw: n.toString(),
        includesRent: true,
      };
    }
    requireThat(account.owner === PROGRAMS.token, "Wrong token program.");
    const b = accountBytes(account, 165);
    requireThat(
      b.length === 165 &&
        b.subarray(0, 32).equals(publicKey(row.quote).toBuffer()) &&
        b.subarray(32, 64).equals(publicKey(row.vault).toBuffer()) &&
        b[108] === 1,
      "Token vault mint, authority, or state mismatch.",
    );
    return {
      status: "token_balance_observed",
      raw: b.readBigUInt64LE(64).toString(),
      includesRent: false,
    };
  } catch {
    return { status: "unknown", raw: null };
  }
}
export function feeReport(mint, snapshot) {
  publicKey(mint);
  const base = {
    schemaVersion: 1,
    tool: "Memecoin LaunchOps / fees",
    mint,
    source: { kind: "supplied_snapshot" },
    status: "partial",
    waitingForThisMintRaw: null,
    sources: [],
    steps: [],
    coverage: {
      kind: "point_in_time",
      decoderProfile: "pump-sdk-4.1.0-prefix",
      accountsAtSameSlot: false,
      genesisHashChecked: false,
      independentlyVerified: false,
      lifetimeIncomeComputed: false,
      claimabilityVerified: false,
    },
    limits: [
      "Waiting fee counters belong to this mint; creator vault balances may aggregate many coins. Never add them as this coin's lifetime earnings.",
      "SOL vault lamports include any rent reserve; gross balance is not claimable balance. Token balances are raw quote-token units.",
      "A sweep moves accrued fees; it is not new income or a payment to the creator wallet.",
      "Sharing configuration, recipient entitlement, holder-reward distribution, and executable provenance are not verified. Step hints are not executable transactions.",
      "Missing trailing fee counters stay unknown. No lifetime/claimed totals, price valuation, signing, or transaction submission is provided.",
    ],
  };
  try {
    requireThat(
      snapshot?.schemaVersion === 1 &&
        snapshot.mint === mint &&
        Array.isArray(snapshot.addresses) &&
        snapshot.addresses.length <= 20 &&
        Array.isArray(snapshot.result?.value) &&
        snapshot.result.value.length === snapshot.addresses.length,
      "Invalid fee snapshot.",
    );
    snapshot.addresses.forEach(publicKey);
    requireThat(
      new Set(snapshot.addresses).size === snapshot.addresses.length,
      "Duplicate snapshot addresses.",
    );
    requireThat(
      baseAddresses(mint).every((a, i) => snapshot.addresses[i] === a),
      "Snapshot base account binding mismatch.",
    );
    const { lifecycle, rows } = sources(mint, snapshot.result);
    base.slot = lifecycle.slot;
    base.observedAt = lifecycle.observedAt;
    base.coverage.accountsAtSameSlot = true;
    base.quoteMint = rows[0].quote;
    base.quoteDecimals = base.quoteMint === QUOTES.SOL ? 9 : 6;
    const accounts = new Map(
      snapshot.addresses.map((a, i) => [a, snapshot.result.value[i]]),
    );
    for (const row of rows) {
      const recipientAccount = accounts.get(row.creator);
      const recipientMode =
        row.holderRewards === true
          ? "holder_rewards"
          : row.holderRewards === null
            ? "unknown"
            : recipientAccount === undefined || recipientAccount === null
              ? "unknown"
              : recipientAccount.executable === false &&
                  recipientAccount.owner === PROGRAMS.system &&
                  PublicKey.isOnCurve(publicKey(row.creator).toBytes())
                ? "wallet_candidate_unverified"
                : "program_or_shared_recipient_review";
      base.sources.push({
        program: row.program,
        account: row.account,
        creator: row.creator,
        waitingRaw: row.waitingRaw,
        recipientMode,
        vault: {
          authority: row.vault,
          balanceAccount: row.balanceAccount,
          balanceKind: row.balanceKind,
          scope: "creator_wide_not_mint_specific",
          ...rawBalance(accounts.get(row.balanceAccount), row),
        },
      });
      if (row.waitingRaw !== null && BigInt(row.waitingRaw) > 0n)
        base.steps.push({
          program: row.program,
          operation: "sweep_creator_fee",
          destination: row.vault,
          prerequisite:
            "Recheck recipient routing and payer costs. Sweep belongs before the appropriate claim/distribution in the same transaction.",
          executable: false,
        });
    }
    base.steps.push({
      operation: "review_claim_or_distribution_route",
      referenceOnlyFlows: {
        singleRecipientCurve: ["sweep_creator_fee", "collect_creator_fee_v2"],
        singleRecipientPool: ["sweep_creator_fee", "collect_coin_creator_fee"],
        sharing: [
          "sweep_creator_fee",
          "transfer_creator_fees_to_pump_v2",
          "distribute_creator_fees_v2",
        ],
        holderRewards: ["review_holder_rewards_distribution_flow"],
      },
      prerequisite:
        "Single-recipient claims, sharing distributions and holder rewards have different flows. Verify the live route before constructing any transaction.",
      executable: false,
    });
    if (rows.every((r) => r.waitingRaw !== null))
      base.waitingForThisMintRaw = rows
        .reduce((sum, r) => sum + BigInt(r.waitingRaw), 0n)
        .toString();
    base.status =
      base.waitingForThisMintRaw !== null &&
      base.sources.every((r) => r.vault.raw !== null)
        ? "balances_observed"
        : "partial";
    return base;
  } catch {
    return { ...base, reason: "unusable_or_unsupported_fee_evidence" };
  }
}
export async function fetchFees(mint, rpc) {
  const keys = baseAddresses(mint);
  await rpc.verifyMainnet();
  const first = await rpc.call("getMultipleAccounts", [
    keys,
    { encoding: "base64", commitment: "confirmed" },
  ]);
  const addresses = feeAddresses(mint, first);
  const result = await rpc.call("getMultipleAccounts", [
    addresses,
    {
      encoding: "base64",
      commitment: "confirmed",
      minContextSlot: first.context.slot,
    },
  ]);
  requireThat(
    Number.isSafeInteger(result?.context?.slot) &&
      result.context.slot >= first.context.slot,
    "Fee snapshot is stale.",
  );
  requireThat(
    JSON.stringify(feeAddresses(mint, result)) === JSON.stringify(addresses),
    "Fee recipient or quote changed during read. Retry with fresh evidence.",
  );
  const report = feeReport(mint, { schemaVersion: 1, mint, addresses, result });
  report.coverage.genesisHashChecked = true;
  report.source.kind = "live_rpc";
  return report;
}
