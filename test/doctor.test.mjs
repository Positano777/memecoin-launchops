import test from "node:test";
import assert from "node:assert/strict";
import {
  TransactionInstruction,
  ComputeBudgetProgram,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  AddressLookupTableAccount,
} from "@solana/web3.js";
import { doctor, inspectTransaction, simulate } from "../src/doctor.mjs";
import { PROGRAMS, QUOTES, publicKey, curveAddress } from "../src/common.mjs";
import { plan, wire, MINT } from "./fixtures.mjs";
test("valid public plan passes checks with explicit offline limitations", () => {
  const r = doctor(plan());
  assert.equal(r.status, "plan_checks_passed");
  assert.equal(r.simulation.status, "not_performed");
  assert.ok(r.findings.some((f) => f.code === "OFFLINE_LIMITS"));
});
test("unknown and private fields are blocked and never echoed", () => {
  const p = {
    ...plan(),
    private_key: "sensitive-marker",
    rpcUrl: "https://host.invalid/key",
  };
  const r = doctor(p);
  assert.equal(r.status, "blocked");
  assert.ok(!JSON.stringify(r).includes("sensitive-marker"));
  assert.ok(!JSON.stringify(r).includes("host.invalid"));
});
test("credential-bearing metadata URI is blocked and omitted", () => {
  const p = {
    ...plan(),
    metadataUri: "https://host.invalid/meta?token=sensitive-marker",
  };
  const r = doctor(p);
  assert.equal(r.status, "blocked");
  assert.ok(!JSON.stringify(r).includes("sensitive-marker"));
});
test("creation limits and control characters are enforced", () => {
  for (const p of [
    { ...plan(), name: "x".repeat(33) },
    { ...plan(), symbol: "x".repeat(14) },
    { ...plan(), name: "bad\nname" },
  ])
    assert.equal(doctor(p).status, "blocked");
});
test("unicode names get byte-limit warning, not a false byte guarantee", () => {
  const r = doctor({ ...plan(), name: "🪙".repeat(10) });
  assert.equal(r.status, "plan_checks_passed");
  assert.ok(r.findings.some((f) => f.code === "MULTIBYTE_NAME"));
});
test("deprecated cashback, legacy mint program and unsupported pairs blocked", () => {
  for (const p of [
    { ...plan(), cashback: true },
    { ...plan(), tokenProgram: "legacy" },
    { ...plan(), quoteAsset: "OTHER" },
  ])
    assert.equal(doctor(p).status, "blocked");
});
test("mayhem is explicitly outside the initial profile", () =>
  assert.equal(doctor({ ...plan(), mayhemMode: true }).status, "blocked"));
test("holder rewards permanent-fee implication is exposed", () =>
  assert.ok(
    doctor({ ...plan(), holderRewards: true }).findings.some(
      (f) => f.code === "HOLDER_REWARDS",
    ),
  ));
