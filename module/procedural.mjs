import TropeActorData from "./data/actor-trope.mjs";
import NpcActorData from "./data/actor-npc.mjs";
import TropeItemData from "./data/item-trope.mjs";
import TalentItemData from "./data/item-talent.mjs";
import EquipmentItemData from "./data/item-equipment.mjs";
import ProceduralActor from "./documents/actor.mjs";
import { registerChatListeners } from "./helpers/chat-listeners.mjs";
import { seedCompendiums } from "./helpers/seed-compendiums.mjs";
import ProceduralTropeActorSheet from "./sheets/actor-trope-sheet.mjs";
import ProceduralNpcActorSheet from "./sheets/actor-npc-sheet.mjs";

Hooks.once("init", () => {
  CONFIG.Actor.dataModels.trope = TropeActorData;
  CONFIG.Actor.dataModels.npc = NpcActorData;
  CONFIG.Item.dataModels.trope = TropeItemData;
  CONFIG.Item.dataModels.talent = TalentItemData;
  CONFIG.Item.dataModels.equipment = EquipmentItemData;

  CONFIG.Actor.documentClass = ProceduralActor;

  registerChatListeners();

  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("procedural", ProceduralTropeActorSheet, {
    types: ["trope"],
    makeDefault: true,
    label: "PROCEDURAL.SheetTrope"
  });
  Actors.registerSheet("procedural", ProceduralNpcActorSheet, {
    types: ["npc"],
    makeDefault: true,
    label: "PROCEDURAL.SheetNpc"
  });
});

Hooks.once("ready", () => {
  seedCompendiums();
});
