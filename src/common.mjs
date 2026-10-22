import { PublicKey } from "@solana/web3.js";
import { createHash } from "node:crypto";
export class LaunchError extends Error {}
export function requireThat(condition, message) {
  if (!condition) throw new LaunchError(message);
}
export const PROGRAMS = Object.freeze({
  pump: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
  swap: "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",
  token: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  token2022: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  associated: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  system: "11111111111111111111111111111111",
  mayhem: "MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e",
  compute: "ComputeBudget111111111111111111111111111111",
});
export const QUOTES = Object.freeze({
  SOL: "So11111111111111111111111111111111111111112",
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
});
export const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
export function publicKey(value) {
  requireThat(
    typeof value === "string" && value.length <= 44,
    "Invalid public address.",
  );
  try {
    const key = new PublicKey(value);
    requireThat(key.toBase58() === value, "Use a canonical public address.");
    return key;
  } catch {
    throw new LaunchError("Invalid public address.");
  }
}
export function pda(program, ...seeds) {
  return PublicKey.findProgramAddressSync(
    seeds.map((s) => (typeof s === "string" ? Buffer.from(s) : s)),
    publicKey(program),
  )[0].toBase58();
}
export function curveAddress(mint) {
  return pda(PROGRAMS.pump, "bonding-curve", publicKey(mint).toBuffer());
}
export function poolAuthority(mint) {
  return pda(PROGRAMS.pump, "pool-authority", publicKey(mint).toBuffer());
}
export function poolAddress(mint, quote) {
  return pda(
    PROGRAMS.swap,
    "pool",
    Buffer.from([0, 0]),
    publicKey(poolAuthority(mint)).toBuffer(),
    publicKey(mint).toBuffer(),
    publicKey(quote).toBuffer(),
  );
}
export function ata(owner, mint, program = PROGRAMS.token2022) {
  return pda(
    PROGRAMS.associated,
    publicKey(owner).toBuffer(),
    publicKey(program).toBuffer(),
    publicKey(mint).toBuffer(),
  );
}
export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
export function discriminator(kind, name) {
  return createHash("sha256").update(`${kind}:${name}`).digest().subarray(0, 8);
}
export function uint(value) {
  requireThat(
    typeof value === "string" &&
      /^(0|[1-9][0-9]{0,19})$/.test(value) &&
      BigInt(value) <= 18446744073709551615n,
    "Use an unsigned u64 integer string.",
  );
  return BigInt(value);
}
