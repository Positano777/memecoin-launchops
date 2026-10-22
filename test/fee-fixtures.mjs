import { snapshot, account, MINT, CREATOR } from "./fixtures.mjs";
import { PROGRAMS, QUOTES, publicKey, pda, ata } from "../src/common.mjs";
import { feeAddresses } from "../src/fees.mjs";
export function feeSnapshot({
  quote = QUOTES.SOL,
  pool = true,
  curveFee = 1000n,
  poolFee = 2000n,
  holder = false,
} = {}) {
  const result = snapshot({ complete: pool, pool, quote });
  const c = Buffer.from(result.value[3].data[0], "base64");
  c[124] = holder ? 1 : 0;
  c.writeBigUInt64LE(curveFee, 125);
  result.value[3].data[0] = c.toString("base64");
  if (pool) {
    const i = quote === QUOTES.SOL ? 4 : 5,
      b = Buffer.alloc(287);
    Buffer.from(result.value[i].data[0], "base64").copy(b);
    publicKey(CREATOR).toBuffer().copy(b, 211);
    b[270] = holder ? 1 : 0;
    b.writeBigUInt64LE(poolFee, 279);
    result.value[i].data[0] = b.toString("base64");
  }
  const curveVault = pda(
      PROGRAMS.pump,
      "creator-vault",
      publicKey(CREATOR).toBuffer(),
    ),
    swapVault = pda(
      PROGRAMS.swap,
      "creator_vault",
      publicKey(CREATOR).toBuffer(),
    );
  const token = (vault) => {
    const b = Buffer.alloc(165);
    publicKey(quote).toBuffer().copy(b);
    publicKey(vault).toBuffer().copy(b, 32);
    b.writeBigUInt64LE(7000000n, 64);
    b[108] = 1;
    return account(PROGRAMS.token, b);
  };
  const accounts = new Map([
    [CREATOR, account(PROGRAMS.system, Buffer.alloc(0))],
    [
      curveVault,
      { ...account(PROGRAMS.pump, Buffer.alloc(0)), lamports: 27500000 },
    ],
    [ata(curveVault, quote, PROGRAMS.token), token(curveVault)],
    [ata(swapVault, quote, PROGRAMS.token), token(swapVault)],
  ]);
  const addresses = feeAddresses(MINT, result);
  for (const a of addresses.slice(6)) result.value.push(accounts.get(a));
  return { schemaVersion: 1, mint: MINT, addresses, result };
}
