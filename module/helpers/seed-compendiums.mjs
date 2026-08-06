const SEED_PACKS = [
  {
    label: "Procedural: Tropes",
    name: "procedural-tropes",
    type: "trope",
    path: "systems/procedural/data/tropes.json"
  },
  {
    label: "Procedural: Second Talents",
    name: "procedural-second-talents",
    type: "talent",
    path: "systems/procedural/data/second-talents.json"
  }
];

export async function seedCompendiums() {
  if (!game.user.isGM) return;

  for (const pack of SEED_PACKS) {
    try {
      const existing = game.packs.get(`world.${pack.name}`);
      if (existing) continue;

      const response = await fetch(pack.path);
      const source = await response.json();

      const collection = await CompendiumCollection.createCompendium({
        type: "Item",
        label: pack.label,
        name: pack.name,
        package: "world"
      });

      const items = source.map(entry => ({
        name: entry.name,
        type: pack.type,
        img: entry.img,
        system: entry.system
      }));

      await Item.createDocuments(items, { pack: collection.collection });
    } catch (err) {
      console.error(`PROCEDURAL | Failed to seed compendium "${pack.label}"`, err);
      ui.notifications?.error(`PROCEDURAL! failed to create the "${pack.label}" compendium. Check the console for details.`);
    }
  }
}
