import {
  readFile,
  writeFile,
  mkdir,
  copyFile,
  readdir,
} from "node:fs/promises";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
const root = fileURLToPath(new URL("../", import.meta.url)),
  dashboard = resolve(root, "dashboard"),
  out = resolve(dashboard, "dist");
const esbuild = process.argv[2]
  ? await import(pathToFileURL(resolve(process.argv[2])).href)
  : await import("esbuild");
if (esbuild.version !== "0.28.2") throw Error("Use reviewed esbuild 0.28.2.");
await mkdir(out, { recursive: true });
const built = await esbuild.build({
  absWorkingDir: root,
  tsconfigRaw: { compilerOptions: {} },
  entryPoints: ["dashboard/app.mjs"],
  outfile: resolve(out, "app.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  minify: true,
  metafile: true,
  legalComments: "eof",
  inject: [resolve(dashboard, "buffer-browser.mjs")],
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [
    {
      name: "browser-sha256",
      setup(build) {
        build.onResolve({ filter: /^node:crypto$/ }, () => ({
          path: resolve(dashboard, "crypto-browser.mjs"),
        }));
      },
    },
  ],
});
for (const file of ["index.html", "styles.css", "favicon.svg"])
  await copyFile(resolve(dashboard, file), resolve(out, file));
const packages = new Map();
for (const input of Object.keys(built.metafile.inputs)) {
  if (!input.includes("node_modules")) continue;
  let folder = dirname(resolve(root, input));
  while (folder !== dirname(folder)) {
    try {
      const p = JSON.parse(
        await readFile(resolve(folder, "package.json"), "utf8"),
      );
      if (p.name && p.version) {
        packages.set(p.name + "@" + p.version, { folder, info: p });
        break;
      }
    } catch {}
    folder = dirname(folder);
  }
}
let licenses = "LaunchOps dashboard / third-party notices\n\n";
const records = [];
for (const [name, { folder, info }] of [...packages].sort()) {
  let files = (await readdir(folder, { withFileTypes: true })).filter(
    (e) =>
      e.isFile() && /^(licen[cs]e|copying|unlicense)([.-]|$)/i.test(e.name),
  );
  if (!files.length && name === "bs58@4.0.1" && info.license === "MIT") {
    const readme = await readFile(resolve(folder, "README.md"), "utf8");
    if (/License\s*\r?\n-+\s*\r?\n\s*MIT\s*$/m.test(readme))
      files = [{ name: "README.md" }];
  }
  if (!files.length)
    throw Error("License text missing for bundled dependency: " + name);
  licenses += "\n===== " + name + " (" + info.license + ") =====\n";
  for (const file of files)
    licenses += (await readFile(resolve(folder, file.name), "utf8")) + "\n";
  records.push({
    name,
    license: info.license,
    licenseFiles: files.map((f) => f.name),
  });
}
for (const file of [
  "LICENSE",
  "vendor/receipt/LICENSE",
  "vendor/launch-evidence/LICENSE",
  "vendor/receipt/vendor/VTX-Labs-LICENSE",
  "vendor/receipt/vendor/bs58-LICENSE",
  "vendor/receipt/vendor/base-x-LICENSE",
])
  licenses +=
    "\n===== " +
    file +
    " =====\n" +
    (await readFile(resolve(root, file), "utf8"));
await writeFile(resolve(out, "licenses.txt"), licenses.replace(/\r\n/g, "\n"));
const hashes = {};
for (const file of [
  "app.js",
  "index.html",
  "styles.css",
  "licenses.txt",
  "favicon.svg",
])
  hashes[file] = createHash("sha256")
    .update(await readFile(resolve(out, file)))
    .digest("hex");
await writeFile(
  resolve(out, "build-manifest.json"),
  JSON.stringify(
    {
      schemaVersion: 1,
      bundler: "esbuild " + esbuild.version,
      packages: records,
      filesSha256: hashes,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    files: Object.keys(hashes),
    bundledPackages: records.length,
    scriptBytes: (await readFile(resolve(out, "app.js"))).length,
  }),
);
