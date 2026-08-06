const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

class ProceduralItemSheetBase extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["procedural", "sheet", "item"],
    position: { width: 480, height: 420 },
    window: { resizable: true }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.item = this.item;
    context.system = this.item.system;
    return context;
  }
}

export class ProceduralTropeItemSheet extends ProceduralItemSheetBase {
  static PARTS = {
    form: { template: "systems/procedural/templates/item/trope-sheet.hbs" }
  };
}

export class ProceduralTalentItemSheet extends ProceduralItemSheetBase {
  static PARTS = {
    form: { template: "systems/procedural/templates/item/talent-sheet.hbs" }
  };
}

export class ProceduralEquipmentItemSheet extends ProceduralItemSheetBase {
  static PARTS = {
    form: { template: "systems/procedural/templates/item/equipment-sheet.hbs" }
  };
}
