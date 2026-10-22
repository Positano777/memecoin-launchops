import { sha256 } from "@noble/hashes/sha256";
import { Buffer } from "buffer";
// The engine uses only SHA-256, with this small synchronous Node-compatible facade.
export function createHash(algorithm) {
  if (algorithm !== "sha256") throw new Error("Unsupported hash algorithm");
  const hash = sha256.create();
  return {
    update(value) {
      hash.update(
        typeof value === "string" ? new TextEncoder().encode(value) : value,
      );
      return this;
    },
    digest(encoding) {
      const bytes = Buffer.from(hash.digest());
      return encoding ? bytes.toString(encoding) : bytes;
    },
  };
}
