#!/usr/bin/env node
import { readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { parseRpcJson, LIMIT } from "../vendor/receipt/core.mjs";
import { run as receipt } from "../vendor/receipt/cli.mjs";
import { doctor, simulate } from "../src/doctor.mjs";
import { publicKey, LaunchError, requireThat } from "../src/common.mjs";
import { ReadRpc } from "../src/rpc.mjs";
import { feeReport, fetchFees, fetchFeeSnapshot } from "../src/fees.mjs";
import {
  observe,
  fetchObservation,
  unavailableObservation,
} from "../src/lifecycle.mjs";
import {
  loadState,
  transition,
  saveState,
  deliverPending,
  lockState,
} from "../src/state.mjs";
export const HELP = `Memecoin LaunchOps / developer preview

  node bin/launchops.mjs doctor --plan PLAN.json [--transaction UNSIGNED.base64] [--out NEW.json]
  node bin/launchops.mjs watch --mint PUBLIC_MINT [--state FILE] [--polls N | --follow] [--interval SECONDS]
  node bin/launchops.mjs watch --mint PUBLIC_MINT --snapshot ACCOUNTS.json
  node bin/launchops.mjs receipt --wallet PUBLIC_WALLET --file RPC.json [--out NEW_PREFIX]
  node bin/launchops.mjs fees --mint PUBLIC_MINT [--snapshot FEE_ACCOUNTS.json] [--out NEW.json]
  node bin/launchops.mjs fees --mint PUBLIC_MINT --snapshot-out NEW_ACCOUNTS.json

doctor is offline unless --transaction is supplied: it checks plan binding, then calls RPC simulation.
watch defaults to one live poll; --follow continues until Ctrl+C. Outputs JSONL state-change events.
receipt also accepts --signature PUBLIC_SIGNATURE. RPC endpoint: SOLANA_RPC_URL environment variable.
No signing, transaction broadcasting, token creation, or external message delivery is implemented.`;
async function input(path, max = LIMIT) {
  requireThat((await stat(path)).size <= max, "Input exceeds size limit.");
  const text = await readFile(path, "utf8");
  requireThat(Buffer.byteLength(text) <= max, "Input exceeds size limit.");
  return text;
}
function options(args, allowed, flags = new Set()) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    requireThat(
      allowed.has(key) && !Object.hasOwn(out, key),
      "Unknown or repeated option. Use --help.",
    );
    if (flags.has(key)) out[key] = true;
    else {
      requireThat(
        typeof args[i + 1] === "string" && !args[i + 1].startsWith("--"),
        "Missing option value.",
      );
      out[key] = args[++i];
    }
  }
  return out;
}
async function output(value, path) {
  const text = JSON.stringify(value, null, 2) + "\n";
  if (path) {
    await writeFile(path, text, { flag: "wx" });
    return "Saved report.";
  }
  return text;
}
function integerOption(value, defaultValue, min, max) {
  if (value === undefined) return defaultValue;
  requireThat(
    /^[1-9][0-9]*$/.test(value) &&
      Number.isSafeInteger(Number(value)) &&
      Number(value) >= min &&
      Number(value) <= max,
    "Numeric option is outside supported limits.",
  );
  return Number(value);
}
const stdoutEvent = (event) =>
  new Promise((accept, reject) =>
    process.stdout.write(JSON.stringify(event) + "\n", (e) =>
      e
        ? reject(
            new LaunchError(
              "Event delivery failed. Pending event remains saved.",
            ),
          )
        : accept(),
    ),
  );
