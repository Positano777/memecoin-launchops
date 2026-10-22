import { reviewPlan } from "./plan.mjs";
import examplePlan from "../examples/plan.synthetic.json";
import { inspectMint, fromSnapshot, formatRaw, STATUS } from "./model.mjs";
import { parseRpcJson, makeReceipt, LIMIT } from "../vendor/receipt/core.mjs";
import { receiptHtml } from "../vendor/receipt/report.mjs";
import exampleAccounts from "../examples/fees.synthetic.json";
import exampleReceipt from "../test/receipt.synthetic.json";
const $ = (id) => document.getElementById(id);
let report = null,
  receipt = null,
  busy = false;
const sourceNames = {
  synthetic: "Synthetic example",
  live_rpc: "Live RPC observation",
  supplied_snapshot: "Imported accounts",
};
function text(id, value) {
  $(id).textContent = value;
}
function short(value) {
  return value ? value.slice(0, 6) + "…" + value.slice(-6) : "Unknown";
}
function download(name, value, type = "application/json") {
  const url = URL.createObjectURL(new Blob([value], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function setBusy(value) {
  busy = value;
  for (const id of ["inspect", "demo", "import"]) $(id).disabled = value;
  $("inspect").textContent = value
    ? "Reading public accounts…"
    : "Inspect mint";
  $("main").setAttribute("aria-busy", String(value));
}
function showError(message) {
  report = null;
  $("results").hidden = true;
  $("empty").hidden = false;
  text("error", message);
  $("error").hidden = false;
  $("download").disabled = true;
  text("current-source", "No current report");
}
function render(value) {
  report = value;
  $("results").hidden = false;
  $("empty").hidden = true;
  $("error").hidden = true;
  $("download").disabled = false;
  text("current-source", sourceNames[value.source] ?? "Unverified input");
  text("report-mint", value.mint);
  text("mint-short", short(value.mint));
  $("example-note").hidden = value.source !== "synthetic";
  const state = STATUS[value.lifecycle.lifecycle] ?? STATUS.unknown;
  text("lifecycle-label", state.label);
  text("lifecycle-description", state.description);
  text("slot", value.lifecycle.slot ?? "Unknown");
  text(
    "checked-at",
    new Date(value.generatedAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
  );
  for (const step of document.querySelectorAll("[data-step]")) {
    const current = Number(step.dataset.step) === state.step;
    step.classList.toggle("current", current);
    step.setAttribute("aria-current", current ? "step" : "false");
  }
  const asset = value.fees.quoteDecimals === 6 ? "USDC" : "SOL",
    decimals = value.fees.quoteDecimals ?? 9;
  text("waiting", formatRaw(value.fees.waitingForThisMintRaw, decimals));
  text(
    "waiting-unit",
    value.fees.quoteDecimals === undefined
      ? "Amount unavailable"
      : asset + " waiting for this mint",
  );
  text(
    "waiting-note",
    value.fees.waitingForThisMintRaw === null
      ? "Missing or unsupported fee fields remain unknown."
      : "Curve and pool waiting counters only. Vault balances are excluded.",
  );
  $("fee-rows").replaceChildren();
  for (const row of value.fees.sources) {
    const tr = document.createElement("tr");
    for (const item of [
      row.program,
      formatRaw(row.waitingRaw, decimals) + " " + asset,
      formatRaw(row.vault.raw, decimals) + " " + asset,
      row.recipientMode === "holder_rewards"
        ? "Holder rewards"
        : row.recipientMode === "wallet_candidate_unverified"
          ? "Recipient not verified"
          : "Route needs review",
    ]) {
      const td = document.createElement("td");
      td.textContent = item;
      tr.append(td);
    }
    $("fee-rows").append(tr);
  }
  $("no-fees").hidden = value.fees.sources.length > 0;
  text(
    "fee-status",
    value.fees.status === "balances_observed"
      ? "Balances observed"
      : "Partial fee coverage",
  );
  $("actions").replaceChildren();
  const hints = value.fees.steps.filter(
    (s) => s.operation === "sweep_creator_fee",
  );
  for (const hint of hints) {
    const li = document.createElement("li");
    li.textContent = `${hint.program}: waiting fees require a sweep before the appropriate claim or distribution.`;
    $("actions").append(li);
  }
  const li = document.createElement("li");
  li.textContent =
    "Verify sharing or holder-reward routing and payer costs before constructing a claim. This dashboard cannot approve or execute it.";
  $("actions").append(li);
  text("evidence", JSON.stringify(value, null, 2));
  text(
    "coverage-source",
    value.source === "live_rpc"
      ? "The provider reported the expected mainnet genesis hash. Responses are not independently verified."
      : value.source === "synthetic"
        ? "Invented accounts and balances. No live chain evidence."
        : "Uploaded data is unverified and does not establish its network or confirmation.",
  );
}
$("mint-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy) return;
  setBusy(true);
  report = null;
  $("download").disabled = true;
  text("current-source", "Reading public accounts…");
  $("results").hidden = true;
  $("empty").hidden = false;
  $("error").hidden = true;
  try {
    render(await inspectMint($("mint").value.trim()));
  } catch {
    showError(
      "Could not inspect this mint. Check the public address and try again. Public RPC may be rate-limited or unavailable; you can also import account data.",
    );
  } finally {
    setBusy(false);
  }
});
$("demo").addEventListener("click", () => {
  if (busy) return;
  $("mint").value = "";
  render(fromSnapshot(exampleAccounts.mint, exampleAccounts, "synthetic"));
});
$("import").addEventListener("click", () => $("account-file").click());
$("account-file").addEventListener("change", async () => {
  if (busy) return;
  const file = $("account-file").files[0];
  if (!file) return;
  try {
    if (file.size > LIMIT) throw Error();
    const data = parseRpcJson(await file.text());
    const mint = data?.mint ?? $("mint").value.trim();
    render(fromSnapshot(mint, data));
    $("mint").value = mint;
  } catch {
    showError(
      "Could not read these accounts. Use a LaunchOps fee snapshot, or a six-account getMultipleAccounts result with its mint entered. Maximum size is 5 MB.",
    );
  } finally {
    $("account-file").value = "";
  }
});
$("download").addEventListener("click", () => {
  if (report)
    download("launchops-report.json", JSON.stringify(report, null, 2) + "\n");
});
for (const b of document.querySelectorAll("[data-tab]"))
  b.addEventListener("click", () => {
    for (const tab of document.querySelectorAll("[data-tab]")) {
      const active = tab === b;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    for (const panel of document.querySelectorAll("[data-panel]"))
      panel.hidden = panel.dataset.panel !== b.dataset.tab;
  });
$("tablist").addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const tabs = [...document.querySelectorAll("[data-tab]")],
    i = tabs.indexOf(document.activeElement);
  if (i < 0) return;
  event.preventDefault();
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (i + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
          tabs.length;
  tabs[next].click();
  tabs[next].focus();
});
function renderReceipt(r, synthetic = false) {
  receipt = r;
  if (synthetic) {
    r.source.kind = "synthetic_example";
    r.limits.unshift("Synthetic example: invented addresses and balances.");
  }
  $("receipt-result").hidden = false;
  text(
    "receipt-source",
    synthetic ? "Synthetic example" : "Imported RPC snapshot",
  );
  text("receipt-delta", formatRaw(r.native.deltaLamports) + " SOL");
  text("receipt-fee", formatRaw(r.native.walletFeeLamports) + " SOL");
  text("receipt-residual", formatRaw(r.native.unexplainedLamports) + " SOL");
  text("receipt-evidence", JSON.stringify(r, null, 2));
  $("receipt-error").hidden = true;
}
$("receipt-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const file = $("receipt-file").files[0];
    if (!file || file.size > LIMIT) throw Error();
    renderReceipt(
      makeReceipt(parseRpcJson(await file.text()), $("wallet").value.trim()),
    );
  } catch {
    receipt = null;
    $("receipt-result").hidden = true;
    $("receipt-error").hidden = false;
    text(
      "receipt-error",
      "Use a public wallet from this transaction and an RPC getTransaction JSON file with compiled encoding json. Maximum size is 5 MB.",
    );
  }
});
$("receipt-demo").addEventListener("click", () => {
  const wallet = exampleReceipt.result.transaction.message.accountKeys[0];
  $("wallet").value = wallet;
  renderReceipt(makeReceipt(exampleReceipt, wallet), true);
});
$("receipt-json").addEventListener("click", () => {
  if (receipt)
    download(
      "transaction-receipt.json",
      JSON.stringify(receipt, null, 2) + "\n",
    );
});
$("receipt-html").addEventListener("click", () => {
  if (receipt)
    download("transaction-receipt.html", receiptHtml(receipt), "text/html");
});
render(fromSnapshot(exampleAccounts.mint, exampleAccounts, "synthetic"));

// Offline launch-plan checks reuse the CLI engine; no simulation or RPC here.
const planFields = {
  name: "plan-name",
  symbol: "plan-symbol",
  metadataUri: "plan-uri",
  creator: "plan-creator",
  payer: "plan-payer",
  mint: "plan-mint",
  quoteAsset: "plan-quote",
  budgetLamports: "plan-budget",
};
let checkedPlan = null,
  planReport = null,
  planExample = false;
function clearPlan() {
  checkedPlan = null;
  planReport = null;
  $("plan-result").hidden = true;
  $("plan-empty").hidden = false;
  $("plan-error").hidden = true;
  $("plan-download").disabled = true;
}
function renderPlan(input, source) {
  const value = reviewPlan(input);
  checkedPlan = value.plan;
  planReport = { ...value.report, source: { kind: source } };
  $("plan-empty").hidden = true;
  $("plan-result").hidden = false;
  $("plan-error").hidden = true;
  text(
    "plan-source",
    source === "synthetic_example"
      ? "Synthetic example"
      : source === "imported_plan"
        ? "Imported public plan"
        : "Form settings",
  );
  const blocked = planReport.status === "blocked",
    errors = planReport.findings.filter((f) => f.severity === "error").length;
  text("plan-status", blocked ? "Changes needed" : "Supported settings passed");
  text(
    "plan-summary",
    blocked
      ? `${errors} blocking ${errors === 1 ? "error" : "errors"}. Review the findings before exporting a plan.`
      : "The supported offline checks passed. Review the warnings; no simulation was performed.",
  );
  $("plan-findings").replaceChildren();
  for (const finding of planReport.findings) {
    const li = document.createElement("li"),
      label = document.createElement("strong"),
      message = document.createElement("span");
    li.dataset.severity = finding.severity;
    label.textContent =
      finding.severity === "error" ? "Blocking error" : "Warning";
    message.textContent = finding.message;
    li.append(label, message);
    $("plan-findings").append(li);
  }
  $("plan-download").disabled = !checkedPlan;
  text(
    "plan-download-note",
    blocked
      ? "Plan download is disabled while blocking errors remain. The check report omits unsupported and unvalidated input."
      : source === "synthetic_example"
        ? "Example addresses and metadata are invented. Do not fund these addresses or treat this example as a launch."
        : "Download the validated public plan for your own workflow. Editing the form clears this report.",
  );
  text("plan-evidence", JSON.stringify(planReport, null, 2));
}
$("plan-form").addEventListener("input", () => {
  planExample = false;
  clearPlan();
});
$("plan-form").addEventListener("change", (e) => {
  if (e.target.id !== "plan-file") {
    planExample = false;
    clearPlan();
  }
});
$("plan-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const plan = {
    schemaVersion: 1,
    network: "mainnet-beta",
    route: "pumpfun",
    tokenProgram: "token2022",
    mayhemMode: false,
    cashback: false,
    creatorFeeBps: 0,
    holderRewards: $("plan-holder").checked,
  };
  for (const [key, id] of Object.entries(planFields)) plan[key] = $(id).value;
  renderPlan(plan, planExample ? "synthetic_example" : "form_settings");
});
$("plan-demo").addEventListener("click", () => {
  for (const [key, id] of Object.entries(planFields))
    $(id).value = examplePlan[key];
  $("plan-holder").checked = examplePlan.holderRewards;
  planExample = true;
  renderPlan(examplePlan, "synthetic_example");
});
$("plan-import").addEventListener("click", () => $("plan-file").click());
$("plan-file").addEventListener("change", async () => {
  const file = $("plan-file").files[0];
  if (!file) return;
  clearPlan();
  try {
    if (file.size > 65536) throw Error();
    const input = parseRpcJson(await file.text());
    renderPlan(input, "imported_plan");
    $("plan-form").reset();
    planExample = false;
    if (checkedPlan) {
      for (const [key, id] of Object.entries(planFields))
        $(id).value = checkedPlan[key];
      $("plan-holder").checked = checkedPlan.holderRewards;
    }
  } catch {
    clearPlan();
    $("plan-error").hidden = false;
    text(
      "plan-error",
      "Could not read this public plan. Use a JSON plan object no larger than 64 KiB. Do not include keys or provider credentials.",
    );
  } finally {
    $("plan-file").value = "";
  }
});
$("plan-report").addEventListener("click", () => {
  if (planReport)
    download(
      "launch-plan-check.json",
      JSON.stringify(planReport, null, 2) + "\n",
    );
});
$("plan-download").addEventListener("click", () => {
  if (checkedPlan)
    download("launch-plan.json", JSON.stringify(checkedPlan, null, 2) + "\n");
});
