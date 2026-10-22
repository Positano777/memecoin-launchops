import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../bin/launchops.mjs";
import { plan, snapshot, MINT } from "./fixtures.mjs";
import { MAINNET_GENESIS } from "../src/common.mjs";
async function temp(fn) {
  const dir = await mkdtemp(join(tmpdir(), "launchops-cli-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
test("CLI plan inspection stays offline and writes a new report", async () => {
  await temp(async (dir) => {
    const file = join(dir, "plan.json"),
      out = join(dir, "doctor.json");
    await writeFile(file, JSON.stringify(plan()));
    const r = await run(["doctor", "--plan", file, "--out", out], {
      rpcFactory: () => {
        throw Error("Unexpected network");
      },
    });
    assert.equal(r.exitCode, 0);
    assert.equal(
      JSON.parse(await readFile(out, "utf8")).status,
      "plan_checks_passed",
    );
    await assert.rejects(run(["doctor", "--plan", file, "--out", out]));
  });
});
test("CLI invalid plan has exit code 2 without raw private data", async () => {
  await temp(async (dir) => {
    const file = join(dir, "plan.json");
    await writeFile(
      file,
      JSON.stringify({ ...plan(), secretKey: "sensitive-marker" }),
    );
    const r = await run(["doctor", "--plan", file]);
    assert.equal(r.exitCode, 2);
    assert.ok(!r.text.includes("sensitive-marker"));
  });
});
test("CLI snapshot inspection stays offline and creates no watch state", async () => {
  await temp(async (dir) => {
    const file = join(dir, "accounts.json");
    await writeFile(file, JSON.stringify(snapshot()));
    const r = await run(["watch", "--mint", MINT, "--snapshot", file], {
      rpcFactory: () => {
        throw Error("Unexpected network");
      },
    });
    assert.equal(r.exitCode, 0);
    assert.equal(JSON.parse(r.text).lifecycle, "curve_active");
  });
});
test("CLI live poll emits once and restart with unchanged evidence is quiet", async () => {
  await temp(async (dir) => {
    const file = join(dir, "state.json"),
      events = [];
    const rpcFactory = () => ({
      verifyMainnet: async () => {},
      call: async () => snapshot(),
    });
    const o = { rpcFactory, emit: async (e) => events.push(e) };
    await run(["watch", "--mint", MINT, "--state", file], o);
    await run(["watch", "--mint", MINT, "--state", file], o);
    assert.equal(events.length, 1);
    assert.equal(events[0].lifecycle, "curve_active");
  });
});
test("CLI polls detect changes and honor 15-second minimum without test sleeps", async () => {
  await temp(async (dir) => {
    const events = [],
      sleeps = [];
    let n = 0;
    const rpcFactory = () => ({
      verifyMainnet: async () => {},
      call: async () => snapshot({ complete: n++ > 0, slot: 100 + n }),
    });
    await run(
      [
        "watch",
        "--mint",
        MINT,
        "--state",
        join(dir, "state.json"),
        "--polls",
        "2",
        "--interval",
        "15",
      ],
      {
        rpcFactory,
        emit: async (e) => events.push(e),
        sleep: async (ms) => sleeps.push(ms),
      },
    );
    assert.deepEqual(
      events.map((e) => e.lifecycle),
      ["curve_active", "migration_pending"],
    );
    assert.deepEqual(sleeps, [15000]);
  });
});
test("CLI outage emits unknown with no raw provider diagnostics", async () => {
  await temp(async (dir) => {
    const events = [];
    const r = await run(
      ["watch", "--mint", MINT, "--state", join(dir, "state.json")],
      {
        rpcFactory: () => ({
          verifyMainnet: async () => {
            throw Error("sensitive-marker");
          },
        }),
        emit: async (e) => events.push(e),
      },
    );
    assert.equal(r.exitCode, 2);
    assert.equal(events[0].lifecycle, "unknown");
    assert.ok(!JSON.stringify(events).includes("sensitive-marker"));
  });
});
test("CLI cannot mix snapshot with follow or poll faster than supported", async () => {
  await assert.rejects(
    run(["watch", "--mint", MINT, "--snapshot", "x.json", "--follow"]),
  );
  await assert.rejects(run(["watch", "--mint", MINT, "--interval", "1"]));
});
test("CLI flags and unsupported commands fail clearly", async () => {
  for (const args of [
    ["launch"],
    ["doctor", "--plan"],
    ["doctor", "--plan", "a", "--plan", "b"],
    ["doctor", "--private-key", "sensitive-marker"],
  ])
    await assert.rejects(run(args));
  assert.ok((await run(["--help"])).text.includes("No signing"));
});
test("CLI receipt reuses the pinned receipt runtime", async () => {
  const r = await run([
    "receipt",
    "--wallet",
    "8qbHbw2BbbTHBW1sbeqakYXVKRQM8Ne7pLK7m6CVfeR",
    "--file",
    "test/receipt.synthetic.json",
  ]);
  assert.equal(JSON.parse(r.text).native.unexplainedLamports, "0");
});
