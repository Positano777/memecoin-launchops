import {
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { createHash } from "node:crypto";
import {
  PROGRAMS,
  QUOTES,
  publicKey,
  poolAuthority,
  poolAddress,
  discriminator,
} from "../src/common.mjs";
import { expectedCreateAccounts } from "../src/doctor.mjs";
// Deterministic public points only. No signing keys, funded wallets, or live launches.
function point(label) {
  for (let i = 0; ; i++) {
    const b = createHash("sha256")
      .update(label + ":" + i)
      .digest();
    if (PublicKey.isOnCurve(b)) return new PublicKey(b).toBase58();
  }
}
export const MINT = point("launchops-synthetic-mint"),
  PAYER = point("launchops-synthetic-payer"),
  CREATOR = point("launchops-synthetic-creator");
export function plan() {
  return {
    schemaVersion: 1,
    network: "mainnet-beta",
    route: "pumpfun",
    name: "Synthetic Community",
    symbol: "SYNTH",
    metadataUri: "ipfs://bafySyntheticExample/metadata.json",
    creator: CREATOR,
    payer: PAYER,
    mint: MINT,
    tokenProgram: "token2022",
    quoteAsset: "SOL",
    mayhemMode: false,
    cashback: false,
    holderRewards: false,
    creatorFeeBps: 0,
    budgetLamports: "10000000",
  };
}
export function data(p = plan()) {
  const chunks = [discriminator("global", "create_v2")];
  for (const value of [p.name, p.symbol, p.metadataUri]) {
    const b = Buffer.from(value),
      length = Buffer.alloc(4);
    length.writeUInt32LE(b.length);
    chunks.push(length, b);
  }
  chunks.push(
    publicKey(p.creator).toBuffer(),
    Buffer.from([p.mayhemMode ? 1 : 0, p.cashback ? 1 : 0]),
    Buffer.alloc(8),
    Buffer.from([p.holderRewards ? 1 : 0]),
  );
  return Buffer.concat(chunks);
}
export function wire(p = plan(), modify = () => {}) {
  const keys = expectedCreateAccounts(p).map((pubkey, i) => ({
    pubkey: publicKey(pubkey),
    isSigner: i === 0 || i === 5,
    isWritable: [0, 2, 3, 5, 9, 11, 12, 13].includes(i),
  }));
  const ix = new TransactionInstruction({
    programId: publicKey(PROGRAMS.pump),
    keys,
    data: data(p),
  });
  const tx = new Transaction({
    feePayer: publicKey(p.payer),
    recentBlockhash: PROGRAMS.system,
  });
  tx.add(ix);
  modify(tx, ix);
  return tx
    .serialize({ requireAllSignatures: false, verifySignatures: false })
    .toString("base64");
}
export function account(owner, b) {
  return {
    owner,
    executable: false,
    data: [b.toString("base64"), "base64"],
    lamports: 1,
    rentEpoch: 0,
  };
}
export function snapshot({
  complete = false,
  pool = false,
  quote = QUOTES.SOL,
  slot = 100,
  curvePresent = true,
  mintPresent = true,
} = {}) {
  const mint = Buffer.alloc(82);
  mint[44] = 6;
  mint[45] = 1;
  mint.writeBigUInt64LE(1000000000000000n, 36);
  const curve = Buffer.alloc(182);
  discriminator("account", "BondingCurve").copy(curve);
  curve[48] = complete ? 1 : 0;
  publicKey(CREATOR).toBuffer().copy(curve, 49);
  publicKey(quote === QUOTES.SOL ? PROGRAMS.system : quote)
    .toBuffer()
    .copy(curve, 83);
  const poolData = Buffer.alloc(245);
  discriminator("account", "Pool").copy(poolData);
  const [, bump] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("pool"),
      Buffer.from([0, 0]),
      publicKey(poolAuthority(MINT)).toBuffer(),
      publicKey(MINT).toBuffer(),
      publicKey(quote).toBuffer(),
    ],
    publicKey(PROGRAMS.swap),
  );
  poolData[8] = bump;
  publicKey(poolAuthority(MINT)).toBuffer().copy(poolData, 11);
  publicKey(MINT).toBuffer().copy(poolData, 43);
  publicKey(quote).toBuffer().copy(poolData, 75);
  return {
    context: { slot },
    value: [
      { executable: true },
      { executable: true },
      mintPresent ? account(PROGRAMS.token2022, mint) : null,
      curvePresent ? account(PROGRAMS.pump, curve) : null,
      pool && quote === QUOTES.SOL ? account(PROGRAMS.swap, poolData) : null,
      pool && quote === QUOTES.USDC ? account(PROGRAMS.swap, poolData) : null,
    ],
  };
}
