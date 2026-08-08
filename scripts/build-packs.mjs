import { compilePack } from "@foundryvtt/foundryvtt-cli";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

const PACKS = [
  { dataFile: "data/tropes.json", packName: "procedural-tropes", itemType: "trope" },
  { dataFile: "data/second-talents.json", packName: "procedural-second-talents", itemType: "talent" },
  { dataFile: "data/desk-items.json", packName: "procedural-desk-items", itemType: "equipment" }
];

function stableId(seed) {
  const hash = createHash("sha256").update(seed).digest();
  let id = "";
  for (let i = 0; i < 16; i++) {
    id += ID_ALPHABET[hash[i] % ID_ALPHABET.length];
  }
  return id;
}

async function buildPack({ dataFile, packName, itemType }) {
  const entries = JSON.parse(await readFile(path.join(ROOT, dataFile), "utf8"));
  const srcDir = path.join(ROOT, ".pack-src", packName);
  const destDir = path.join(ROOT, "packs", packName);

  // Check for ID collisions before writing any files
  const idToNames = {};
  const collisions = [];
  for (const entry of entries) {
    const id = stableId(`${packName}:${entry.name}`);
    if (idToNames[id]) {
      collisions.push(`"${idToNames[id]}" and "${entry.name}" (ID: ${id})`);
    } else {
      idToNames[id] = entry.name;
    }
  }

  if (collisions.length > 0) {
    throw new Error(
      `Duplicate entry names in pack "${packName}": ${collisions.join(", ")}`
    );
  }

  await rm(srcDir, { recursive: true, force: true });
  await mkdir(srcDir, { recursive: true });

  for (const entry of entries) {
    const id = stableId(`${packName}:${entry.name}`);
    const document = {
      _id: id,
      name: entry.name,
      type: itemType,
      img: entry.img,
      system: entry.system,
      effects: [],
      folder: null,
      sort: 0,
      ownership: { default: 0 },
      flags: {}
    };
    await writeFile(path.join(srcDir, `${id}.json`), JSON.stringify(document, null, 2));
  }

  await rm(destDir, { recursive: true, force: true });
  await compilePack(srcDir, destDir, { log: true });
  await rm(srcDir, { recursive: true, force: true });

  console.log(`PROCEDURAL | Built pack "${packName}" (${entries.length} entries)`);
}

for (const pack of PACKS) {
  await buildPack(pack);
}
