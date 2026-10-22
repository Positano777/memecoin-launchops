import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { observe, unavailableObservation } from "../src/lifecycle.mjs";
import {
  transition,
  loadState,
  saveState,
  deliverPending,
  lockState,
} from "../src/state.mjs";
import { MINT, snapshot, CREATOR } from "./fixtures.mjs";
async function directory(fn) {
  const dir = await mkdtemp(join(tmpdir(), "launchops-state-"));
  try {
    await fn(join(dir, "state.json"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
test("first observation has stable ID, repeated unchanged polling is quiet", async () => {
  await directory(async (path) => {
    let state = transition(null, observe(MINT, snapshot()));
    const id = state.pending[0].id;
    await saveState(path, state);
    const events = [];
    state = await deliverPending(path, state, async (e) => events.push(e));
    state = transition(
      await loadState(path, MINT),
      observe(MINT, snapshot({ slot: 101 })),
    );
    assert.equal(state.pending.length, 0);
    assert.equal(events.length, 1);
    assert.equal(events[0].id, id);
    assert.equal(state.lastSlot, "101");
  });
});
test("restart replays a saved pending event with same identifier", async () => {
  await directory(async (path) => {
    const state = transition(null, observe(MINT, snapshot()));
    await saveState(path, state);
    const restored = await loadState(path, MINT),
      events = [];
    await deliverPending(path, restored, async (e) => events.push(e));
    assert.equal(events[0].id, state.pending[0].id);
    assert.equal((await loadState(path, MINT)).pending.length, 0);
  });
});
test("delivery failure never acknowledges pending event", async () => {
  await directory(async (path) => {
    const state = transition(null, observe(MINT, snapshot()));
    await saveState(path, state);
    await assert.rejects(
      deliverPending(path, state, async () => {
        throw Error("delivery failed");
      }),
    );
    assert.equal((await loadState(path, MINT)).pending.length, 1);
  });
});
test("do not advance past undelivered outbox event", () => {
  const s = transition(null, observe(MINT, snapshot()));
  assert.throws(
    () => transition(s, observe(MINT, snapshot({ complete: true }))),
    /pending/,
  );
});
test("migration transition gets a distinct sequential event", () => {
  const s = transition(null, observe(MINT, snapshot()));
  const originalId = s.pending[0].id;
  s.pending = [];
  const next = transition(
    s,
    observe(MINT, snapshot({ complete: true, slot: 101 })),
  );
  assert.equal(next.sequence, 2);
  assert.equal(next.pending[0].lifecycle, "migration_pending");
  assert.notEqual(next.pending[0].id, originalId);
});
test("RPC outage produces unknown, repeated outage remains quiet", () => {
  let s = transition(null, observe(MINT, snapshot()));
  s.pending = [];
  s = transition(s, unavailableObservation(MINT));
  assert.equal(s.pending[0].lifecycle, "unknown");
  s.pending = [];
  assert.equal(transition(s, unavailableObservation(MINT)).pending.length, 0);
});
test("stale RPC slot is unknown and cannot rewind saved slot", () => {
  const s = transition(null, observe(MINT, snapshot({ slot: 200 })));
  s.pending = [];
  const next = transition(s, observe(MINT, snapshot({ slot: 100 })));
  assert.equal(next.lastSlot, "200");
  assert.equal(next.pending[0].reason, "stale_rpc_slot");
});
test("corrupt or foreign state is refused without overwriting", async () => {
  await directory(async (path) => {
    for (const text of [
      "invalid",
      JSON.stringify({
        ...transition(null, observe(MINT, snapshot())),
        mint: CREATOR,
      }),
    ]) {
      await writeFile(path, text);
      await assert.rejects(loadState(path, MINT));
      assert.equal(await readFile(path, "utf8"), text);
    }
  });
});
test("unknown state fields cannot be persisted or echoed", async () => {
  await directory(async (path) => {
    const s = transition(null, observe(MINT, snapshot()));
    s.pending[0].providerUrl = "sensitive-marker";
    await writeFile(path, JSON.stringify(s));
    await assert.rejects(loadState(path, MINT));
  });
});
test("tampered event ID or arbitrary reason is rejected", async () => {
  await directory(async (path) => {
    for (const mutate of [
      (s) => {
        s.pending[0].id = "0".repeat(64);
      },
      (s) => {
        s.pending[0].reason = "sensitive-marker";
      },
    ]) {
      const s = transition(null, observe(MINT, snapshot()));
      mutate(s);
      await writeFile(path, JSON.stringify(s));
      await assert.rejects(loadState(path, MINT));
    }
  });
});
test("one state file permits only one watcher and lock is released", async () => {
  await directory(async (path) => {
    const release = await lockState(path);
    await assert.rejects(lockState(path), /locked/);
    await release();
    await (
      await lockState(path)
    )();
  });
});
