import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function tagMatchesVersion(tag, version) {
  const normalizedTag = tag.startsWith("v") ? tag.slice(1) : tag;
  return normalizedTag === version;
}

async function main() {
  const tag = process.argv[2];
  if (!tag) {
    console.error("PROCEDURAL | check-version-tag: no tag argument provided");
    process.exit(1);
  }

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const systemManifest = JSON.parse(await readFile(path.join(root, "system.json"), "utf8"));

  if (!tagMatchesVersion(tag, systemManifest.version)) {
    console.error(
      `PROCEDURAL | tag "${tag}" does not match system.json version "${systemManifest.version}"`
    );
    process.exit(1);
  }

  console.log(`PROCEDURAL | tag "${tag}" matches system.json version "${systemManifest.version}"`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
