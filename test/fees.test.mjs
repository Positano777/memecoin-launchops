import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { feeReport, fetchFees, baseAddresses } from "../src/fees.mjs";
import { PROGRAMS, QUOTES, publicKey } from "../src/common.mjs";
import { run } from "../bin/launchops.mjs";
import { feeSnapshot } from "./fee-fixtures.mjs";
import { MINT, PAYER } from "./fixtures.mjs";
test("separate per-mint waiting from creator-wide vault balances", () => {
  const r = feeReport(MINT, feeSnapshot());
  assert.equal(r.waitingForThisMintRaw, "3000");
  assert.equal(r.sources[0].vault.raw, "27500000");
  assert.equal(r.sources[1].vault.raw, "7000000");
  assert.equal(r.sources[0].vault.scope, "creator_wide_not_mint_specific");
  assert.equal(r.coverage.claimabilityVerified, false);
  assert.equal(r.sources[0].vault.includesRent, true);
});
test("USDC quote uses token balances for both creator vaults", () => {
  const r = feeReport(MINT, feeSnapshot({ quote: QUOTES.USDC }));
  assert.equal(r.status, "balances_observed");
  assert.equal(r.quoteDecimals, 6);
  assert.ok(r.sources.every((s) => s.vault.balanceKind === "token_raw"));
  assert.equal(r.waitingForThisMintRaw, "3000");
});
test("large counters and balances preserve integer precision", () => {
  const r = feeReport(
    MINT,
    feeSnapshot({ curveFee: 9007199254740993n, poolFee: 9007199254740995n }),
  );
  assert.equal(r.waitingForThisMintRaw, "18014398509481988");
});
test("sweep hints are conditional and never executable claims", () => {
  const r = feeReport(MINT, feeSnapshot());
  assert.equal(
    r.steps.filter((s) => s.operation === "sweep_creator_fee").length,
    2,
  );
  assert.ok(r.steps.every((s) => s.executable === false));
  assert.equal(r.steps.at(-1).operation, "review_claim_or_distribution_route");
});
test("zero waiting fee does not create unnecessary sweep hint", () => {
  const r = feeReport(MINT, feeSnapshot({ curveFee: 0n, poolFee: 0n }));
  assert.equal(r.waitingForThisMintRaw, "0");
  assert.equal(r.steps.length, 1);
});
test("holder reward mode is not called wallet income", () => {
  const r = feeReport(MINT, feeSnapshot({ holder: true }));
  assert.ok(r.sources.every((s) => s.recipientMode === "holder_rewards"));
});
test("program-owned recipients require route review", () => {
  const s = feeSnapshot();
  s.result.value[6].owner = PROGRAMS.pump;
  const r = feeReport(MINT, s);
  assert.ok(
    r.sources.every(
      (row) => row.recipientMode === "program_or_shared_recipient_review",
    ),
  );
});
test("missing trailing fee fields stay unknown, not zero", () => {
  const s = feeSnapshot();
  const i = 4;
  s.result.value[i].data[0] = Buffer.from(s.result.value[i].data[0], "base64")
    .subarray(0, 245)
    .toString("base64");
  const r = feeReport(MINT, s);
  assert.equal(r.waitingForThisMintRaw, null);
  assert.equal(r.sources[1].waitingRaw, null);
  assert.equal(r.status, "partial");
});
test("pre-migration source reports only the curve bucket", () => {
  const r = feeReport(MINT, feeSnapshot({ pool: false }));
  assert.equal(r.sources.length, 1);
  assert.equal(r.waitingForThisMintRaw, "1000");
});
test("absent vault never becomes a false zero claimable amount", () => {
  const s = feeSnapshot();
  s.result.value[s.result.value.length - 1] = null;
  const r = feeReport(MINT, s);
  assert.equal(r.sources[1].vault.raw, null);
  assert.equal(r.sources[1].vault.status, "account_absent");
  assert.equal(r.status, "partial");
});
test("wrong token authority or quote rejects its balance", () => {
  for (const offset of [0, 32]) {
    const s = feeSnapshot();
    const i = s.result.value.length - 1,
      b = Buffer.from(s.result.value[i].data[0], "base64");
    b[offset] ^= 1;
    s.result.value[i].data[0] = b.toString("base64");
    assert.equal(feeReport(MINT, s).sources[1].vault.raw, null);
  }
});
test("frozen token vault balance is not labeled usable", () => {
  const s = feeSnapshot();
  const i = s.result.value.length - 1,
    b = Buffer.from(s.result.value[i].data[0], "base64");
  b[108] = 2;
  s.result.value[i].data[0] = b.toString("base64");
  assert.equal(feeReport(MINT, s).sources[1].vault.status, "unknown");
});
test("snapshot account-address binding and duplicate keys are checked", () => {
  for (const mutate of [
    (s) => {
      s.addresses[3] = PAYER;
    },
    (s) => {
      s.addresses.push(s.addresses[6]);
      s.result.value.push(null);
    },
  ]) {
    const s = feeSnapshot();
    mutate(s);
    assert.equal(
      feeReport(MINT, s).reason,
      "unusable_or_unsupported_fee_evidence",
    );
  }
});
test("unknown diagnostics and provider text are omitted", () => {
  const s = feeSnapshot();
  s.rawDiagnostics = "sensitive-marker";
  s.result.value[3].logs = "sensitive-marker";
  assert.ok(!JSON.stringify(feeReport(MINT, s)).includes("sensitive-marker"));
});
test("live reads verify network and re-fetch base plus vaults in one coherent batch", async () => {
  const s = feeSnapshot();
  let count = 0;
  const calls = [];
  const rpc = {
    verifyMainnet: async () => {
      count++;
    },
    call: async (m, p) => {
      calls.push(p);
      return calls.length === 1
        ? { context: s.result.context, value: s.result.value.slice(0, 6) }
        : s.result;
    },
  };
  const r = await fetchFees(MINT, rpc);
  assert.equal(count, 1);
  assert.deepEqual(calls[0][0], baseAddresses(MINT));
  assert.equal(calls[1][1].minContextSlot, 100);
  assert.equal(r.coverage.genesisHashChecked, true);
  assert.equal(r.waitingForThisMintRaw, "3000");
});
test("recipient change between discovery and coherent read is refused", async () => {
  const initial = feeSnapshot(),
    changed = feeSnapshot();
  const b = Buffer.from(changed.result.value[3].data[0], "base64");
  publicKey(PAYER).toBuffer().copy(b, 49);
  changed.result.value[3].data[0] = b.toString("base64");
  let n = 0;
  const rpc = {
    verifyMainnet: async () => {},
    call: async () =>
      ++n === 1
        ? {
            context: initial.result.context,
            value: initial.result.value.slice(0, 6),
          }
        : changed.result,
  };
  await assert.rejects(fetchFees(MINT, rpc), /changed/);
});
test("regressing snapshot slots are refused", async () => {
  const s = feeSnapshot();
  let n = 0;
  const rpc = {
    verifyMainnet: async () => {},
    call: async () =>
      ++n === 1
        ? { context: { slot: 101 }, value: s.result.value.slice(0, 6) }
        : s.result,
  };
  await assert.rejects(fetchFees(MINT, rpc), /stale/);
});
test("fees CLI snapshot remains offline and existing output is protected", async () => {
  const dir = await mkdtemp(join(tmpdir(), "launchops-fees-"));
  try {
    const file = join(dir, "input.json"),
      out = join(dir, "report.json");
    await writeFile(file, JSON.stringify(feeSnapshot()));
    const args = ["fees", "--mint", MINT, "--snapshot", file, "--out", out];
    const r = await run(args, {
      rpcFactory: () => {
        throw Error("Unexpected network");
      },
    });
    assert.equal(r.exitCode, 0);
    await assert.rejects(run(args));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
