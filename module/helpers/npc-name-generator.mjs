const PACK_IDS = {
  firstNames: "procedural.procedural-npc-first-names",
  lastNames: "procedural.procedural-npc-last-names",
  personalities: "procedural.procedural-npc-personalities"
};

const NPC_AGE_FORMULA = "2d10+20";

const cachedTables = {};

async function getTable(key) {
  if (cachedTables[key]) return cachedTables[key];
  try {
    const pack = game.packs.get(PACK_IDS[key]);
    if (!pack) throw new Error(`Missing compendium pack "${PACK_IDS[key]}"`);
    const [table] = await pack.getDocuments();
    if (!table) throw new Error(`Compendium pack "${PACK_IDS[key]}" contains no RollTable`);
    cachedTables[key] = table;
    return table;
  } catch (err) {
    console.error("PROCEDURAL | Failed to load NPC roll table", err);
    ui.notifications?.error("PROCEDURAL! failed to load an NPC roll table. Check the console for details.");
    throw err;
  }
}

async function drawText(key) {
  const table = await getTable(key);
  const { results } = await table.roll();
  if (results.length === 0) {
    const err = new Error(`Roll on table "${table.name}" returned no results — check the table's formula against its result ranges`);
    console.error("PROCEDURAL | Failed to draw from NPC roll table", err);
    ui.notifications?.error("PROCEDURAL! failed to draw from an NPC roll table. Check the console for details.");
    throw err;
  }
  return results[0].text;
}

export const rollFirstName = () => drawText("firstNames");
export const rollLastName = () => drawText("lastNames");
export const rollPersonalityTrait = () => drawText("personalities");

export async function rollFullName() {
  const [first, last] = await Promise.all([rollFirstName(), rollLastName()]);
  return `${first} ${last}`;
}

export async function rollNpcAge() {
  const roll = await new Roll(NPC_AGE_FORMULA).evaluate();
  return roll.total;
}

export async function getPersonalityTraitOptions() {
  const table = await getTable("personalities");
  return table.results.map(r => r.text);
}
