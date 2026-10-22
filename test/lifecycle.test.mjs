import test from "node:test";
import assert from "node:assert/strict";
import {
  observe,
  fetchObservation,
  watchAddresses,
} from "../src/lifecycle.mjs";
import {
  PROGRAMS,
  QUOTES,
  MAINNET_GENESIS,
  publicKey,
  poolAddress,
} from "../src/common.mjs";
import { snapshot, MINT, CREATOR } from "./fixtures.mjs";
test("incomplete curve is active, not a migration or trading guarantee", () => {
  const o = observe(MINT, snapshot());
  assert.equal(o.lifecycle, "curve_active");
  assert.equal(o.coverage.historyBackfilled, false);
  assert.equal(o.coverage.genesisHashChecked, false);
});
test("pool derivation independently matches the official documented example", () => {
  assert.equal(
    poolAddress("7LSsEoJGhLeZzGvDofTdNg7M3JttxQqGWNLo6vWMpump", QUOTES.SOL),
    "GseMAnNDvntR5uFePZ51yZBXzNSn7GdFPkfHwfr6d77J",
  );
});
test("complete curve plus absent supported canonical pool is migration pending", () =>
  assert.equal(
    observe(MINT, snapshot({ complete: true })).lifecycle,
    "migration_pending",
  ));
test("canonical SOL pool requires matching prefix and completed curve", () => {
  const o = observe(MINT, snapshot({ complete: true, pool: true }));
  assert.equal(o.lifecycle, "pool_observed");
  assert.equal(o.pool.address, watchAddresses(MINT).poolSOL);
});
test("canonical USDC pool is separately derived and checked", () => {
  const o = observe(
    MINT,
    snapshot({ complete: true, pool: true, quote: QUOTES.USDC }),
  );
  assert.equal(o.lifecycle, "pool_observed");
  assert.equal(o.pool.quoteMint, QUOTES.USDC);
});
test("pool without curve is observed but does not invent creation history", () =>
  assert.equal(
    observe(MINT, snapshot({ curvePresent: false, pool: true })).lifecycle,
    "pool_observed",
  ));
test("all absent is not observed, not proof token never existed", () =>
  assert.equal(
    observe(MINT, snapshot({ mintPresent: false, curvePresent: false }))
      .lifecycle,
    "not_observed",
  ));
test("mint absent with other derived accounts is inconsistent", () =>
  assert.equal(
    observe(MINT, snapshot({ mintPresent: false })).lifecycle,
    "unknown",
  ));
test("missing or malformed RPC response stays unknown", () => {
  for (const r of [
    null,
    { context: { slot: 1 }, value: [] },
    { context: { slot: -1 }, value: snapshot().value },
  ])
    assert.equal(observe(MINT, r).lifecycle, "unknown");
});
test("non-executable expected program makes evidence unknown", () => {
  const r = snapshot();
  r.value[0].executable = false;
  assert.equal(observe(MINT, r).lifecycle, "unknown");
});
test("wrong account owner cannot establish a launch", () => {
  const r = snapshot();
  r.value[3].owner = PROGRAMS.system;
  assert.equal(observe(MINT, r).lifecycle, "unknown");
});
test("wrong or truncated curve discriminator is not silently decoded", () => {
  for (const b of [Buffer.alloc(20), Buffer.alloc(115)]) {
    const r = snapshot();
    r.value[3].data = [b.toString("base64"), "base64"];
    assert.equal(observe(MINT, r).lifecycle, "unknown");
  }
});
test("invalid bool cannot establish complete or active state", () => {
  const r = snapshot();
  const b = Buffer.from(r.value[3].data[0], "base64");
  b[48] = 2;
  r.value[3].data[0] = b.toString("base64");
  assert.equal(observe(MINT, r).lifecycle, "unknown");
});
test("old curve prefix does not assume SOL when quote field is missing", () => {
  const r = snapshot({ complete: true });
  const b = Buffer.from(r.value[3].data[0], "base64").subarray(0, 81);
  r.value[3].data[0] = b.toString("base64");
  const o = observe(MINT, r);
  assert.equal(o.lifecycle, "unknown");
  assert.equal(o.reason, "complete_curve_with_unknown_or_unsupported_quote");
});
test("unsupported quote does not report absent SOL pool as failed migration", () =>
  assert.equal(
    observe(MINT, snapshot({ complete: true, quote: CREATOR })).lifecycle,
    "unknown",
  ));
test("incomplete curve plus pool is contradictory", () =>
  assert.equal(observe(MINT, snapshot({ pool: true })).lifecycle, "unknown"));
test("pool base/quote/authority/index/bump mismatches rejected", () => {
  for (const offset of [8, 9, 11, 43, 75]) {
    const r = snapshot({ complete: true, pool: true }),
      b = Buffer.from(r.value[4].data[0], "base64");
    b[offset] ^= 1;
    r.value[4].data[0] = b.toString("base64");
    assert.equal(observe(MINT, r).lifecycle, "unknown");
  }
});
test("both canonical quote pools cannot be treated as one valid observation", () => {
  const r = snapshot({ complete: true, pool: true });
  r.value[5] = snapshot({
    complete: true,
    pool: true,
    quote: QUOTES.USDC,
  }).value[5];
  assert.equal(observe(MINT, r).lifecycle, "unknown");
});
test("uninitialized mint and legacy wrong-sized mint rejected", () => {
  for (const mutate of [
    (r) => {
      const b = Buffer.from(r.value[2].data[0], "base64");
      b[45] = 0;
      r.value[2].data[0] = b.toString("base64");
    },
    (r) => {
      r.value[2].owner = PROGRAMS.token;
      r.value[2].data[0] = Buffer.alloc(83).toString("base64");
    },
  ]) {
    const r = snapshot();
    mutate(r);
    assert.equal(observe(MINT, r).lifecycle, "unknown");
  }
});
test("unknown raw provider fields are omitted", () => {
  const r = snapshot();
  r.diagnostics = "sensitive-marker";
  r.value[3].logs = "sensitive-marker";
  assert.ok(!JSON.stringify(observe(MINT, r)).includes("sensitive-marker"));
});
test("single RPC account batch uses confirmed commitment and minimum slot", async () => {
  const calls = [];
  let verified = false;
  const rpc = {
    verifyMainnet: async () => {
      verified = true;
    },
    call: async (m, p) => {
      calls.push({ m, p });
      return snapshot({ slot: 105 });
    },
  };
  const o = await fetchObservation(MINT, rpc, "100");
  assert.equal(verified, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].m, "getMultipleAccounts");
  assert.equal(calls[0].p[0].length, 6);
  assert.equal(calls[0].p[1].minContextSlot, 100);
  assert.equal(calls[0].p[1].commitment, "confirmed");
  assert.equal(o.coverage.genesisHashChecked, true);
});
