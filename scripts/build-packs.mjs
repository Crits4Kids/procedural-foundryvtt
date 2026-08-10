import { compilePack } from "@foundryvtt/foundryvtt-cli";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

const PACKS = [
  { dataFile: "data/tropes.json", packName: "procedural-tropes", documentType: "Item", itemType: "trope" },
  { dataFile: "data/second-talents.json", packName: "procedural-second-talents", documentType: "Item", itemType: "talent" },
  { dataFile: "data/desk-items.json", packName: "procedural-desk-items", documentType: "Item", itemType: "equipment" },
  { dataFile: "data/npc-first-names.json", packName: "procedural-npc-first-names", documentType: "RollTable", tableName: "NPC First Names" },
  { dataFile: "data/npc-last-names.json", packName: "procedural-npc-last-names", documentType: "RollTable", tableName: "NPC Last Names" },
  { dataFile: "data/npc-personalities.json", packName: "procedural-npc-personalities", documentType: "RollTable", tableName: "NPC Personality Traits" }
];

function stableId(seed) {
  const hash = createHash("sha256").update(seed).digest();
  let id = "";
  for (let i = 0; i < 16; i++) {
    id += ID_ALPHABET[hash[i] % ID_ALPHABET.length];
  }
  return id;
}

export function buildRollTableResults(entries, packName) {
  const tableId = stableId(`${packName}:table`);
  return entries.map((text, i) => {
    const id = stableId(`${packName}:result:${i}`);
    return {
      _id: id,
      _key: `!tables.results!${tableId}.${id}`,
      type: 0,
      text,
      weight: 1,
      range: [i + 1, i + 1],
      drawn: false
    };
  });
}

export function buildRollTableDocument(packName, tableName, entries) {
  if (entries.length === 0) {
    throw new Error(`Cannot build RollTable "${tableName}" (pack "${packName}") from an empty entries array`);
  }
  const id = stableId(`${packName}:table`);
  return {
    _id: id,
    _key: `!tables!${id}`,
    name: tableName,
    img: "icons/svg/mystery-man.svg",
    description: "",
    formula: `1d${entries.length}`,
    replacement: true,
    displayRoll: true,
    results: buildRollTableResults(entries, packName),
    folder: null,
    sort: 0,
    ownership: { default: 0 },
    flags: {}
  };
}

async function buildItemPack({ dataFile, packName, itemType }) {
  const entries = JSON.parse(await readFile(path.join(ROOT, dataFile), "utf8"));
  const srcDir = path.join(ROOT, ".pack-src", packName);
  const destDir = path.join(ROOT, "packs", packName);

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
      _key: `!items!${id}`,
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

async function buildRollTablePack({ dataFile, packName, tableName }) {
  const entries = JSON.parse(await readFile(path.join(ROOT, dataFile), "utf8"));
  const srcDir = path.join(ROOT, ".pack-src", packName);
  const destDir = path.join(ROOT, "packs", packName);

  const document = buildRollTableDocument(packName, tableName, entries);

  await rm(srcDir, { recursive: true, force: true });
  await mkdir(srcDir, { recursive: true });
  await writeFile(path.join(srcDir, `${document._id}.json`), JSON.stringify(document, null, 2));

  await rm(destDir, { recursive: true, force: true });
  await compilePack(srcDir, destDir, { log: true });
  await rm(srcDir, { recursive: true, force: true });

  console.log(`PROCEDURAL | Built pack "${packName}" (1 RollTable, ${entries.length} results)`);
}

async function main() {
  for (const pack of PACKS) {
    if (pack.documentType === "RollTable") {
      await buildRollTablePack(pack);
    } else {
      await buildItemPack(pack);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
