import { resolveDice, rollD6 } from "../helpers/dice-rules.mjs";
import { findTalentsToReset } from "../helpers/talent-reset.mjs";
import { findActorsToHeal } from "../helpers/hurt-reset.mjs";
import { loadGeneratorData } from "../helpers/generator-data.mjs";
import { isValidPool, canAffordPledges } from "../helpers/lead-pool.mjs";
import { tallyEvidence } from "../helpers/evidence-tally.mjs";

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
      rollForDrama: CaseTrackerApplication.#onRollForDrama,
      poolRerunPoints: CaseTrackerApplication.#onPoolRerunPoints,
      rollEpilogueTiebreak: CaseTrackerApplication.#onRollEpilogueTiebreak
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
    context.culpritEscaped = data.culpritEscaped;
    context.arrestPhaseNotes = data.arrestPhaseNotes;
    context.epilogueNotes = data.epilogueNotes;
    context.drama = data.drama;
    context.leadsPooled = data.leadsPooled;
    context.leadPooledThisAct = data.leadsPooled[data.act - 1] ?? false;
    context.evidenceTally = tallyEvidence(data.evidence, { culpritEscaped: data.culpritEscaped });
    context.epilogueTiebreakRoll = data.epilogueTiebreakRoll;
    context.epilogueTiebreakOutcome = data.epilogueTiebreakOutcome;
    context.epilogueTiebreakOutcomeLabel = data.epilogueTiebreakOutcome
      ? game.i18n.localize(`PROCEDURAL.CaseTracker.EpilogueTiebreak.${data.epilogueTiebreakOutcome}`)
      : "";

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

  _onRender(context, options) {
    super._onRender(context, options);
    const culpritEscapedInput = this.element.querySelector('[name="culpritEscaped"]');
    culpritEscapedInput?.addEventListener("change", CaseTrackerApplication.#onCulpritEscapedChange.bind(this));
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
      culpritEscaped: !!expanded.culpritEscaped,
      arrestPhaseNotes: expanded.arrestPhaseNotes ?? "",
      epilogueNotes: expanded.epilogueNotes ?? "",
      drama: expanded.drama ?? "",
      leadsPooled: Object.values(expanded.leadsPooled ?? {}),
      epilogueTiebreakRoll: Number(expanded.epilogueTiebreakRoll) || 0,
      epilogueTiebreakOutcome: expanded.epilogueTiebreakOutcome ?? "",
      evidence: Object.values(expanded.evidence ?? {}),
      interrogations: Object.values(expanded.interrogations ?? {})
    };
  }

  static async #onSubmit(event, form) {
    await setCaseTracker(CaseTrackerApplication.#formToData(form));
  }

  static async #onCulpritEscapedChange() {
    const data = CaseTrackerApplication.#formToData(this.form);
    try {
      await setCaseTracker(data);
    } catch (err) {
      console.error("PROCEDURAL | Failed to save the culprit-escaped flag", err);
      ui.notifications?.error("PROCEDURAL! failed to save. Check the console for details.");
      return;
    }
    this.render();
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

  static async #onPoolRerunPoints() {
    const data = CaseTrackerApplication.#formToData(this.form);
    const actIndex = data.act - 1;
    if (data.leadsPooled[actIndex]) {
      ui.notifications?.warn(game.i18n.localize("PROCEDURAL.CaseTracker.PoolRerunPointsUsed"));
      return;
    }

    const tropeActors = game.actors.filter(actor => actor.type === "trope");
    const cost = tropeActors.length;
    if (cost === 0) {
      ui.notifications?.warn(game.i18n.localize("PROCEDURAL.CaseTracker.PoolRerunPointsNoPlayers"));
      return;
    }

    const content = `
      <p>${game.i18n.format("PROCEDURAL.CaseTracker.PoolRerunPointsPrompt", { cost })}</p>
      <ul class="procedural-case-tracker-pool-list">
        ${tropeActors.map(actor => `
          <li>
            <label>${actor.name} (${actor.system.rerunPoints})
              <input type="number" name="contribution-${actor.id}" value="0" min="0" max="${actor.system.rerunPoints}" step="1">
            </label>
          </li>
        `).join("")}
      </ul>
    `;

    const contributions = await foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.localize("PROCEDURAL.CaseTracker.PoolRerunPoints") },
      content,
      buttons: [
        {
          action: "confirm",
          label: game.i18n.localize("PROCEDURAL.CaseTracker.PoolRerunPointsConfirm"),
          default: true,
          callback: (event, button) => Object.fromEntries(
            tropeActors.map(actor => [actor.id, Number(button.form.elements[`contribution-${actor.id}`].value) || 0])
          )
        },
        { action: "cancel", label: game.i18n.localize("PROCEDURAL.Roll.Cancel"), callback: () => null }
      ],
      rejectClose: false
    });
    if (!contributions) return;

    // Re-snapshot the form: the pledge dialog is non-modal, so the GM may have
    // edited (and auto-submitted) other Case Tracker fields while it was open.
    // Everything from here on must use this fresh snapshot, not the stale
    // pre-dialog `data`/`actIndex`, or we'd silently revert those edits.
    const freshData = CaseTrackerApplication.#formToData(this.form);
    const freshActIndex = freshData.act - 1;
    if (freshData.leadsPooled[freshActIndex]) {
      ui.notifications?.warn(game.i18n.localize("PROCEDURAL.CaseTracker.PoolRerunPointsUsed"));
      return;
    }

    const available = Object.fromEntries(tropeActors.map(actor => [actor.id, actor.system.rerunPoints]));
    if (!canAffordPledges(contributions, available)) {
      ui.notifications?.error(game.i18n.localize("PROCEDURAL.CaseTracker.PoolRerunPointsOverPledged"));
      return;
    }

    if (!isValidPool(contributions, cost)) {
      ui.notifications?.error(game.i18n.format("PROCEDURAL.CaseTracker.PoolRerunPointsInvalid", { cost }));
      return;
    }

    try {
      const updates = Object.entries(contributions)
        .filter(([, amount]) => amount > 0)
        .map(([actorId, amount]) => ({
          _id: actorId,
          "system.rerunPoints": game.actors.get(actorId).system.rerunPoints - amount
        }));
      if (updates.length) await Actor.updateDocuments(updates);
      freshData.leadsPooled[freshActIndex] = true;
      await setCaseTracker(freshData);
    } catch (err) {
      console.error("PROCEDURAL | Failed to pool Rerun Points for a new lead", err);
      ui.notifications?.error("PROCEDURAL! failed to pool Rerun Points. Check the console for details.");
      return;
    }

    await ChatMessage.create({
      content: `<p>${game.i18n.format("PROCEDURAL.CaseTracker.PoolRerunPointsAnnounce", { cost })}</p>`
    });
    this.render();
  }

  static async #onRollEpilogueTiebreak() {
    const data = CaseTrackerApplication.#formToData(this.form);
    const { tied } = tallyEvidence(data.evidence, { culpritEscaped: data.culpritEscaped });
    if (!tied) return;

    const roll = rollD6();
    const outcome = roll % 2 === 1 ? "against" : "for";

    data.epilogueTiebreakRoll = roll;
    data.epilogueTiebreakOutcome = outcome;
    try {
      await setCaseTracker(data);
    } catch (err) {
      console.error("PROCEDURAL | Failed to save the Epilogue tie-break roll", err);
      ui.notifications?.error("PROCEDURAL! failed to save the tie-break roll. Check the console for details.");
      return;
    }

    const outcomeLabel = game.i18n.localize(`PROCEDURAL.CaseTracker.EpilogueTiebreak.${outcome}`);
    await ChatMessage.create({
      content: `<p><strong>${game.i18n.localize("PROCEDURAL.CaseTracker.EpilogueTiebreak.Title")}</strong> (${roll}): ${outcomeLabel}</p>`
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
