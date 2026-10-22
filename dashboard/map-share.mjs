export async function shareCard(evidence, summary, source) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error();
  const text = (value, x, y, size = 22, color = "#20372e", weight = 400) => {
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px "Segoe UI",system-ui,sans-serif`;
    ctx.fillText(value, x, y);
  };
  ctx.fillStyle = "#f1f4f1";
  ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 1200, 92);
  ctx.fillStyle = "#254e40";
  ctx.beginPath();
  ctx.roundRect(42, 25, 42, 42, 10);
  ctx.fill();
  ctx.strokeStyle = "#c5dfd1";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  for (const [x, y] of [
    [54, 47],
    [63, 36],
    [72, 41],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x, 57);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  text("LaunchOps", 100, 56, 28, "#20372e", 700);
  text("by Positano777", 280, 55, 18, "#65736b");
  text("The launch block, with receipts.", 44, 158, 42, "#20372e", 700);
  text(
    evidence.syntheticExample ? "Synthetic example · invented data" : source,
    44,
    199,
    21,
    "#88621e",
    600,
  );
  text("Mint  " + evidence.mint, 44, 241, 19, "#20372e");
  const facts = [
    [
      "Creation slot",
      evidence.creation ? String(evidence.creation.slot) : "Unknown",
    ],
    ["Mapped fee payers", String(summary.wallets.length)],
    ["Gain observations", String(summary.mappedTransactions)],
  ];
  facts.forEach(([label, value], i) => {
    const x = 44 + i * 240;
    text(label, x, 293, 18, "#65736b");
    text(value, x, 351, 38, "#20372e", 700);
  });
  text("Observation map / not transfer paths", 790, 278, 17, "#65736b");
  const center = { x: 970, y: 354 },
    rows = summary.wallets.slice(0, 6);
  ctx.setLineDash([4, 5]);
  ctx.strokeStyle = "#b9cdc1";
  ctx.lineWidth = 1.5;
  rows.forEach((w, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / rows.length,
      x = center.x + 110 * Math.cos(angle),
      y = center.y + 51 * Math.sin(angle);
    ctx.beginPath();
    ctx.moveTo(center.x, center.y);
    ctx.lineTo(x, y);
    ctx.stroke();
  });
  ctx.setLineDash([]);
  ctx.fillStyle = "#e5eee8";
  ctx.beginPath();
  ctx.arc(center.x, center.y, 28, 0, Math.PI * 2);
  ctx.fill();
  text("Token", center.x - 23, center.y + 6, 16, "#20372e", 600);
  rows.forEach((w, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / rows.length,
      x = center.x + 110 * Math.cos(angle),
      y = center.y + 51 * Math.sin(angle),
      r = 10 + Math.sqrt(w.shareOfMappedGains / 100) * 13;
    ctx.fillStyle = i === 0 ? "#2d604b" : "#e5eee8";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    text(String(i + 1), x - 4, y + 5, 14, i === 0 ? "#fff" : "#20372e", 600);
  });
  const d = evidence.coverage.launchBlockDetails;
  const count = d
    ? `${d.inspectedTransactions}/${d.relevantTransactions ?? "?"} relevant transactions inspected`
    : "Inspection coverage unknown";
  text(
    `Supplied RPC coverage: ${evidence.coverage.launchBlock} · ${count}`,
    44,
    434,
    22,
    "#20372e",
    600,
  );
  text(
    "Positive deltas may include transfers and repeat circulation.",
    44,
    477,
    22,
    "#88621e",
  );
  text(
    "Not current holdings, proven buys, common ownership or a confirmed bundle.",
    44,
    510,
    21,
    "#88621e",
  );
  text(
    "Open source · download the evidence and check the transactions.",
    44,
    564,
    20,
    "#20372e",
  );
  text("github.com/Positano777/memecoin-launchops", 44, 598, 18, "#65736b");
  return await new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(Error())),
      "image/png",
    ),
  );
}
