import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
test("receipt vendoring matches the pinned source manifest", async () => {
  const base = new URL("../vendor/receipt/", import.meta.url);
  const p = JSON.parse(
    await readFile(new URL("PROVENANCE.json", base), "utf8"),
  );
  for (const [name, hash] of Object.entries(p.filesSha256)) {
    assert.equal(
      createHash("sha256")
        .update(await readFile(new URL(name, base)))
        .digest("hex"),
      hash,
      name,
    );
  }
});
