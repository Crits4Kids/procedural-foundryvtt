const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ApplicationV2 } = foundry.applications.api;

function getCaseTracker() {
  return game.settings.get("procedural", "caseTracker");
}

async function setCaseTracker(data) {
  await game.settings.set("procedural", "caseTracker", data);
}

export default class CaseTrackerApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "procedural-case-tracker",
    classes: ["procedural", "case-tracker"],
    position: { width: 480, height: 640 },
    window: {
      title: "PROCEDURAL.CaseTracker.Title",
      resizable: true,
      contentTag: "form"
    },
    form: {
      handler: CaseTrackerApplication.#onSubmit,
      submitOnChange: true,
      closeOnSubmit: false
    }
  };

  static PARTS = {
    form: { template: "systems/procedural/templates/apps/case-tracker.hbs" }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const data = getCaseTracker().toObject();

    context.act = data.act;
    context.scene = data.scene;
    context.turnOrder = data.turnOrder;
    context.interludes = data.interludes.map((used, index) => ({
      index,
      used,
      label: `${game.i18n.localize("PROCEDURAL.CaseTracker.Interlude")} ${index + 1}`
    }));
    context.arrestPhaseTriggered = data.arrestPhaseTriggered;
    context.arrestPhaseNotes = data.arrestPhaseNotes;
    context.epilogueNotes = data.epilogueNotes;

    return context;
  }

  static async #onSubmit(event, form, formData) {
    const expanded = foundry.utils.expandObject(formData.object);
    await setCaseTracker({
      act: expanded.act ?? 1,
      scene: expanded.scene ?? 1,
      turnOrder: expanded.turnOrder ?? "",
      interludes: Object.values(expanded.interludes ?? {}),
      arrestPhaseTriggered: expanded.arrestPhaseTriggered ?? false,
      arrestPhaseNotes: expanded.arrestPhaseNotes ?? "",
      epilogueNotes: expanded.epilogueNotes ?? "",
      evidence: []
    });
  }
}
