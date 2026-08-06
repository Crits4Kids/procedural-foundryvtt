const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export default class ProceduralTropeActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["procedural", "sheet", "actor", "trope"],
    position: { width: 640, height: 720 },
    window: { resizable: true },
    actions: {
      rollSkill: ProceduralTropeActorSheet.#onRollSkill,
      toggleHurt: ProceduralTropeActorSheet.#onToggleHurt,
      createItem: ProceduralTropeActorSheet.#onCreateItem,
      editItem: ProceduralTropeActorSheet.#onEditItem,
      deleteItem: ProceduralTropeActorSheet.#onDeleteItem,
      randomizeTrope: ProceduralTropeActorSheet.#onRandomizeTrope
    }
  };

  static PARTS = {
    form: { template: "systems/procedural/templates/actor/trope-sheet.hbs" }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.actor = this.actor;
    context.system = this.actor.system;
    context.enrichedBiography = await TextEditor.implementation.enrichHTML(this.actor.system.biography, {
      secrets: this.actor.isOwner,
      relativeTo: this.actor
    });
    context.items = {
      trope: this.actor.items.filter(i => i.type === "trope"),
      talent: this.actor.items.filter(i => i.type === "talent"),
      equipment: this.actor.items.filter(i => i.type === "equipment")
    };
    return context;
  }

  static async #onRollSkill(event, target) {
    const skillKey = target.dataset.skill;
    const skillLabel = game.i18n.localize(`PROCEDURAL.Skill.${skillKey}`);

    const config = await foundry.applications.api.DialogV2.wait({
      window: { title: `${skillLabel} ${game.i18n.localize("PROCEDURAL.Roll.DialogTitleSuffix")}` },
      content: `
        <div class="procedural-roll-dialog">
          <label><input type="radio" name="mode" value="normal" checked> ${game.i18n.localize("PROCEDURAL.Roll.Normal")}</label>
          <label><input type="radio" name="mode" value="advantage"> ${game.i18n.localize("PROCEDURAL.Roll.Advantage")}</label>
          <label><input type="radio" name="mode" value="disadvantage"> ${game.i18n.localize("PROCEDURAL.Roll.Disadvantage")}</label>
          <label>${game.i18n.localize("PROCEDURAL.Roll.SituationalModifier")}
            <input type="number" name="situationalModifier" value="0" step="1">
          </label>
        </div>
      `,
      buttons: [
        {
          action: "roll",
          label: game.i18n.localize("PROCEDURAL.Roll.Roll"),
          default: true,
          callback: (event, button) => ({
            mode: button.form.elements.mode.value,
            situationalModifier: Number(button.form.elements.situationalModifier.value) || 0
          })
        },
        { action: "cancel", label: game.i18n.localize("PROCEDURAL.Roll.Cancel") }
      ],
      rejectClose: false
    });

    if (!config) return;
    await this.actor.rollSkill(skillKey, config);
  }

  static async #onToggleHurt() {
    await this.actor.update({ "system.hurt": !this.actor.system.hurt });
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

  static async #onRandomizeTrope() {
    const hasExistingData = this.actor.items.some(i => i.type === "trope") || !!this.actor.system.qualities;

    if (hasExistingData) {
      const confirmed = await foundry.applications.api.DialogV2.wait({
        window: { title: game.i18n.localize("PROCEDURAL.Actor.Randomize") },
        content: `<p>${game.i18n.localize("PROCEDURAL.Actor.RandomizeConfirm")}</p>`,
        buttons: [
          {
            action: "confirm",
            label: game.i18n.localize("PROCEDURAL.Actor.Confirm"),
            default: true,
            callback: () => true
          },
          {
            action: "cancel",
            label: game.i18n.localize("PROCEDURAL.Roll.Cancel"),
            callback: () => false
          }
        ],
        rejectClose: false
      });
      if (!confirmed) return;
    }

    await this.actor.generateRandomTrope();
  }
}
