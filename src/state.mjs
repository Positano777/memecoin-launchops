import {
  readFile,
  writeFile,
  rename,
  open,
  unlink,
  mkdir,
} from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import {
  MAINNET_GENESIS,
  requireThat,
  sha256,
  LaunchError,
} from "./common.mjs";
const STATES = new Set([
  "unknown",
  "not_observed",
  "curve_active",
  "migration_pending",
  "pool_observed",
]);
const REASONS = new Set([
  "unusable_account_evidence",
  "mint_and_derived_accounts_absent",
  "canonical_pool_prefix_observed",
  "incomplete_curve_observed",
  "complete_curve_and_supported_pool_absent",
  "complete_curve_with_unknown_or_unsupported_quote",
  "no_curve_or_canonical_pool_observed",
  "rpc_unavailable",
  "stale_rpc_slot",
]);
const COVERAGE_KEYS = new Set([
  "kind",
  "historyBackfilled",
  "independentlyVerified",
  "genesisHashChecked",
  "accountsAtSameSlot",
  "decoderProfile",
]);
function coverageValid(c) {
  return (
    c &&
    Object.keys(c).every((k) => COVERAGE_KEYS.has(k)) &&
    c.kind === "point_in_time" &&
    c.historyBackfilled === false &&
    c.independentlyVerified === false &&
    typeof c.genesisHashChecked === "boolean" &&
    typeof c.accountsAtSameSlot === "boolean" &&
    c.decoderProfile === "pump-sdk-4.1.0-prefix"
  );
}
function validSlot(s) {
  return (
    s === null ||
    (typeof s === "string" &&
      /^(0|[1-9][0-9]{0,15})$/.test(s) &&
      Number.isSafeInteger(Number(s)))
  );
}
function stateValid(state, mint) {
  const fields = new Set([
    "schemaVersion",
    "mint",
    "genesisHash",
    "sequence",
    "lastLifecycle",
    "lastReason",
    "lastSlot",
    "pending",
  ]);
  requireThat(
    state?.schemaVersion === 1 &&
      Object.keys(state).every((k) => fields.has(k)) &&
      state.mint === mint &&
      state.genesisHash === MAINNET_GENESIS &&
      Number.isSafeInteger(state.sequence) &&
      state.sequence >= 0 &&
      STATES.has(state.lastLifecycle) &&
      REASONS.has(state.lastReason) &&
      Array.isArray(state.pending) &&
      state.pending.length <= 1 &&
      validSlot(state.lastSlot),
    "Saved state is incompatible or corrupt. It was not overwritten.",
  );
  const eventFields = new Set([
    "schemaVersion",
    "id",
    "mint",
    "genesisHash",
    "sequence",
    "lifecycle",
    "reason",
    "slot",
    "observedAt",
    "coverage",
  ]);
  for (const event of state.pending)
    requireThat(
      event?.schemaVersion === 1 &&
        Object.keys(event).every((k) => eventFields.has(k)) &&
        event.mint === mint &&
        event.genesisHash === MAINNET_GENESIS &&
        STATES.has(event.lifecycle) &&
        REASONS.has(event.reason) &&
        validSlot(event.slot) &&
        /^[a-f0-9]{64}$/.test(event.id) &&
        event.id ===
          sha256(
            `${MAINNET_GENESIS}:${mint}:${event.sequence}:${event.lifecycle}:${event.reason}`,
          ) &&
        Number.isSafeInteger(event.sequence) &&
        event.sequence === state.sequence &&
        event.lifecycle === state.lastLifecycle &&
        event.reason === state.lastReason &&
        typeof event.observedAt === "string" &&
        /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(event.observedAt) &&
        coverageValid(event.coverage),
      "Saved pending event is corrupt. It was not overwritten.",
    );
  return state;
}
export async function loadState(path, mint) {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw new LaunchError("Cannot read state file.");
  }
  requireThat(Buffer.byteLength(text) <= 65536, "Saved state is too large.");
  let state;
  try {
    state = JSON.parse(text);
  } catch {
    throw new LaunchError(
      "Saved state is not valid JSON. It was not overwritten.",
    );
  }
  return stateValid(state, mint);
}
export function transition(previous, observation) {
  requireThat(
    STATES.has(observation.lifecycle) &&
      REASONS.has(observation.reason) &&
      validSlot(observation.slot) &&
      coverageValid(observation.coverage) &&
      observation.genesisHash === MAINNET_GENESIS,
    "Invalid lifecycle observation.",
  );
  const state = previous
    ? structuredClone(stateValid(previous, observation.mint))
    : {
        schemaVersion: 1,
        mint: observation.mint,
        genesisHash: MAINNET_GENESIS,
        sequence: 0,
        lastLifecycle: "unknown",
        lastReason: null,
        lastSlot: null,
        pending: [],
      };
  requireThat(
    state.pending.length === 0,
    "Deliver pending events before advancing state.",
  );
  if (
    observation.slot !== null &&
    state.lastSlot !== null &&
    BigInt(observation.slot) < BigInt(state.lastSlot)
  )
    observation = {
      ...observation,
      lifecycle: "unknown",
      reason: "stale_rpc_slot",
    };
  const changed =
    !previous ||
    state.lastLifecycle !== observation.lifecycle ||
    state.lastReason !== observation.reason;
  if (changed) {
    state.sequence++;
    state.pending = [
      {
        schemaVersion: 1,
        id: sha256(
          `${MAINNET_GENESIS}:${state.mint}:${state.sequence}:${observation.lifecycle}:${observation.reason}`,
        ),
        mint: state.mint,
        genesisHash: MAINNET_GENESIS,
        sequence: state.sequence,
        lifecycle: observation.lifecycle,
        reason: observation.reason,
        slot: observation.slot,
        observedAt: observation.observedAt,
        coverage: observation.coverage,
      },
    ];
  }
  state.lastLifecycle = observation.lifecycle;
  state.lastReason = observation.reason;
  if (observation.slot !== null && observation.reason !== "stale_rpc_slot")
    state.lastSlot = observation.slot;
  return state;
}
export async function saveState(path, state) {
  stateValid(state, state.mint);
  const temporary = path + "." + randomUUID() + ".tmp";
  try {
    await mkdir(dirname(path), { recursive: true });
    const file = await open(temporary, "wx", 0o600);
    try {
      await file.writeFile(JSON.stringify(state, null, 2) + "\n");
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, path);
  } catch {
    await unlink(temporary).catch(() => {});
    throw new LaunchError(
      "Could not save watch state. Pending events were not acknowledged.",
    );
  }
}
export async function deliverPending(path, state, emit) {
  for (const event of state.pending) await emit(event);
  if (state.pending.length) {
    const acknowledged = { ...state, pending: [] };
    await saveState(path, acknowledged);
    return acknowledged;
  }
  return state;
}
export async function lockState(path) {
  await mkdir(dirname(path), { recursive: true });
  const lock = path + ".lock";
  let handle;
  try {
    handle = await open(lock, "wx", 0o600);
    await handle.writeFile(JSON.stringify({ pid: process.pid }) + "\n");
  } catch {
    throw new LaunchError(
      "Watch state is locked or cannot be opened. Check for another watcher; remove a stale lock only after confirming its process stopped.",
    );
  }
  return async () => {
    await handle.close();
    await unlink(lock);
  };
}