export async function run(
  args,
  { emit = stdoutEvent, rpcFactory = () => new ReadRpc(), sleep = delay } = {},
) {
  const [command, ...rest] = args;
  if (!command || command === "--help" || command === "help")
    return { text: HELP, exitCode: 0 };
  if (command === "receipt") return { text: await receipt(rest), exitCode: 0 };
  if (command === "fees") {
    const o = options(
      rest,
      new Set(["--mint", "--snapshot", "--out", "--snapshot-out"]),
    );
    publicKey(o["--mint"]);
    if (o["--snapshot-out"]) {
      requireThat(
        !o["--snapshot"] && !o["--out"],
        "Use --snapshot-out alone with --mint; it exports a new live snapshot.",
      );
      const snapshot = await fetchFeeSnapshot(o["--mint"], rpcFactory());
      return {
        text: await output(snapshot, o["--snapshot-out"]),
        exitCode: feeReport(o["--mint"], snapshot).status === "partial" ? 2 : 0,
      };
    }
    const report = o["--snapshot"]
      ? feeReport(o["--mint"], parseRpcJson(await input(o["--snapshot"])))
      : await fetchFees(o["--mint"], rpcFactory());
    return {
      text: await output(report, o["--out"]),
      exitCode: report.status === "partial" ? 2 : 0,
    };
  }
  if (command === "doctor") {
    const o = options(rest, new Set(["--plan", "--transaction", "--out"]));
    requireThat(o["--plan"], "Provide --plan.");
    const plan = parseRpcJson(await input(o["--plan"], 65536)),
      report = doctor(plan);
    if (o["--transaction"]) {
      requireThat(
        report.status === "plan_checks_passed",
        "Fix launch-plan errors before requesting simulation.",
      );
      const encoded = (await input(o["--transaction"], 4096)).trim();
      report.simulation = await simulate(plan, encoded, rpcFactory());
    }
    const exitCode =
      report.status === "blocked" ||
      report.simulation.status === "simulation_failed"
        ? 2
        : 0;
    return { text: await output(report, o["--out"]), exitCode };
  }
  requireThat(command === "watch", "Unknown command. Use --help.");
  const o = options(
    rest,
    new Set([
      "--mint",
      "--state",
      "--polls",
      "--follow",
      "--interval",
      "--snapshot",
    ]),
    new Set(["--follow"]),
  );
  publicKey(o["--mint"]);
  requireThat(!(o["--polls"] && o["--follow"]), "Choose --polls or --follow.");
  if (o["--snapshot"]) {
    requireThat(
      !o["--state"] && !o["--polls"] && !o["--follow"] && !o["--interval"],
      "Snapshot inspection does not use live watch options.",
    );
    const obs = observe(
      o["--mint"],
      parseRpcJson(await input(o["--snapshot"])),
    );
    return {
      text: JSON.stringify(obs, null, 2) + "\n",
      exitCode: obs.lifecycle === "unknown" ? 2 : 0,
    };
  }
  const count = o["--follow"]
      ? Infinity
      : integerOption(o["--polls"], 1, 1, 1000),
    interval = integerOption(o["--interval"], 30, 15, 3600);
  const path = resolve(o["--state"] || `.launchops/${o["--mint"]}.json`),
    unlock = await lockState(path);
  const abort = new AbortController();
  const stop = () => abort.abort();
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  let state,
    unknown = false;
  try {
    state = await loadState(path, o["--mint"]);
    if (state) state = await deliverPending(path, state, emit);
    const rpc = rpcFactory();
    for (let poll = 0; poll < count && !abort.signal.aborted; poll++) {
      let obs;
      try {
        obs = await fetchObservation(o["--mint"], rpc, state?.lastSlot ?? null);
      } catch {
        obs = unavailableObservation(o["--mint"]);
      }
      unknown = obs.lifecycle === "unknown";
      state = transition(state, obs);
      await saveState(path, state);
      state = await deliverPending(path, state, emit);
      if (poll + 1 < count && !abort.signal.aborted)
        try {
          await sleep(interval * 1000, undefined, { signal: abort.signal });
        } catch (e) {
          if (e.name !== "AbortError") throw e;
        }
    }
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    await unlock();
  }
  return { text: null, exitCode: unknown ? 2 : 0 };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.stdout.on("error", () => {
    process.exitCode = 1;
  });
  try {
    const result = await run(process.argv.slice(2));
    if (result.text !== null) console.log(result.text);
    process.exitCode = result.exitCode;
  } catch (error) {
    console.error(
      error instanceof LaunchError
        ? error.message
        : "LaunchOps could not complete. Check input, output permissions, and configuration. Details omitted.",
    );
    process.exitCode = 1;
  }
}
