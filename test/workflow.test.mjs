import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchFeeSnapshot } from "../src/fees.mjs";
import { fromSnapshot } from "../dashboard/model.mjs";
import { reviewPlan } from "../dashboard/plan.mjs";
import { run } from "../bin/launchops.mjs";
import { feeSnapshot } from "./fee-fixtures.mjs";
import { MINT, plan } from "./fixtures.mjs";
function rpcFor(s) {
  let n = 0;
  return {
    verifyMainnet: async () => {},
    call: async () =>
      ++n === 1
        ? { context: s.result.context, value: s.result.value.slice(0, 6) }
        : s.result,
  };
}
test("exported snapshots drop provider fields and round-trip into the dashboard", async () => {
  const s = feeSnapshot();
  s.result.diagnostics = "private-marker";
  s.result.context.provider = "private-marker";
  s.result.value[3].logs = "private-marker";
  const snapshot = await fetchFeeSnapshot(MINT, rpcFor(s));
  assert.ok(!JSON.stringify(snapshot).includes("private-marker"));
  assert.deepEqual(Object.keys(snapshot.result.context), ["slot"]);
  assert.equal(snapshot.result.value[0].executable, true);
  const r = fromSnapshot(MINT, snapshot);
  assert.equal(r.source, "supplied_snapshot");
  assert.equal(r.fees.waitingForThisMintRaw, "3000");
  assert.equal(r.fees.coverage.genesisHashChecked, false);
});
test("snapshot exports preserve u64 precision and reject unsafe numeric lamports", async () => {
  const s = feeSnapshot();
  s.result.value[2].lamports = "9007199254740993";
  const r = await fetchFeeSnapshot(MINT, rpcFor(s));
  assert.equal(r.result.value[2].lamports, "9007199254740993");
  s.result.value[2].lamports = 9007199254740993;
  await assert.rejects(fetchFeeSnapshot(MINT, rpcFor(s)));
});
test("snapshot export rejects malformed account encodings and missing accounts", async () => {
  for (const mutate of [
    (s) => (s.result.value[2].data = ["not base64", "base64"]),
    (s) => s.result.value.pop(),
    (s) => (s.result.value[2].owner = "provider-secret-marker"),
  ]) {
    const s = feeSnapshot();
    mutate(s);
    await assert.rejects(fetchFeeSnapshot(MINT, rpcFor(s)));
  }
});
test("fees snapshot-out writes a dashboard input and refuses to overwrite it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "launchops-export-"));
  try {
    const out = join(dir, "accounts.json"),
      args = ["fees", "--mint", MINT, "--snapshot-out", out];
    const factory = () => rpcFor(feeSnapshot());
    assert.equal((await run(args, { rpcFactory: factory })).exitCode, 0);
    const original = await readFile(out, "utf8");
    assert.equal(
      fromSnapshot(MINT, JSON.parse(original)).fees.waitingForThisMintRaw,
      "3000",
    );
    await assert.rejects(run(args, { rpcFactory: factory }));
    assert.equal(await readFile(out, "utf8"), original);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("snapshot-out cannot combine output modes or offline inputs and never writes after RPC failure", async () => {
  for (const extra of [
    ["--out", "report.json"],
    ["--snapshot", "accounts.json"],
  ])
    await assert.rejects(
      run(["fees", "--mint", MINT, "--snapshot-out", "new.json", ...extra], {
        rpcFactory: () => {
          throw Error("Network must not be reached");
        },
      }),
      /alone/,
    );
  const dir = await mkdtemp(join(tmpdir(), "launchops-export-fail-"));
  try {
    const out = join(dir, "accounts.json");
    await assert.rejects(
      run(["fees", "--mint", MINT, "--snapshot-out", out], {
        rpcFactory: () => ({
          verifyMainnet: async () => {
            throw Error("unavailable");
          },
        }),
      }),
    );
    await assert.rejects(readFile(out), { code: "ENOENT" });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("public plan exports round-trip through doctor without carrying unknown fields", () => {
  const r = reviewPlan(plan());
  assert.equal(r.report.status, "plan_checks_passed");
  assert.equal(reviewPlan(r.plan).report.status, "plan_checks_passed");
  assert.ok(r.report.findings.some((f) => f.code === "OFFLINE_LIMITS"));
  assert.equal(r.report.simulation.status, "not_performed");
  const unsafe = {
    ...plan(),
    keypair: "private-marker",
    metadataUri: "https://example.org/?token=private-marker",
  };
  const blocked = reviewPlan(unsafe);
  assert.equal(blocked.plan, null);
  assert.equal(blocked.report.status, "blocked");
  assert.ok(!JSON.stringify(blocked).includes("private-marker"));
});
test("plan output keeps holder-reward warnings and rejects unsupported modes and budgets", () => {
  const p = plan();
  p.holderRewards = true;
  assert.ok(
    reviewPlan(p).report.findings.some((f) => f.code === "HOLDER_REWARDS"),
  );
  assert.equal(reviewPlan(p).plan.holderRewards, true);
  for (const changed of [
    { cashback: true },
    { mayhemMode: true },
    { budgetLamports: "1e9" },
    { mint: p.payer },
  ])
    assert.equal(reviewPlan({ ...p, ...changed }).plan, null);
});
