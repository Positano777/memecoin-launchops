import {
  normalizeLaunchEvidence,
  launchMapSummary,
} from "../src/launch-map.mjs";
import { parseRpcJson, LIMIT } from "../vendor/receipt/core.mjs";
import baseExample from "../examples/launch-map.synthetic.json";
import mainnetExample from "../examples/launch-map.mainnet.json";

const $ = (id) => document.getElementById(id),
  ns = "http://www.w3.org/2000/svg";
const short = (v) => v.slice(0, 6) + "…" + v.slice(-6);
const number = (v) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(v);
function put(id, value) {
  $(id).textContent = value;
}
function el(name, text, className) {
  const e = document.createElement(name);
  if (text !== undefined) e.textContent = text;
  if (className) e.className = className;
  return e;
}
function svg(name, attrs, text) {
  const e = document.createElementNS(ns, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}
function link(source, label) {
  const a = el("a", label);
  a.href = source.url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
}
function save(name, value, type) {
  const url = URL.createObjectURL(
    value instanceof Blob ? value : new Blob([value], { type }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function exampleMap(kind) {
  const e = structuredClone(baseExample);
  if (kind === "distributed") {
    for (const row of e.launchSlotObservations.transactions)
      row.positiveDeltaPctOfSupply = 2;
    e.launchSlotObservations.summedPositiveDeltasPctOfSupply = 12;
  }
  if (kind === "partial") {
    e.coverage.launchBlock = "incomplete";
    e.coverage.launchBlockDetails = {
      slot: e.creation.slot,
      source: "getBlock",
      relevantTransactions: 12,
      inspectedTransactions: 2,
      reasons: ["sample_limit"],
    };
    e.launchSlotObservations.transactions =
      e.launchSlotObservations.transactions.slice(0, 2);
    e.launchSlotObservations.transactionCount = 2;
    e.launchSlotObservations.netAcquiringFeePayers =
      e.launchSlotObservations.transactions.map((r) => r.wallet);
    e.launchSlotObservations.summedPositiveDeltasPctOfSupply = 19;
  }
  return normalizeLaunchEvidence(e);
}

export function setupLaunchMap() {
  let evidence = null,
    summary = null,
    selected = null,
    sourceName = "Synthetic example",
    importGeneration = 0;
  function failure() {
    evidence = null;
    summary = null;
    selected = null;
    $("map-result").hidden = true;
    $("map-error").hidden = false;
    put(
      "map-error",
      "Could not read this launch evidence. Use a supported evidence JSON or saved token scan, no larger than 5 MB. Invalid addresses, conflicting observations and inconsistent coverage are rejected.",
    );
  }
  function select(wallet) {
    const focusArea = $("launch-graph").contains(document.activeElement)
      ? "map-nodes"
      : $("map-wallet-list").contains(document.activeElement)
        ? "map-wallet-list"
        : null;
    selected = wallet;
    renderWallet();
    renderChoices();
    draw();
    if (focusArea)
      $(focusArea).querySelector(`[data-wallet="${wallet}"]`)?.focus();
  }
  function draw() {
    $("map-lines").replaceChildren();
    $("map-nodes").replaceChildren();
    const rows = summary.wallets.slice(0, 8);
    put(
      "map-node-note",
      `${rows.length} of ${summary.wallets.length} mapped fee payers`,
    );
    const center = svg("g", {});
    center.append(
      svg("circle", {
        cx: 360,
        cy: 210,
        r: 49,
        fill: "#e5eee8",
        stroke: "#2d604b",
        "stroke-width": 2,
      }),
      svg(
        "text",
        {
          x: 360,
          y: 205,
          "text-anchor": "middle",
          "font-size": 16,
          "font-weight": 600,
        },
        "Token",
      ),
      svg(
        "text",
        { x: 360, y: 226, "text-anchor": "middle", "font-size": 11 },
        short(evidence.mint),
      ),
    );
    $("map-nodes").append(center);
    rows.forEach((w, i) => {
      const angle = -Math.PI / 2 + (i * Math.PI * 2) / Math.max(rows.length, 1),
        x = 360 + 260 * Math.cos(angle),
        y = 210 + 137 * Math.sin(angle),
        r = 22 + Math.sqrt(w.shareOfMappedGains / 100) * 24,
        active = w.wallet === selected;
      $("map-lines").append(
        svg("line", {
          x1: 360,
          y1: 210,
          x2: x,
          y2: y,
          stroke: "#b9cdc1",
          "stroke-width": 1.5,
          "stroke-dasharray": "5 6",
        }),
      );
      const g = svg("g", {
        role: "button",
        tabindex: 0,
        "aria-label": `Select observed fee payer ${short(w.wallet)}`,
        "aria-pressed": String(active),
        "data-wallet": w.wallet,
      });
      g.append(
        svg("circle", {
          cx: x,
          cy: y,
          r,
          fill: active ? "#2d604b" : "#e5eee8",
          stroke: "#2d604b",
          "stroke-width": active ? 3 : 1.5,
        }),
        svg(
          "text",
          {
            x,
            y: y + 4,
            "text-anchor": "middle",
            "font-size": 14,
            "font-weight": 600,
            class: active ? "map-node-selected" : "map-node-number",
          },
          String(i + 1),
        ),
        svg(
          "text",
          { x, y: y + r + 19, "text-anchor": "middle", "font-size": 12 },
          short(w.wallet),
        ),
      );
      g.addEventListener("click", () => select(w.wallet));
      g.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          select(w.wallet);
        }
      });
      $("map-nodes").append(g);
    });
  }
  function renderWallet() {
    const w = summary.wallets.find((row) => row.wallet === selected);
    $("map-wallet-transactions").replaceChildren();
    $("map-wallet-empty").hidden = !!w;
    put(
      "map-wallet-heading",
      w ? "Observed fee payer" : "Choose an observed fee payer",
    );
    put("map-wallet-address", w ? w.wallet : "");
    put(
      "map-wallet-stats",
      w
        ? `${number(w.positiveDeltaPctOfSupply)}% of supply in summed positive deltas across ${w.transactions.length} supplied transactions. ${number(w.shareOfMappedGains)}% of mapped gains; not holdings.`
        : "No transaction-backed wallet selected.",
    );
    for (const row of w?.transactions.slice(0, 50) ?? []) {
      const item = el("div", undefined, "map-tx");
      item.append(
        el(
          "span",
          `+${number(row.positiveDeltaPctOfSupply)}% of supply · gain observation`,
        ),
        link(row.source, short(row.source.signature)),
      );
      $("map-wallet-transactions").append(item);
    }
    if ((w?.transactions.length ?? 0) > 50)
      $("map-wallet-transactions").append(
        el(
          "p",
          "Showing 50 transactions. Download evidence for the full supplied list.",
          "subtle",
        ),
      );
  }
  function renderChoices() {
    const query = $("map-search").value.trim();
    const matches = summary.wallets.filter((w) => w.wallet.includes(query));
    $("map-wallet-list").replaceChildren();
    for (const w of matches.slice(0, 50)) {
      const b = el("button", undefined, "map-wallet-choice");
      b.type = "button";
      b.dataset.wallet = w.wallet;
      b.setAttribute("aria-pressed", String(w.wallet === selected));
      b.setAttribute("aria-label", `Inspect ${w.wallet}`);
      b.append(
        el("span", short(w.wallet)),
        el("strong", `+${number(w.positiveDeltaPctOfSupply)}%`),
        el(
          "small",
          `${w.transactions.length} supplied transactions · ${number(w.shareOfMappedGains)}% of mapped gains`,
        ),
      );
      b.addEventListener("click", () => select(w.wallet));
      $("map-wallet-list").append(b);
    }
    put(
      "map-list-note",
      `${Math.min(matches.length, 50)} of ${matches.length} matching fee payers shown. Percentages describe positive deltas, not current ownership. Full supplied data is in the evidence download.`,
    );
  }
  function render(e, source) {
    importGeneration++;
    evidence = e;
    summary = launchMapSummary(e);
    sourceName = source;
    selected = summary.wallets[0]?.wallet ?? null;
    $("map-search").value = "";
    $("map-result").hidden = false;
    $("map-error").hidden = true;
    put("map-source", source);
    $("map-example-note").hidden = !e.syntheticExample;
    const status = e.coverage.launchBlock,
      details = e.coverage.launchBlockDetails;
    put(
      "map-coverage-status",
      {
        complete: "Complete response reported",
        incomplete: "Incomplete response",
        unavailable: "Block unavailable",
        unknown: "Coverage unknown",
      }[status],
    );
    put(
      "map-coverage-detail",
      details
        ? `${details.inspectedTransactions} of ${details.relevantTransactions ?? "unknown"} relevant transactions inspected in the supplied scan.`
        : "No block-inspection denominator was supplied.",
    );
    put("map-slot", e.creation ? String(e.creation.slot) : "Unknown");
    $("map-creation-link").hidden = !e.creation;
    if (e.creation) $("map-creation-link").href = e.creation.source.url;
    else $("map-creation-link").removeAttribute("href");
    put("map-count", `${summary.wallets.length} fee payers`);
    put(
      "map-count-note",
      `${summary.mappedTransactions} transaction-backed gain observations. Reported summary: ${summary.reportedFeePayers} fee payers.`,
    );
    put(
      "map-coverage-warning",
      `${source}. Coverage is reported by the supplied scan, not independently verified here. ${status === "complete" ? "A complete provider response does not establish complete wallet history or prove purchases." : "Missing evidence is unknown, not zero activity."}`,
    );
    $("map-no-observations").hidden = summary.hasTransactionEvidence;
    put("map-mint", e.mint);
    put(
      "map-identity",
      e.creation
        ? `Creation fee payer: ${e.creation.feePayer ?? "unknown"}. Creator relationship unverified. Supplied scan time: ${new Date(e.scannedAt).toISOString()}.`
        : "Creation unavailable. No creation-slot observations can be established.",
    );
    $("map-limits").replaceChildren(...e.limitations.map((v) => el("li", v)));
    put("map-evidence", JSON.stringify(e, null, 2));
    $("map-outflows").replaceChildren();
    for (const row of e.feePayerOutflows) {
      const item = el("div", undefined, "map-outflow-row");
      item.append(
        el("strong", `Reported ${row.kind} · unverified`),
        el(
          "span",
          `${row.secondsAfterLaunch === null ? "Time unknown" : "T+" + row.secondsAfterLaunch + "s"} · ${number(row.pctOfSupply)}% of supply`,
        ),
        link(row.source, "Open transaction"),
      );
      $("map-outflows").append(item);
    }
    if (!e.feePayerOutflows.length)
      $("map-outflows").append(
        el(
          "p",
          "No classified fee-payer outflows were supplied. That does not establish that no sale or transfer occurred.",
          "map-outflows-empty",
        ),
      );
    renderWallet();
    renderChoices();
    draw();
  }
  $("map-demo").addEventListener("click", () => {
    if ($("map-example").value === "mainnet")
      render(
        normalizeLaunchEvidence(mainnetExample),
        "Saved mainnet example · unverified here",
      );
    else render(exampleMap($("map-example").value), "Synthetic example");
  });
  $("map-import").addEventListener("click", () => $("map-file").click());
  $("map-file").addEventListener("change", async () => {
    const file = $("map-file").files[0];
    if (!file) return;
    const generation = ++importGeneration;
    evidence = null;
    summary = null;
    selected = null;
    $("map-result").hidden = true;
    $("map-error").hidden = true;
    try {
      if (file.size > LIMIT) throw Error();
      const input = parseRpcJson(await file.text());
      if (generation !== importGeneration) return;
      render(normalizeLaunchEvidence(input), "Imported evidence · unverified");
    } catch {
      if (generation === importGeneration) failure();
    } finally {
      $("map-file").value = "";
    }
  });
  $("map-search").addEventListener("input", () => {
    if (evidence) renderChoices();
  });
  $("map-json").addEventListener("click", () => {
    if (evidence)
      save(
        "launch-map-evidence.json",
        JSON.stringify(evidence, null, 2) + "\n",
        "application/json",
      );
  });
  $("map-png").addEventListener("click", async () => {
    if (!evidence) return;
    const e = evidence,
      s = summary,
      source = sourceName;
    $("map-png").disabled = true;
    try {
      const { shareCard } = await import("./map-share.mjs");
      const blob = await shareCard(e, s, source);
      save("launch-map-card.png", blob, "image/png");
    } catch {
      $("map-error").hidden = false;
      put(
        "map-error",
        "Could not create the share card in this browser. You can still download the evidence JSON.",
      );
    } finally {
      $("map-png").disabled = false;
    }
  });
  render(exampleMap("uneven"), "Synthetic example");
}
