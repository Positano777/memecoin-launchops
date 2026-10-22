import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createHash as browserHash } from "../dashboard/crypto-browser.mjs";
import { formatRaw, fromSnapshot, inspectMint } from "../dashboard/model.mjs";
import { feeSnapshot } from "./fee-fixtures.mjs";
import { MINT } from "./fixtures.mjs";

test("dashboard formats exact large, small, signed and unknown values", () => {
  assert.equal(formatRaw("9007199254740993"), "9007199.254740993");
  assert.equal(formatRaw("-1"), "-0.000000001");
  assert.equal(formatRaw("0"), "0");
  assert.equal(formatRaw("1000001", 6), "1.000001");
  assert.equal(formatRaw(null), "Unknown");
  assert.throws(() => formatRaw(9007199254740993));
  assert.throws(() => formatRaw("1e9"));
});
test("browser SHA-256 facade matches Node for account discriminators", () => {
  for (const value of ["", "account:BondingCurve", "account:Pool"])
    assert.equal(
      browserHash("sha256").update(value).digest("hex"),
      createHash("sha256").update(value).digest("hex"),
    );
  assert.throws(() => browserHash("md5"));
});
test("imported dashboard snapshots retain exact scope and reject mismatched mint binding", () => {
  const s = feeSnapshot(),
    r = fromSnapshot(MINT, s);
  assert.equal(r.source, "supplied_snapshot");
  assert.equal(r.fees.waitingForThisMintRaw, "3000");
  assert.equal(r.fees.coverage.claimabilityVerified, false);
  s.addresses[0] = MINT;
  assert.throws(() => fromSnapshot(MINT, s));
});
test("dashboard live reads verify network then use a coherent final snapshot", async () => {
  const s = feeSnapshot();
  let verified = false,
    calls = 0;
  const rpc = {
    async verifyMainnet() {
      verified = true;
    },
    async call(method, args) {
      assert.equal(verified, true);
      assert.equal(method, "getMultipleAccounts");
      calls++;
      if (calls === 1)
        return { ...s.result, value: s.result.value.slice(0, 6) };
      assert.equal(args[1].minContextSlot, s.result.context.slot);
      return s.result;
    },
  };
  const r = await inspectMint(MINT, rpc);
  assert.equal(calls, 2);
  assert.equal(r.source, "live_rpc");
  assert.equal(r.fees.coverage.genesisHashChecked, true);
});
test("dashboard rejects stale final reads and invalid mint before RPC", async () => {
  const s = feeSnapshot();
  let calls = 0;
  const rpc = {
    async verifyMainnet() {},
    async call() {
      return ++calls === 1
        ? { ...s.result, value: s.result.value.slice(0, 6) }
        : { ...s.result, context: { slot: s.result.context.slot - 1 } };
    },
  };
  await assert.rejects(inspectMint(MINT, rpc), /stale/);
  await assert.rejects(
    inspectMint("invalid", {
      verifyMainnet() {
        throw Error("RPC should not be called");
      },
    }),
    /public key|address|base58/i,
  );
});
