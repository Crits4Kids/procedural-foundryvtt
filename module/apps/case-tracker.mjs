import { resolveDice, rollD6 } from "../helpers/dice-rules.mjs";
import { findTalentsToReset } from "../helpers/talent-reset.mjs";
import { findActorsToHeal } from "../helpers/hurt-reset.mjs";
import { loadGeneratorData } from "../helpers/generator-data.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ApplicationV2 } = foundry.applications.api;

const EVIDENCE_STATUSES = ["good", "bad", "unknown"];

function getCaseTracker() {
  return game.settings.get("procedural", "caseTracker");
}

async function setCaseTracker(data) {
  const previousAct = getCaseTracker().act;
  await game.settings.set("procedural", "caseTracker", data);
  if (data.act !== previousAct) {
    await resetTalentUses(data.act);
    await healActors(data.act);
  }
}

async function resetTalentUses(act) {
  const actors = game.actors.map(actor => ({
    id: actor.id,
    items: actor.items.map(item => ({
      id: item.id,
      type: item.type,
      system: { used: item.system?.used }
    }))
  }));
  const updates = findTalentsToReset(actors);
  if (!updates.length) return;

  const updatesByActor = new Map();
  for (const { actorId, itemId } of updates) {
    if (!updatesByActor.has(actorId)) updatesByActor.set(actorId, []);
    updatesByActor.get(actorId).push({ _id: itemId, "system.used": false });
  }

  try {
    for (const [actorId, itemUpdates] of updatesByActor) {
      await game.actors.get(actorId).updateEmbeddedDocuments("Item", itemUpdates);
    }
  } catch (err) {
    console.error("PROCEDURAL | Failed to reset Talents for the new act", err);
    ui.notifications?.error("PROCEDURAL! failed to reset Talents. Check the console for details.");
    return;
  }

  const count = updates.length;
  ui.notifications?.info(`PROCEDURAL! reset ${count} Talent${count === 1 ? "" : "s"} for Act ${act}.`);
}

async function healActors(act) {
  const actors = game.actors.map(actor => ({
    id: actor.id,
    system: { hurt: actor.system?.hurt, knockedOut: actor.system?.knockedOut }
  }));
  const ids = findActorsToHeal(actors);
  if (!ids.length) return;

  try {
    for (const id of ids) {
      await game.actors.get(id).update({ "system.hurt": false, "system.knockedOut": false });
    }
  } catch (err) {
    console.error("PROCEDURAL | Failed to heal actors for the new act", err);
    ui.notifications?.error("PROCEDURAL! failed to heal actors. Check the console for details.");
    return;
  }

  const count = ids.length;
  ui.notifications?.info(`PROCEDURAL! healed ${count} actor${count === 1 ? "" : "s"} for Act ${act}.`);
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
      deleteInterrogation: CaseTrackerApplication.#onDeleteInterrogation,
      rollForDrama: CaseTrackerApplication.#onRollForDrama
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
    context.drama = data.drama;

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
      drama: expanded.drama ?? "",
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

  static async #onRollForDrama() {
    const generatorData = await loadGeneratorData();
    const tableRoll = rollD6();
    const entryRoll = rollD6();
    const table = tableRoll % 2 === 1 ? generatorData.drama.odds : generatorData.drama.evens;
    const text = table[entryRoll - 1];

    const data = CaseTrackerApplication.#formToData(this.form);
    data.drama = text;
    try {
      await setCaseTracker(data);
    } catch (err) {
      console.error("PROCEDURAL | Failed to save the Roll for Drama result", err);
      ui.notifications?.error("PROCEDURAL! failed to save the Drama roll. Check the console for details.");
      return;
    }

    await ChatMessage.create({
      content: `<p><strong>${game.i18n.localize("PROCEDURAL.CaseTracker.RollForDrama")}</strong> (${tableRoll}, ${entryRoll}): ${text}</p>`
    });
    this.render();
  }

  static async #onDecrementInterrogation(event, target) {
    const id = target.closest("[data-interrogation-id]").dataset.interrogationId;
    const data = CaseTrackerApplication.#formToData(this.form);
    const entry = data.interrogations.find(item => item.id === id);
    if (!entry) return;
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
