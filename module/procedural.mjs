import TropeActorData from "./data/actor-trope.mjs";
import NpcActorData from "./data/actor-npc.mjs";
import TropeItemData from "./data/item-trope.mjs";
import TalentItemData from "./data/item-talent.mjs";
import EquipmentItemData from "./data/item-equipment.mjs";
import CaseTrackerData from "./data/case-tracker.mjs";
import ProceduralActor from "./documents/actor.mjs";
import TropeBuilderApplication from "./apps/trope-builder.mjs";
import CaseTrackerApplication from "./apps/case-tracker.mjs";
import { registerChatListeners } from "./helpers/chat-listeners.mjs";
import ProceduralTropeActorSheet from "./sheets/actor-trope-sheet.mjs";
import ProceduralNpcActorSheet from "./sheets/actor-npc-sheet.mjs";
import {
  ProceduralTropeItemSheet,
  ProceduralTalentItemSheet,
  ProceduralEquipmentItemSheet
} from "./sheets/item-sheet.mjs";

Hooks.once("init", () => {
  CONFIG.Actor.dataModels.trope = TropeActorData;
  CONFIG.Actor.dataModels.npc = NpcActorData;
  CONFIG.Item.dataModels.trope = TropeItemData;
  CONFIG.Item.dataModels.talent = TalentItemData;
  CONFIG.Item.dataModels.equipment = EquipmentItemData;
  game.settings.register("procedural", "caseTracker", {
    scope: "world",
    config: false,
    type: CaseTrackerData
  });

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

  Items.unregisterSheet("core", ItemSheet);
  Items.registerSheet("procedural", ProceduralTropeItemSheet, { types: ["trope"], makeDefault: true });
  Items.registerSheet("procedural", ProceduralTalentItemSheet, { types: ["talent"], makeDefault: true });
  Items.registerSheet("procedural", ProceduralEquipmentItemSheet, { types: ["equipment"], makeDefault: true });
});

Hooks.on("renderActorDirectory", (app, element) => {
  if (!Actor.canUserCreate(game.user)) return;
  const header = element.querySelector(".directory-header .header-actions");
  if (!header || header.querySelector(".procedural-trope-builder-launch")) return;

  const button = document.createElement("button");
  button.type = "button";
  button.classList.add("procedural-trope-builder-launch");
  button.innerHTML = `<i class="fa-solid fa-dice-d20"></i> ${game.i18n.localize("PROCEDURAL.TropeBuilder.Launch")}`;
  button.addEventListener("click", () => {
    const existing = foundry.applications.instances.get("procedural-trope-builder");
    if (existing) {
      existing.bringToFront();
      return;
    }
    new TropeBuilderApplication().render(true);
  });
  header.appendChild(button);
});

Hooks.on("getSceneControlButtons", controls => {
  controls.tokens.tools.proceduralCaseTracker = {
    name: "proceduralCaseTracker",
    title: "PROCEDURAL.CaseTracker.Title",
    icon: "fa-solid fa-magnifying-glass",
    order: Object.keys(controls.tokens.tools).length,
    button: true,
    visible: game.user.isGM,
    onChange: () => {
      const existing = foundry.applications.instances.get("procedural-case-tracker");
      if (existing) {
        existing.bringToFront();
        return;
      }
      new CaseTrackerApplication().render(true);
    }
  };
});
