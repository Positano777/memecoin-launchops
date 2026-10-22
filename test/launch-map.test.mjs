import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  normalizeLaunchEvidence,
  launchMapSummary,
} from "../src/launch-map.mjs";
import { run } from "../bin/launchops.mjs";
const base = JSON.parse(
  await readFile(
    new URL("../examples/launch-map.synthetic.json", import.meta.url),
    "utf8",
  ),
);
const fixture = () => structuredClone(base);
test("launch map projects known fields and rebuilds transaction URLs", () => {
  const e = fixture();
  e.providerSecret = "private-marker";
  e.creation.source.url = "javascript:private-marker";
  e.feePayerOutflows[0].locker = "private-marker";
  e.limitations = ["private-marker"];
  e.coverage.warnings = ["private-marker"];
  const r = normalizeLaunchEvidence(e);
  assert.ok(!JSON.stringify(r).includes("private-marker"));
  assert.ok(r.creation.source.url.startsWith("https://solscan.io/tx/"));
  assert.equal(r.creation.feePayerIsCreator, "unverified");
  assert.ok(
    r.limitations.some((v) => v.includes("creation transaction itself")),
  );
});
test("gain map aggregates transactions by wallet without claiming unique holdings", () => {
  const e = fixture();
  e.launchSlotObservations.transactions[1].wallet =
    e.launchSlotObservations.transactions[0].wallet;
  const r = normalizeLaunchEvidence(e),
    s = launchMapSummary(r);
  assert.equal(s.wallets.length, 5);
  assert.equal(s.wallets[0].positiveDeltaPctOfSupply, 19);
  assert.equal(s.mappedGainPctOfSupply, 29);
  assert.equal(s.mappedTransactions, 6);
  assert.ok(
    Math.abs(s.wallets.reduce((n, w) => n + w.shareOfMappedGains, 0) - 100) <
      1e-10,
  );
  assert.equal("holdings" in s, false);
});
test("identical duplicate observations are deduplicated; conflicting transaction rows are rejected", () => {
  const e = fixture();
  e.launchSlotObservations.transactions.push(
    structuredClone(e.launchSlotObservations.transactions[0]),
  );
  assert.equal(
    launchMapSummary(normalizeLaunchEvidence(e)).mappedTransactions,
    6,
  );
  e.launchSlotObservations.transactions.at(-1).positiveDeltaPctOfSupply = 99;
  assert.throws(() => normalizeLaunchEvidence(e), /Conflicting/);
});
test("claims of purchases, creator identity and bundle membership cannot become verified", () => {
  const e = fixture();
  Object.assign(e.launchSlotObservations, {
    purchasesVerified: true,
    coordination: "verified",
    jitoBundleMembership: "verified",
  });
  e.creation.feePayerIsCreator = true;
  const r = normalizeLaunchEvidence(e);
  assert.equal(r.launchSlotObservations.purchasesVerified, false);
  assert.equal(r.launchSlotObservations.coordination, "unverified");
  assert.equal(r.launchSlotObservations.jitoBundleMembership, "unverified");
  assert.equal(r.creation.feePayerIsCreator, "unverified");
});
test("repeat circulation above 100 percent remains gross observed gains", () => {
  const e = fixture();
  e.launchSlotObservations.transactions[0].positiveDeltaPctOfSupply = 150;
  e.launchSlotObservations.summedPositiveDeltasPctOfSupply = 167;
  const r = normalizeLaunchEvidence(e);
  assert.equal(launchMapSummary(r).mappedGainPctOfSupply, 167);
  assert.ok(r.limitations.some((v) => v.includes("repeated circulation")));
});
test("contradictory coverage and sample counts are rejected", () => {
  for (const mutate of [
    (e) => e.coverage.launchBlockDetails.slot++,
    (e) => (e.coverage.launchBlockDetails.inspectedTransactions = 2),
    (e) => (e.coverage.launchBlockDetails = null),
    (e) => (e.coverage.launchBlockDetails.reasons = ["sample_limit"]),
    (e) => (e.launchSlotObservations.transactionCount = 1),
    (e) => (e.coverage.launchBlock = "unavailable"),
  ]) {
    const e = fixture();
    mutate(e);
    assert.throws(() => normalizeLaunchEvidence(e));
  }
});
test("legacy unknown coverage remains unknown and absent row evidence is not rebuilt from totals", () => {
  const e = fixture();
  e.coverage.launchBlock = "unknown";
  e.coverage.launchBlockDetails = null;
  e.launchSlotObservations.transactions = [];
  const r = normalizeLaunchEvidence(e),
    s = launchMapSummary(r);
  assert.equal(s.hasTransactionEvidence, false);
  assert.equal(s.reportedFeePayers, 6);
  assert.equal(s.wallets.length, 0);
  assert.equal(r.coverage.launchBlock, "unknown");
});
test("invalid addresses, noncanonical signatures, negative amounts and excess lists fail", () => {
  for (const mutate of [
    (e) => (e.mint = "secret-marker"),
    (e) => (e.creation.source.signature = "invalid"),
    (e) =>
      (e.launchSlotObservations.transactions[0].positiveDeltaPctOfSupply = -1),
    (e) => (e.scannedAt = 1.5),
    (e) => (e.feePayerOutflows = Array(2001).fill(e.feePayerOutflows[0])),
    (e) => (e.coverage.launchBlockDetails.reasons = ["private-marker"]),
  ]) {
    const e = fixture();
    mutate(e);
    assert.throws(() => normalizeLaunchEvidence(e));
  }
});
test("saved token scan converter is reused and does not render unknown diagnostics", () => {
  const e = fixture(),
    o = e.launchSlotObservations,
    d = e.coverage.launchBlockDetails;
  const input = {
    mint: e.mint,
    scannedAt: e.scannedAt,
    partial: ["private-marker"],
    launch: {
      reached: true,
      slot: e.creation.slot,
      createdAt: e.creation.blockTime,
      creationSignature: e.creation.source.signature,
      deployer: e.creation.feePayer,
      bundled: {
        wallets: o.netAcquiringFeePayers,
        pctOfSupply: o.summedPositiveDeltasPctOfSupply,
        txCount: o.transactionCount,
      },
      blockCoverage: { status: "complete", ...d },
      launchSlotEvidence: o.transactions.map((r) => ({
        signature: r.source.signature,
        wallet: r.wallet,
        positiveDeltaPctOfSupply: r.positiveDeltaPctOfSupply,
      })),
      devSells: [],
      devTransfers: [],
      devLocks: [],
      devBurns: [],
    },
  };
  const r = normalizeLaunchEvidence(input);
  assert.equal(launchMapSummary(r).mappedTransactions, 6);
  assert.ok(!JSON.stringify(r).includes("private-marker"));
});
test("missing launch and zero-observation mainnet example do not imply safety", async () => {
  const e = normalizeLaunchEvidence({
    mint: base.mint,
    scannedAt: base.scannedAt,
    partial: [],
    launch: null,
  });
  assert.equal(e.creation, null);
  assert.equal(launchMapSummary(e).hasTransactionEvidence, false);
  const mainnet = normalizeLaunchEvidence(
    JSON.parse(
      await readFile(
        new URL("../examples/launch-map.mainnet.json", import.meta.url),
        "utf8",
      ),
    ),
  );
  assert.equal(mainnet.creation.slot, 455522726);
  assert.equal(launchMapSummary(mainnet).mappedTransactions, 0);
  assert.equal("safe" in mainnet, false);
});
test("vendored launch exporter/license match pinned provenance", async () => {
  const root = new URL("../vendor/launch-evidence/", import.meta.url),
    p = JSON.parse(await readFile(new URL("PROVENANCE.json", root), "utf8"));
  assert.equal(p.license, "MIT");
  for (const [file, hash] of Object.entries(p.filesSha256))
    assert.equal(
      createHash("sha256")
        .update(await readFile(new URL(file, root)))
        .digest("hex"),
      hash,
    );
});
test("launch-map CLI stays offline, projects evidence and refuses existing output", async () => {
  const dir = await mkdtemp(join(tmpdir(), "launchops-map-"));
  try {
    const input = join(dir, "evidence.json"),
      out = join(dir, "map.json");
    await writeFile(input, JSON.stringify(fixture()));
    const args = ["launch-map", "--file", input, "--out", out];
    const r = await run(args, {
      rpcFactory: () => {
        throw Error("Unexpected RPC");
      },
    });
    assert.equal(r.exitCode, 0);
    assert.equal(
      JSON.parse(await readFile(out, "utf8")).schema,
      "positano.launch-evidence.v1",
    );
    await assert.rejects(run(args));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
