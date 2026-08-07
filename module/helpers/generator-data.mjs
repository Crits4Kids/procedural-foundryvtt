export const GENERATOR_DATA_PATHS = {
  tropes: "systems/procedural/data/tropes.json",
  secondTalents: "systems/procedural/data/second-talents.json",
  qualities: "systems/procedural/data/qualities.json",
  quirks: "systems/procedural/data/quirks.json",
  bstories: "systems/procedural/data/bstories.json",
  hq: "systems/procedural/data/hq.json",
  agencyNames: "systems/procedural/data/agency-names.json",
  deskItems: "systems/procedural/data/desk-items.json"
};

let cachedGeneratorData = null;

export async function loadGeneratorData() {
  if (cachedGeneratorData) return cachedGeneratorData;
  try {
    const entries = await Promise.all(
      Object.entries(GENERATOR_DATA_PATHS).map(async ([key, path]) => {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Failed to fetch "${path}" (${response.status} ${response.statusText})`);
        return [key, await response.json()];
      })
    );
    cachedGeneratorData = Object.fromEntries(entries);
    return cachedGeneratorData;
  } catch (err) {
    console.error("PROCEDURAL | Failed to load character generator data", err);
    ui.notifications?.error("PROCEDURAL! failed to load character generator data. Check the console for details.");
    throw err;
  }
}
