import { mkdir, writeFile } from "node:fs/promises";
import { plan, wire, snapshot } from "../test/fixtures.mjs";
const root = new URL("../examples/", import.meta.url);
await mkdir(root, { recursive: true });
for (const [name, value] of [
  ["plan.synthetic.json", plan()],
  ["accounts.active.synthetic.json", snapshot()],
  ["accounts.pending.synthetic.json", snapshot({ complete: true })],
  ["accounts.pool.synthetic.json", snapshot({ complete: true, pool: true })],
])
  await writeFile(new URL(name, root), JSON.stringify(value, null, 2) + "\n");
await writeFile(
  new URL("creation.synthetic.unsigned.base64", root),
  wire() + "\n",
);
