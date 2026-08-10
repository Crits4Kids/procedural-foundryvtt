import { rollFullName, rollNpcAge, rollPersonalityTrait } from "../helpers/npc-name-generator.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export default class ProceduralNpcActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["procedural", "sheet", "actor", "npc"],
    position: { width: 480, height: 480 },
    window: { resizable: true },
    actions: {
      rollPersonality: ProceduralNpcActorSheet.#onRollPersonality,
      createItem: ProceduralNpcActorSheet.#onCreateItem,
      editItem: ProceduralNpcActorSheet.#onEditItem,
      deleteItem: ProceduralNpcActorSheet.#onDeleteItem
    }
  };

  static PARTS = {
    form: { template: "systems/procedural/templates/actor/npc-sheet.hbs" }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.actor = this.actor;
    context.system = this.actor.system;
    context.items = {
      trope: this.actor.items.filter(i => i.type === "trope"),
      talent: this.actor.items.filter(i => i.type === "talent")
    };
    return context;
  }

  static async #onRollPersonality() {
    const [fullName, age, trait] = await Promise.all([
      rollFullName(),
      rollNpcAge(),
      rollPersonalityTrait()
    ]);
    const personality = `${fullName}, ${age}. ${trait}`;
    await this.actor.update({ name: fullName, "system.personality": personality });
  }

  static async #onCreateItem(event, target) {
    const type = target.dataset.type;
    await Item.create({ name: `New ${type}`, type }, { parent: this.actor });
  }

  static async #onEditItem(event, target) {
    const itemId = target.closest("[data-item-id]").dataset.itemId;
    this.actor.items.get(itemId)?.sheet.render(true);
  }

  static async #onDeleteItem(event, target) {
    const itemId = target.closest("[data-item-id]").dataset.itemId;
    await this.actor.items.get(itemId)?.delete();
  }
}
