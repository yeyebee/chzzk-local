import fs from "node:fs/promises";
import path from "node:path";
const root = process.cwd(),
  target = path.join(root, "dist", "extension");
const resolved = path.resolve(target),
  expected = path.resolve(root, "dist", "extension");
if (
  resolved !== expected ||
  path.dirname(resolved) !== path.resolve(root, "dist")
)
  throw new Error("Unexpected extension output path");
const existing = await fs.lstat(resolved).catch((error) => {
  if (error.code === "ENOENT") return null;
  throw error;
});
if (existing) {
  if (
    existing.isSymbolicLink() ||
    path.resolve(await fs.realpath(resolved)) !== resolved
  )
    throw new Error("Refusing to replace a linked output directory");
  await fs.rm(resolved, { recursive: true });
}
await fs.mkdir(target, { recursive: true });
await fs.cp(path.join(root, "packages"), path.join(target, "packages"), {
  recursive: true,
});
await fs.cp(
  path.join(root, "apps", "extension"),
  path.join(target, "apps", "extension"),
  { recursive: true },
);
await fs.copyFile(
  path.join(root, "apps/extension/manifest.json"),
  path.join(target, "manifest.json"),
);
for (const file of ["README.md", "LICENSE"])
  await fs.copyFile(path.join(root, file), path.join(target, file));
await fs.cp(path.join(root, "docs"), path.join(target, "docs"), {
  recursive: true,
});
const html = await fs.readFile(
  path.join(root, "packages/ui/index.html"),
  "utf8",
);
await fs.writeFile(
  path.join(target, "packages/ui/index.html"),
  html
    .replace(
      "connect-src 'none'",
      "connect-src https://api.chzzk.naver.com https://comm-api.game.naver.com",
    )
    .replace('src="app.mjs"', 'src="../../apps/extension/bootstrap.mjs"'),
);
console.log("Extension built: " + target);
