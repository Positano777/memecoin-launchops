import { parseRpcJson, LIMIT } from "../vendor/receipt/core.mjs";
import { LaunchError, requireThat, MAINNET_GENESIS } from "./common.mjs";
const ALLOWED = new Set([
  "getGenesisHash",
  "getMultipleAccounts",
  "simulateTransaction",
]);
export class ReadRpc {
  #endpoint;
  #fetcher;
  constructor(
    endpoint = process.env.SOLANA_RPC_URL ||
      "https://api.mainnet-beta.solana.com",
    fetcher = fetch,
  ) {
    let url;
    try {
      url = new URL(endpoint);
    } catch {
      throw new LaunchError("Invalid RPC endpoint.");
    }
    requireThat(
      url.protocol === "https:" ||
        (url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)),
      "RPC must use HTTPS or loopback HTTP.",
    );
    requireThat(
      !url.username && !url.password && !url.hash,
      "Do not embed basic-auth credentials or fragments in RPC URLs.",
    );
    this.#endpoint = url;
    this.#fetcher = fetcher;
  }
  async call(method, params = []) {
    requireThat(
      ALLOWED.has(method),
      "This client permits only read and simulation RPC methods.",
    );
    try {
      const response = await this.#fetcher(this.#endpoint, {
        method: "POST",
        redirect: "error",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(20000),
      });
      if (
        !response.ok ||
        Number(response.headers.get("content-length")) > LIMIT
      )
        throw Error();
      const reader = response.body.getReader(),
        parts = [];
      let size = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > LIMIT) {
          await reader.cancel();
          throw Error();
        }
        parts.push(value);
      }
      const bytes = new Uint8Array(size);
      let p = 0;
      for (const part of parts) {
        bytes.set(part, p);
        p += part.length;
      }
      const body = parseRpcJson(new TextDecoder().decode(bytes));
      if (
        body?.jsonrpc !== "2.0" ||
        body.id !== 1 ||
        Object.hasOwn(body, "error") ||
        !Object.hasOwn(body, "result")
      )
        throw Error();
      return body.result;
    } catch {
      throw new LaunchError(
        "RPC unavailable or response unusable. Endpoint and provider details omitted.",
      );
    }
  }
  async verifyMainnet() {
    requireThat(
      (await this.call("getGenesisHash")) === MAINNET_GENESIS,
      "RPC does not report the expected mainnet genesis hash. No observation or simulation was performed.",
    );
  }
}
