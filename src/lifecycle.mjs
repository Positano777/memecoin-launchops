import {
  PROGRAMS,
  QUOTES,
  MAINNET_GENESIS,
  publicKey,
  curveAddress,
  poolAddress,
  poolAuthority,
  discriminator,
  requireThat,
} from "./common.mjs";
import { PublicKey } from "@solana/web3.js";
function bytes(account, min = 0) {
  requireThat(
    account &&
      account.executable === false &&
      Array.isArray(account.data) &&
      account.data[1] === "base64" &&
      typeof account.data[0] === "string" &&
      account.data[0].length <= 32768,
    "Account data is incomplete or unsupported.",
  );
  const encoded = account.data[0],
    data = Buffer.from(encoded, "base64");
  requireThat(
    data.toString("base64") === encoded && data.length >= min,
    "Invalid or truncated account data.",
  );
  return data;
}
export function watchAddresses(mint) {
  publicKey(mint);
  return {
    curve: curveAddress(mint),
    poolSOL: poolAddress(mint, QUOTES.SOL),
    poolUSDC: poolAddress(mint, QUOTES.USDC),
  };
}
export function observe(mint, result, now = new Date().toISOString()) {
  const addresses = watchAddresses(mint);
  const base = {
    schemaVersion: 1,
    mint,
    genesisHash: MAINNET_GENESIS,
    observedAt: now,
    slot: null,
    lifecycle: "unknown",
    reason: "unusable_account_evidence",
    addresses,
    coverage: {
      kind: "point_in_time",
      historyBackfilled: false,
      independentlyVerified: false,
      genesisHashChecked: false,
      accountsAtSameSlot: false,
      decoderProfile: "pump-sdk-4.1.0-prefix",
    },
  };
  try {
    requireThat(
      Number.isSafeInteger(result?.context?.slot) &&
        result.context.slot >= 0 &&
        Array.isArray(result.value) &&
        result.value.length === 6,
      "Missing coherent account response.",
    );
    base.slot = String(result.context.slot);
    base.coverage.accountsAtSameSlot = true;
    const [pump, swap, mintAccount, curve, solPool, usdcPool] = result.value;
    requireThat(
      pump?.executable === true && swap?.executable === true,
      "Expected programs are not executable.",
    );
    if (!mintAccount) {
      requireThat(
        !curve && !solPool && !usdcPool,
        "Missing mint conflicts with derived accounts.",
      );
      return {
        ...base,
        lifecycle: "not_observed",
        reason: "mint_and_derived_accounts_absent",
      };
    }
    requireThat(
      [PROGRAMS.token, PROGRAMS.token2022].includes(mintAccount.owner),
      "Unsupported mint owner.",
    );
    const mintData = bytes(mintAccount, 82);
    requireThat(mintData[45] === 1, "Mint is not initialized.");
    requireThat(
      mintAccount.owner !== PROGRAMS.token || mintData.length === 82,
      "Unsupported legacy mint layout.",
    );
    base.mintInfo = {
      tokenProgram:
        mintAccount.owner === PROGRAMS.token ? "legacy" : "token2022",
      decimals: mintData[44],
      supplyRaw: mintData.readBigUInt64LE(36).toString(),
    };
    let c = null;
    if (curve) {
      requireThat(curve.owner === PROGRAMS.pump, "Wrong curve owner.");
      const data = bytes(curve, 49);
      requireThat(
        data.subarray(0, 8).equals(discriminator("account", "BondingCurve")) &&
          data[48] <= 1,
        "Unknown curve discriminator or boolean.",
      );
      c = { complete: data[48] === 1, quoteMint: null };
      if (data.length >= 115)
        c.quoteMint = new PublicKey(data.subarray(83, 115)).toBase58();
      base.curve = c;
    }
    const verified = [];
    for (const [account, quote, address] of [
      [solPool, QUOTES.SOL, addresses.poolSOL],
      [usdcPool, QUOTES.USDC, addresses.poolUSDC],
    ]) {
      if (!account) continue;
      requireThat(
        account.owner === PROGRAMS.swap,
        "Wrong canonical pool owner.",
      );
      const data = bytes(account, 243);
      requireThat(
        data.subarray(0, 8).equals(discriminator("account", "Pool")) &&
          data.readUInt16LE(9) === 0 &&
          data
            .subarray(11, 43)
            .equals(publicKey(poolAuthority(mint)).toBuffer()) &&
          data.subarray(43, 75).equals(publicKey(mint).toBuffer()) &&
          data.subarray(75, 107).equals(publicKey(quote).toBuffer()),
        "Canonical pool prefix does not match.",
      );
      const [, bump] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("pool"),
          Buffer.from([0, 0]),
          publicKey(poolAuthority(mint)).toBuffer(),
          publicKey(mint).toBuffer(),
          publicKey(quote).toBuffer(),
        ],
        publicKey(PROGRAMS.swap),
      );
      requireThat(data[8] === bump, "Pool bump does not match.");
      verified.push({ address, quoteMint: quote });
    }
    requireThat(
      verified.length <= 1,
      "Multiple canonical quote pools conflict with this profile.",
    );
    let quote = null;
    if (c?.quoteMint === PROGRAMS.system || c?.quoteMint === QUOTES.SOL)
      quote = QUOTES.SOL;
    else if (c?.quoteMint === QUOTES.USDC) quote = QUOTES.USDC;
    if (verified.length) {
      requireThat(
        !c || c.complete,
        "Pool presence conflicts with an incomplete curve.",
      );
      requireThat(
        !c?.quoteMint || quote === verified[0].quoteMint,
        "Pool quote conflicts with curve or is unsupported.",
      );
      return {
        ...base,
        lifecycle: "pool_observed",
        reason: "canonical_pool_prefix_observed",
        pool: verified[0],
      };
    }
    if (c && !c.complete)
      return {
        ...base,
        lifecycle: "curve_active",
        reason: "incomplete_curve_observed",
      };
    if (c?.complete && quote)
      return {
        ...base,
        lifecycle: "migration_pending",
        reason: "complete_curve_and_supported_pool_absent",
      };
    return {
      ...base,
      reason: c?.complete
        ? "complete_curve_with_unknown_or_unsupported_quote"
        : "no_curve_or_canonical_pool_observed",
    };
  } catch {
    return base;
  }
}
export async function fetchObservation(mint, rpc, minContextSlot = null) {
  const addresses = watchAddresses(mint);
  await rpc.verifyMainnet();
  const config = { encoding: "base64", commitment: "confirmed" };
  if (minContextSlot !== null) {
    requireThat(
      Number.isSafeInteger(Number(minContextSlot)) &&
        Number(minContextSlot) >= 0,
      "Invalid saved slot.",
    );
    config.minContextSlot = Number(minContextSlot);
  }
  const result = await rpc.call("getMultipleAccounts", [
    [
      PROGRAMS.pump,
      PROGRAMS.swap,
      mint,
      addresses.curve,
      addresses.poolSOL,
      addresses.poolUSDC,
    ],
    config,
  ]);
  const observation = observe(mint, result);
  observation.coverage.genesisHashChecked = true;
  return observation;
}
export function unavailableObservation(mint, reason = "rpc_unavailable") {
  return { ...observe(mint, null), reason };
}