test("creator fee override and floating budget rejected", () => {
  for (const p of [
    { ...plan(), creatorFeeBps: 100 },
    { ...plan(), budgetLamports: 0.1 },
    { ...plan(), budgetLamports: "0" },
    { ...plan(), budgetLamports: "18446744073709551616" },
  ])
    assert.equal(doctor(p).status, "blocked");
});
test("zero and reused mint public addresses blocked", () => {
  for (const p of [
    { ...plan(), creator: PROGRAMS.system },
    { ...plan(), mint: plan().payer },
  ])
    assert.equal(doctor(p).status, "blocked");
});
test("other route/network cannot pass this mainnet Pump profile", () => {
  const r = doctor({ ...plan(), network: "devnet" });
  assert.equal(r.status, "blocked");
  assert.equal(r.plan.network, null);
  assert.equal(doctor({ ...plan(), route: "spl" }).status, "blocked");
});
test("matching creation-only transaction is bound to a plan", () => {
  const r = inspectTransaction(plan(), wire());
  assert.equal(r.createInstructions, 1);
  assert.match(r.wireSha256, /^[a-f0-9]{64}$/);
  assert.equal(r.signaturesVerified, false);
});
test("USDC optional quote accounts bind to the declared pair", () => {
  const p = { ...plan(), quoteAsset: "USDC" };
  assert.equal(inspectTransaction(p, wire(p)).createInstructions, 1);
});
test("changed metadata, creator, mint or quote cannot reuse approval", () => {
  const encoded = wire();
  for (const p of [
    { ...plan(), metadataUri: "ipfs://another/meta.json" },
    { ...plan(), creator: plan().payer },
    { ...plan(), mint: plan().creator },
    { ...plan(), quoteAsset: "USDC" },
  ])
    assert.throws(() => inspectTransaction(p, encoded));
});
test("extra non-compute instructions are blocked before simulation", () => {
  const encoded = wire(plan(), (tx) =>
    tx.add(
      new TransactionInstruction({
        programId: publicKey(PROGRAMS.system),
        keys: [],
        data: Buffer.alloc(4),
      }),
    ),
  );
  assert.throws(() => inspectTransaction(plan(), encoded), /Additional/);
});
test("duplicate creation instructions are blocked", () => {
  const encoded = wire(plan(), (tx, ix) => tx.add(ix));
  assert.throws(() => inspectTransaction(plan(), encoded));
});
test("wrong account ordering rejected", () => {
  const encoded = wire(plan(), (_tx, ix) => {
    [ix.keys[1], ix.keys[2]] = [ix.keys[2], ix.keys[1]];
  });
  assert.throws(() => inspectTransaction(plan(), encoded), /accounts/);
});
test("trailing and truncated data are rejected", () => {
  for (const mutate of [
    (b) => Buffer.concat([b, Buffer.from([0])]),
    (b) => b.subarray(0, 12),
  ]) {
    const encoded = wire(plan(), (_tx, ix) => {
      ix.data = mutate(ix.data);
    });
    assert.throws(() => inspectTransaction(plan(), encoded));
  }
});
test("valid compute settings are allowed without interpreting them as extra fees", () => {
  const encoded = wire(plan(), (tx) =>
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100n })),
  );
  assert.equal(inspectTransaction(plan(), encoded).computeInstructions, 1);
});
test("malformed compute layout is blocked", () => {
  const encoded = wire(plan(), (tx) =>
    tx.add(
      new TransactionInstruction({
        programId: publicKey(PROGRAMS.compute),
        keys: [],
        data: Buffer.from([3]),
      }),
    ),
  );
  assert.throws(() => inspectTransaction(plan(), encoded), /compute/);
});
test("simulation uses replacement blockhash, no signature validation or broadcast", async () => {
  const calls = [];
  const rpc = {
    verifyMainnet: async () => {},
    call: async (method, params) => {
      calls.push({ method, params });
      return {
        context: { slot: 42 },
        value: { err: null, logs: ["sensitive-marker"] },
      };
    },
  };
  const r = await simulate(plan(), wire(), rpc);
  assert.equal(r.status, "simulation_succeeded");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "simulateTransaction");
  assert.equal(calls[0].params[1].sigVerify, false);
  assert.equal(calls[0].params[1].replaceRecentBlockhash, true);
  assert.ok(!JSON.stringify(r).includes("sensitive-marker"));
});
test("failed simulation is failure and raw error details are omitted", async () => {
  const rpc = {
    verifyMainnet: async () => {},
    call: async () => ({
      context: { slot: 42 },
      value: { err: { value: "sensitive-marker" } },
    }),
  };
  const r = await simulate(plan(), wire(), rpc);
  assert.equal(r.status, "simulation_failed");
  assert.ok(!JSON.stringify(r).includes("sensitive-marker"));
});
test("mismatched transaction never reaches RPC simulation", async () => {
  let calls = 0;
  const rpc = {
    verifyMainnet: async () => {
      calls++;
    },
    call: async () => {
      calls++;
    },
  };
  await assert.rejects(simulate({ ...plan(), symbol: "OTHER" }, wire(), rpc));
  assert.equal(calls, 0);
});
test("invalid or oversized wire transaction is rejected", () => {
  for (const text of ["not base64", Buffer.alloc(1233).toString("base64")])
    assert.throws(() => inspectTransaction(plan(), text));
});
test("v0 static-only creation transaction is supported", () => {
  const legacy = VersionedTransaction.deserialize(
    Buffer.from(wire(), "base64"),
  );
  const message = TransactionMessage.decompile(legacy.message);
  const v0 = new VersionedTransaction(message.compileToV0Message());
  assert.equal(
    inspectTransaction(plan(), Buffer.from(v0.serialize()).toString("base64"))
      .createInstructions,
    1,
  );
});
test("v0 lookup-table transaction is explicitly unsupported", () => {
  const legacy = VersionedTransaction.deserialize(
    Buffer.from(wire(), "base64"),
  );
  const message = TransactionMessage.decompile(legacy.message);
  const lookup = new AddressLookupTableAccount({
    key: publicKey(plan().creator),
    state: {
      deactivationSlot: 18446744073709551615n,
      lastExtendedSlot: 0,
      lastExtendedSlotStartIndex: 0,
      authority: undefined,
      addresses: [publicKey(curveAddress(MINT))],
    },
  });
  const tx = new VersionedTransaction(message.compileToV0Message([lookup]));
  assert.throws(
    () =>
      inspectTransaction(
        plan(),
        Buffer.from(tx.serialize()).toString("base64"),
      ),
    /lookup tables/,
  );
});
