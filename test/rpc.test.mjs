import test from "node:test";
import assert from "node:assert/strict";
import { ReadRpc } from "../src/rpc.mjs";
import { MAINNET_GENESIS } from "../src/common.mjs";
import { LIMIT } from "../vendor/receipt/core.mjs";
function response(result) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
}
test("RPC method allowlist rejects signing and sending", async () => {
  let called = false;
  const r = new ReadRpc("https://example.invalid", async () => {
    called = true;
  });
  await assert.rejects(r.call("sendTransaction", []), /only read/);
  assert.equal(called, false);
});
test("remote HTTP, basic auth and fragments refused", () => {
  for (const url of [
    "http://example.invalid",
    "https://name:password@example.invalid",
    "https://example.invalid/#sensitive-marker",
  ])
    assert.throws(() => new ReadRpc(url));
});
test("loopback HTTP is available for isolated testing", () =>
  assert.ok(new ReadRpc("http://127.0.0.1:9000")));
test("mainnet genesis mismatch is rejected", async () => {
  await assert.rejects(
    new ReadRpc("https://example.invalid", async () =>
      response("wrong-network"),
    ).verifyMainnet(),
    /genesis/,
  );
  await new ReadRpc("https://example.invalid", async () =>
    response(MAINNET_GENESIS),
  ).verifyMainnet();
});
test("request has no redirects, timeout, and explicit RPC envelope", async () => {
  const r = new ReadRpc(
    "https://example.invalid/?key=sensitive-marker",
    async (_url, o) => {
      assert.equal(o.redirect, "error");
      assert.ok(o.signal);
      assert.equal(JSON.parse(o.body).method, "getGenesisHash");
      return response(MAINNET_GENESIS);
    },
  );
  await r.verifyMainnet();
});
test("provider errors and endpoint are never forwarded", async () => {
  const r = new ReadRpc(
    "https://example.invalid/?key=sensitive-marker",
    async () =>
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          error: { message: "sensitive-marker" },
        }),
      ),
  );
  await assert.rejects(
    r.verifyMainnet(),
    (e) => !e.message.includes("sensitive-marker"),
  );
});
test("malformed JSON, wrong ID, bad HTTP and oversized responses refused", async () => {
  for (const f of [
    () => new Response("sensitive-marker"),
    () => new Response('{"jsonrpc":"2.0","id":2,"result":{}}'),
    () => new Response("", { status: 429 }),
    () => new Response(" ".repeat(LIMIT + 1)),
  ])
    await assert.rejects(
      new ReadRpc("https://example.invalid", async () => f()).verifyMainnet(),
      /unusable/,
    );
});
