import {
  LaunchError,
  requireThat,
  publicKey,
  uint,
  PROGRAMS,
  QUOTES,
  curveAddress,
  ata,
  pda,
  sha256,
  discriminator,
} from "./common.mjs";
import { VersionedTransaction, PublicKey } from "@solana/web3.js";
const FIELDS = new Set([
  "schemaVersion",
  "network",
  "route",
  "name",
  "symbol",
  "metadataUri",
  "creator",
  "payer",
  "mint",
  "tokenProgram",
  "quoteAsset",
  "mayhemMode",
  "cashback",
  "holderRewards",
  "creatorFeeBps",
  "budgetLamports",
]);
export function doctor(plan) {
  requireThat(
    plan && typeof plan === "object" && !Array.isArray(plan),
    "Expected a public launch-plan object.",
  );
  const findings = [],
    add = (severity, code, message) =>
      findings.push({ severity, code, message });
  // Unknown field names and values are deliberately never echoed.
  if (Object.keys(plan).some((k) => !FIELDS.has(k)))
    add(
      "error",
      "UNKNOWN_FIELD",
      "Remove unsupported fields. Credentials, keypairs, and RPC settings do not belong in a public plan.",
    );
  if (plan.schemaVersion !== 1) add("error", "SCHEMA", "Use schemaVersion 1.");
  if (plan.network !== "mainnet-beta")
    add(
      "error",
      "NETWORK",
      "This profile checks mainnet-beta only; it does not establish a devnet Pump deployment.",
    );
  if (plan.route !== "pumpfun")
    add("error", "ROUTE", "This preview supports the pumpfun route only.");
  for (const [field, max] of [
    ["name", 32],
    ["symbol", 13],
  ]) {
    const value = plan[field];
    if (
      typeof value !== "string" ||
      !value.trim() ||
      [...value].length > max ||
      /[\x00-\x1f\x7f]/.test(value)
    )
      add(
        "error",
        "INVALID_" + field.toUpperCase(),
        `Provide a nonempty ${field}, without control characters, of at most ${max} Unicode characters.`,
      );
    else if (Buffer.byteLength(value) > max)
      add(
        "warning",
        "MULTIBYTE_" + field.toUpperCase(),
        "Multibyte text may exceed byte-based upstream limits; simulate against the target deployment.",
      );
  }
  let uriValid = false;
  try {
    const u = new URL(plan.metadataUri);
    requireThat(
      typeof plan.metadataUri === "string" &&
        plan.metadataUri.length <= 200 &&
        !/[\x00-\x20\x7f]/.test(plan.metadataUri),
      "Invalid metadata URI.",
    );
    requireThat(
      ["https:", "ipfs:", "ar:"].includes(u.protocol) &&
        !u.username &&
        !u.password &&
        !u.search &&
        !u.hash &&
        !!u.hostname,
      "Invalid metadata URI.",
    );
    uriValid = true;
    if (u.hostname === "example.com" || u.hostname.endsWith(".invalid"))
      add(
        "error",
        "PLACEHOLDER_URI",
        "Replace the placeholder metadata URI with reviewed published content.",
      );
  } catch {
    add(
      "error",
      "METADATA_URI",
      "Use a public HTTPS/IPFS/Arweave metadata URI, at most 200 characters, without credentials, query, fragment, or whitespace.",
    );
  }
  const addresses = {};
  for (const field of ["creator", "payer", "mint"]) {
    try {
      const key = publicKey(plan[field]);
      requireThat(
        plan[field] !== PROGRAMS.system,
        "The zero public key is not valid here.",
      );
      addresses[field] = key.toBase58();
    } catch {
      add(
        "error",
        "ADDRESS_" + field.toUpperCase(),
        "Provide a valid nonzero public " + field + " address.",
      );
    }
  }
  if (
    addresses.mint &&
    [addresses.creator, addresses.payer].includes(addresses.mint)
  )
    add(
      "error",
      "MINT_REUSED",
      "The new mint must differ from creator and payer.",
    );
  for (const field of ["payer", "mint"])
    if (
      addresses[field] &&
      !PublicKey.isOnCurve(publicKey(addresses[field]).toBytes())
    )
      add(
        "error",
        "SIGNER_POINT",
        "The creation-only transaction profile requires on-curve mint and payer public keys.",
      );
  if (plan.tokenProgram !== "token2022")
    add("error", "TOKEN_PROGRAM", "Pump create_v2 uses Token-2022.");
  if (!Object.hasOwn(QUOTES, plan.quoteAsset))
    add(
      "error",
      "QUOTE",
      "This preview checks SOL and USDC quotes only. Other pairs need a separate compatibility profile.",
    );
  for (const field of ["mayhemMode", "cashback", "holderRewards"])
    if (typeof plan[field] !== "boolean")
      add("error", "MODE_TYPE", "Mode flags must be explicit booleans.");
  if (plan.cashback === true)
    add(
      "error",
      "CASHBACK_DEPRECATED",
      "New cashback creation is deprecated and rejected by the current documented interface.",
    );
  if (plan.mayhemMode === true)
    add(
      "error",
      "MAYHEM_UNSUPPORTED",
      "Mayhem execution is outside this preview profile.",
    );
  if (plan.holderRewards === true)
    add(
      "warning",
      "HOLDER_REWARDS",
      "Holder rewards redirect creator-fee entitlement to holders and are documented as permanent. The plan does not establish whether the live feature is enabled.",
    );
  if (plan.creatorFeeBps !== 0)
    add(
      "error",
      "CREATOR_FEE",
      "For supported SOL/USDC pairs use creatorFeeBps 0; this does not mean the platform creator fee is zero.",
    );
  try {
    requireThat(uint(plan.budgetLamports) > 0n, "Budget must be positive.");
  } catch {
    add(
      "error",
      "BUDGET",
      "Provide a positive u64 budgetLamports string. No fixed launch cost is assumed.",
    );
  }
  add(
    "warning",
    "OFFLINE_LIMITS",
    "Plan checks do not fetch metadata, verify image ownership, inspect balances, or establish launch readiness.",
  );
  const planProjection = {
    schemaVersion: 1,
    network: plan.network === "mainnet-beta" ? "mainnet-beta" : null,
    route: plan.route === "pumpfun" ? "pumpfun" : null,
    ...addresses,
  };
  // Do not expose unvalidated URIs, text, unknown fields, or caller diagnostics.
  if (!findings.some((f) => f.severity === "error"))
    Object.assign(planProjection, {
      name: plan.name,
      symbol: plan.symbol,
      metadataUri: uriValid ? plan.metadataUri : null,
      quoteAsset: plan.quoteAsset,
      holderRewards: plan.holderRewards,
      budgetLamports: plan.budgetLamports,
    });
  return {
    schemaVersion: 1,
    tool: "Memecoin LaunchOps / doctor",
    status: findings.some((f) => f.severity === "error")
      ? "blocked"
      : "plan_checks_passed",
    plan: planProjection,
    findings,
    simulation: { status: "not_performed" },
    limits: [
      "A passing check is not a safety audit or permission to sign.",
      "No coin is created, no key is requested, and no transaction is sent.",
    ],
  };
}
export function expectedCreateAccounts(plan) {
  const curve = curveAddress(plan.mint),
    vault = pda(PROGRAMS.mayhem, "sol-vault");
  const keys = [
    plan.mint,
    pda(PROGRAMS.pump, "mint-authority"),
    curve,
    ata(curve, plan.mint),
    pda(PROGRAMS.pump, "global"),
    plan.payer,
    PROGRAMS.system,
    PROGRAMS.token2022,
    PROGRAMS.associated,
    PROGRAMS.mayhem,
    pda(PROGRAMS.mayhem, "global-params"),
    vault,
    pda(PROGRAMS.mayhem, "mayhem-state", publicKey(plan.mint).toBuffer()),
    ata(vault, plan.mint),
    pda(PROGRAMS.pump, "__event_authority"),
    PROGRAMS.pump,
  ];
  if (plan.quoteAsset === "USDC")
    keys.push(
      QUOTES.USDC,
      ata(curve, QUOTES.USDC, PROGRAMS.token),
      PROGRAMS.token,
    );
  return keys;
}
function createData(data) {
  let p = 8;
  requireThat(
    data.subarray(0, 8).equals(discriminator("global", "create_v2")),
    "Unsupported Pump instruction. Supply create_v2 only.",
  );
  const str = (max) => {
    requireThat(p + 4 <= data.length, "Truncated create instruction.");
    const len = data.readUInt32LE(p);
    p += 4;
    requireThat(
      len <= max * 4 && p + len <= data.length,
      "Malformed create string.",
    );
    const bytes = data.subarray(p, p + len);
    p += len;
    const value = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return value;
  };
  const name = str(32),
    symbol = str(13),
    uri = str(200);
  requireThat(p + 33 <= data.length, "Truncated creator or mode.");
  const creator = new PublicKey(data.subarray(p, p + 32)).toBase58();
  p += 32;
  const bool = () => {
    requireThat(p < data.length && data[p] <= 1, "Malformed boolean.");
    return data[p++] === 1;
  };
  const mayhem = bool(),
    cashback = p < data.length ? bool() : false;
  let fee = 0n;
  if (p < data.length) {
    requireThat(p + 8 <= data.length, "Truncated creator fee.");
    fee = data.readBigUInt64LE(p);
    p += 8;
  }
  const holder = p < data.length ? bool() : false;
  requireThat(p === data.length, "Unsupported trailing instruction data.");
  return { name, symbol, uri, creator, mayhem, cashback, fee, holder };
}
export function inspectTransaction(plan, encoded) {
  requireThat(
    doctor(plan).status === "plan_checks_passed",
    "Fix launch-plan errors before checking a transaction.",
  );
  requireThat(
    typeof encoded === "string" &&
      encoded.length <= 1644 &&
      /^[A-Za-z0-9+/]+={0,2}$/.test(encoded),
    "Supply a base64 wire transaction, at most 1232 bytes.",
  );
  const wire = Buffer.from(encoded, "base64");
  requireThat(
    wire.length <= 1232 && wire.toString("base64") === encoded,
    "Invalid base64 wire transaction.",
  );
  let tx;
  try {
    tx = VersionedTransaction.deserialize(wire);
  } catch {
    throw new LaunchError("Cannot deserialize the supplied transaction.");
  }
  requireThat(
    Buffer.from(tx.serialize()).equals(wire),
    "Noncanonical transaction encoding.",
  );
  const message = tx.message;
  requireThat(
    !message.addressTableLookups?.length,
    "Address lookup tables are not supported by this preview transaction profile.",
  );
  const keys = message.staticAccountKeys.map((k) => k.toBase58());
  requireThat(
    keys[0] === plan.payer &&
      message.header.numRequiredSignatures === 2 &&
      keys.slice(0, 2).includes(plan.mint),
    "Transaction signer/payer set does not match the plan profile.",
  );
  const instructions = message.compiledInstructions;
  let creates = 0,
    compute = 0;
  for (const ix of instructions) {
    const program = keys[ix.programIdIndex],
      data = Buffer.from(ix.data),
      accounts = Array.from(ix.accountKeyIndexes).map((i) => keys[i]);
    requireThat(
      accounts.every(Boolean) && !!program,
      "Unresolved transaction account.",
    );
    if (program === PROGRAMS.compute) {
      requireThat(
        accounts.length === 0 &&
          (([1, 2, 4].includes(data[0]) && data.length === 5) ||
            (data[0] === 3 && data.length === 9)),
        "Unsupported compute budget instruction.",
      );
      compute++;
      continue;
    }
    requireThat(
      program === PROGRAMS.pump,
      "Additional program instructions are outside this creation-only profile.",
    );
    const expected = expectedCreateAccounts(plan);
    requireThat(
      accounts.length === expected.length &&
        accounts.every((a, i) => a === expected[i]),
      "Creation accounts do not match the documented plan profile.",
    );
    requireThat(
      message.isAccountWritable(ix.accountKeyIndexes[0]) &&
        message.isAccountWritable(ix.accountKeyIndexes[5]),
      "Mint and payer must be writable.",
    );
    let parsed;
    try {
      parsed = createData(data);
    } catch (e) {
      if (e instanceof LaunchError) throw e;
      throw new LaunchError("Malformed create instruction data.");
    }
    requireThat(
      parsed.name === plan.name &&
        parsed.symbol === plan.symbol &&
        parsed.uri === plan.metadataUri &&
        parsed.creator === plan.creator &&
        !parsed.mayhem &&
        !parsed.cashback &&
        parsed.fee === 0n &&
        parsed.holder === plan.holderRewards,
      "Creation parameters do not match the plan.",
    );
    creates++;
  }
  requireThat(creates === 1, "Supply exactly one create_v2 instruction.");
  return {
    wireSha256: sha256(wire),
    encoded,
    createInstructions: creates,
    computeInstructions: compute,
    profile: "create_v2_SOL_USDC_no_lookup_tables",
    signaturesVerified: false,
  };
}
export async function simulate(plan, encoded, rpc) {
  const inspected = inspectTransaction(plan, encoded);
  await rpc.verifyMainnet();
  const result = await rpc.call("simulateTransaction", [
    inspected.encoded,
    {
      encoding: "base64",
      commitment: "confirmed",
      sigVerify: false,
      replaceRecentBlockhash: true,
    },
  ]);
  requireThat(
    result?.value &&
      Object.hasOwn(result.value, "err") &&
      Number.isSafeInteger(result.context?.slot),
    "Simulation metadata is incomplete.",
  );
  return {
    status:
      result.value.err === null ? "simulation_succeeded" : "simulation_failed",
    wireSha256: inspected.wireSha256,
    slot: String(result.context.slot),
    signaturesVerified: false,
    recentBlockhashReplaced: true,
    logsOmitted: true,
    limits: [
      "Simulation is provider-reported and is not a guarantee of execution, fee affordability, or safety.",
      "The declared budget is not an enforced maximum or a verified balance.",
      "Signatures are not verified. No transaction was broadcast.",
    ],
  };
}
