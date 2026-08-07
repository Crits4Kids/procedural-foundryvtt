import { resolveDice } from "../helpers/dice-rules.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ApplicationV2 } = foundry.applications.api;

const EVIDENCE_STATUSES = ["good", "bad", "unknown"];

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
    },
    actions: {
      addEvidence: CaseTrackerApplication.#onAddEvidence,
      deleteEvidence: CaseTrackerApplication.#onDeleteEvidence,
      startInterrogation: CaseTrackerApplication.#onStartInterrogation,
      decrementInterrogation: CaseTrackerApplication.#onDecrementInterrogation,
      deleteInterrogation: CaseTrackerApplication.#onDeleteInterrogation
    }
  };

  static PARTS = {
    form: { template: "systems/procedural/templates/apps/case-tracker.hbs" }
  };

  async _prepareContext(options) {
    if (!game.user.isGM) throw new Error("The Case Tracker is GM-only.");
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

    context.evidence = data.evidence.map(entry => ({
      id: entry.id,
      description: entry.description,
      notes: entry.notes,
      statusOptions: EVIDENCE_STATUSES.map(status => ({
        value: status,
        label: game.i18n.localize(`PROCEDURAL.CaseTracker.Status.${status}`),
        selected: status === entry.status
      }))
    }));

    context.interrogations = data.interrogations;

    return context;
  }

  static #formToData(form) {
    const expanded = foundry.utils.expandObject(
      new foundry.applications.ux.FormDataExtended(form).object
    );
    return {
      act: expanded.act ?? 1,
      scene: expanded.scene ?? 1,
      turnOrder: expanded.turnOrder ?? "",
      interludes: Object.values(expanded.interludes ?? {}),
      arrestPhaseTriggered: expanded.arrestPhaseTriggered ?? false,
      arrestPhaseNotes: expanded.arrestPhaseNotes ?? "",
      epilogueNotes: expanded.epilogueNotes ?? "",
      evidence: Object.values(expanded.evidence ?? {}),
      interrogations: Object.values(expanded.interrogations ?? {})
    };
  }

  static async #onSubmit(event, form) {
    await setCaseTracker(CaseTrackerApplication.#formToData(form));
  }

  static async #onAddEvidence() {
    const data = CaseTrackerApplication.#formToData(this.form);
    data.evidence.push({ id: foundry.utils.randomID(), description: "", status: "unknown", notes: "" });
    try {
      await setCaseTracker(data);
    } catch (err) {
      console.error("PROCEDURAL | Failed to add evidence to the Case Tracker", err);
      ui.notifications?.error("PROCEDURAL! failed to add evidence. Check the console for details.");
      return;
    }
    this.render();
  }

  static async #onDeleteEvidence(event, target) {
    const id = target.closest("[data-evidence-id]").dataset.evidenceId;
    const data = CaseTrackerApplication.#formToData(this.form);
    data.evidence = data.evidence.filter(entry => entry.id !== id);
    try {
      await setCaseTracker(data);
    } catch (err) {
      console.error("PROCEDURAL | Failed to delete evidence from the Case Tracker", err);
      ui.notifications?.error("PROCEDURAL! failed to delete evidence. Check the console for details.");
      return;
    }
    this.render();
  }

  static async #onStartInterrogation() {
    const data = CaseTrackerApplication.#formToData(this.form);
    const { rawTotal } = resolveDice("normal", Math.random);
    data.interrogations.push({
      id: foundry.utils.randomID(),
      suspect: "",
      questionsRemaining: rawTotal,
      notes: ""
    });
    try {
      await setCaseTracker(data);
    } catch (err) {
      console.error("PROCEDURAL | Failed to start an interrogation in the Case Tracker", err);
      ui.notifications?.error("PROCEDURAL! failed to start the interrogation. Check the console for details.");
      return;
    }
    this.render();
  }

  static async #onDecrementInterrogation(event, target) {
    const id = target.closest("[data-interrogation-id]").dataset.interrogationId;
    const data = CaseTrackerApplication.#formToData(this.form);
    const entry = data.interrogations.find(item => item.id === id);
    entry.questionsRemaining = Math.max(0, entry.questionsRemaining - 1);
    try {
      await setCaseTracker(data);
    } catch (err) {
      console.error("PROCEDURAL | Failed to decrement an interrogation in the Case Tracker", err);
      ui.notifications?.error("PROCEDURAL! failed to update the interrogation. Check the console for details.");
      return;
    }
    this.render();
  }

  static async #onDeleteInterrogation(event, target) {
    const id = target.closest("[data-interrogation-id]").dataset.interrogationId;
    const data = CaseTrackerApplication.#formToData(this.form);
    data.interrogations = data.interrogations.filter(entry => entry.id !== id);
    try {
      await setCaseTracker(data);
    } catch (err) {
      console.error("PROCEDURAL | Failed to delete an interrogation from the Case Tracker", err);
      ui.notifications?.error("PROCEDURAL! failed to delete the interrogation. Check the console for details.");
      return;
    }
    this.render();
  }
}
