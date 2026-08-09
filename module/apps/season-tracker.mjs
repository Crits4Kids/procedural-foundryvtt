import { computeRating, countRecordedEpisodes } from "../helpers/season-benchmarks.mjs";
import { rollD6 } from "../helpers/dice-rules.mjs";
import { loadGeneratorData } from "../helpers/generator-data.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ApplicationV2 } = foundry.applications.api;

const OUTCOME_CHOICES = ["", "successful", "neutral", "unsuccessful"];

function getSeasonTracker() {
  return game.settings.get("procedural", "seasonTracker");
}

async function setSeasonTracker(data) {
  await game.settings.set("procedural", "seasonTracker", data);
}

const grantsInFlight = new Set();

async function grantRerunPoints(flagKey) {
  if (grantsInFlight.has(flagKey)) return null;
  grantsInFlight.add(flagKey);
  try {
    const data = getSeasonTracker().toObject();
    if (data[flagKey]) return null;

    const actors = game.actors.filter(a => a.type === "trope");
    try {
      for (const actor of actors) {
        await actor.update({ "system.rerunPoints": actor.system.rerunPoints + 1 });
      }
    } catch (err) {
      console.error("PROCEDURAL | Failed to grant Rerun Points", err);
      ui.notifications?.error("PROCEDURAL! failed to grant Rerun Points. Check the console for details.");
      return null;
    }

    data[flagKey] = true;
    await setSeasonTracker(data);
    return actors.length;
  } finally {
    grantsInFlight.delete(flagKey);
  }
}

async function grantLevelUps(flagKey) {
  if (grantsInFlight.has(flagKey)) return null;
  grantsInFlight.add(flagKey);
  try {
    const data = getSeasonTracker().toObject();
    if (data[flagKey]) return null;

    const actors = game.actors.filter(a => a.type === "trope");
    try {
      for (const actor of actors) {
        await actor.update({ "system.levelUpsAvailable": actor.system.levelUpsAvailable + 1 });
      }
    } catch (err) {
      console.error("PROCEDURAL | Failed to grant Level Ups", err);
      ui.notifications?.error("PROCEDURAL! failed to grant Level Ups. Check the console for details.");
      return null;
    }

    data[flagKey] = true;
    await setSeasonTracker(data);
    return actors.length;
  } finally {
    grantsInFlight.delete(flagKey);
  }
}

export default class SeasonTrackerApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "procedural-season-tracker",
    classes: ["procedural", "season-tracker"],
    position: { width: 480, height: 640 },
    window: {
      title: "PROCEDURAL.SeasonTracker.Title",
      resizable: true,
      contentTag: "form"
    },
    form: {
      handler: SeasonTrackerApplication.#onSubmit,
      submitOnChange: true,
      closeOnSubmit: false
    },
    actions: {
      grantEp3Rerun: SeasonTrackerApplication.#onGrantEp3Rerun,
      grantEp5Rerun: SeasonTrackerApplication.#onGrantEp5Rerun,
      grantEp3LevelUp: SeasonTrackerApplication.#onGrantEp3LevelUp,
      grantEp6LevelUp: SeasonTrackerApplication.#onGrantEp6LevelUp,
      rollDirector: SeasonTrackerApplication.#onRollDirector,
      addVillain: SeasonTrackerApplication.#onAddVillain,
      deleteVillain: SeasonTrackerApplication.#onDeleteVillain
    }
  };

  static PARTS = {
    form: { template: "systems/procedural/templates/apps/season-tracker.hbs", scrollable: [""] }
  };

  async _prepareContext(options) {
    if (!game.user.isGM) throw new Error("The Season Tracker is GM-only.");
    const context = await super._prepareContext(options);
    const data = getSeasonTracker().toObject();

    context.episodes = data.episodes.map((episode, index) => ({
      index,
      number: index + 1,
      outcome: episode.outcome,
      outcomeOptions: OUTCOME_CHOICES.map(value => ({
        value,
        label: value
          ? game.i18n.localize(`PROCEDURAL.SeasonTracker.Outcome.${value}`)
          : game.i18n.localize("PROCEDURAL.SeasonTracker.OutcomeUnset"),
        selected: value === episode.outcome
      })),
      recorded: episode.outcome !== "",
      reactionKey: `PROCEDURAL.SeasonTracker.Ep${index + 1}Reaction`
    }));
    context.rating = computeRating(data.episodes);
    context.recordedCount = countRecordedEpisodes(data.episodes);

    const ep3Rating = computeRating(data.episodes.slice(0, 3));
    const ep5Rating = computeRating(data.episodes.slice(0, 5));
    context.ep3RerunEligible = data.episodes[2].outcome !== "" && ep3Rating === 6 && !data.ep3RerunGranted;
    context.ep3LevelUpEligible = data.episodes[2].outcome !== "" && ep3Rating <= 0 && !data.ep3LevelUpGranted;
    context.ep5RerunEligible = data.episodes[4].outcome !== "" && ep5Rating === 10 && !data.ep5RerunGranted;
    context.ep6LevelUpEligible = data.episodes[5].outcome !== "" && !data.ep6LevelUpGranted;

    context.director = data.director;
    context.villains = data.villains;
    context.villainWarning = data.villains.filter(v => v.active).length >= 3;

    return context;
  }

  static #formToData(form) {
    const expanded = foundry.utils.expandObject(
      new foundry.applications.ux.FormDataExtended(form).object
    );
    const current = getSeasonTracker();
    return {
      episodes: Object.values(expanded.episodes ?? {}).map(ep => ({ outcome: ep.outcome ?? "" })),
      // The four guard booleans are never form inputs (a BooleanField has no
      // safe hidden-input round-trip) — always carry the persisted value
      // forward so an unrelated form submit can't reset a grant flag.
      ep3RerunGranted: current.ep3RerunGranted,
      ep5RerunGranted: current.ep5RerunGranted,
      ep3LevelUpGranted: current.ep3LevelUpGranted,
      ep6LevelUpGranted: current.ep6LevelUpGranted,
      director: expanded.director ?? "",
      villains: Object.values(expanded.villains ?? {}).map(v => ({
        id: v.id,
        name: v.name ?? "",
        reason: v.reason ?? "",
        active: v.active ?? false
      }))
    };
  }

  static async #onSubmit(event, form) {
    await setSeasonTracker(SeasonTrackerApplication.#formToData(form));
    this.render();
  }

  static async #onGrantEp3Rerun() {
    const count = await grantRerunPoints("ep3RerunGranted");
    if (count === null) return;
    ui.notifications?.info(`PROCEDURAL! granted 1 Rerun Point to ${count} Trope${count === 1 ? "" : "s"}.`);
    this.render();
  }

  static async #onGrantEp5Rerun() {
    const count = await grantRerunPoints("ep5RerunGranted");
    if (count === null) return;
    ui.notifications?.info(`PROCEDURAL! granted 1 Rerun Point to ${count} Trope${count === 1 ? "" : "s"}.`);
    this.render();
  }

  static async #onGrantEp3LevelUp() {
    const count = await grantLevelUps("ep3LevelUpGranted");
    if (count === null) return;
    ui.notifications?.info(`PROCEDURAL! granted a Level Up to ${count} Trope${count === 1 ? "" : "s"}.`);
    this.render();
  }

  static async #onGrantEp6LevelUp() {
    const count = await grantLevelUps("ep6LevelUpGranted");
    if (count === null) return;
    ui.notifications?.info(`PROCEDURAL! granted a Level Up to ${count} Trope${count === 1 ? "" : "s"}.`);
    this.render();
  }

  static async #onRollDirector() {
    const generatorData = await loadGeneratorData();
    const roll = rollD6();
    const text = generatorData.directors[Math.ceil(roll / 2) - 1];

    const data = SeasonTrackerApplication.#formToData(this.form);
    data.director = text;
    try {
      await setSeasonTracker(data);
    } catch (err) {
      console.error("PROCEDURAL | Failed to save the Director roll result", err);
      ui.notifications?.error("PROCEDURAL! failed to save the Director roll. Check the console for details.");
      return;
    }
    this.render();
  }

  static async #onAddVillain() {
    const data = SeasonTrackerApplication.#formToData(this.form);
    data.villains.push({ id: foundry.utils.randomID(), name: "", reason: "", active: true });
    try {
      await setSeasonTracker(data);
    } catch (err) {
      console.error("PROCEDURAL | Failed to add a Villain to the Season Tracker", err);
      ui.notifications?.error("PROCEDURAL! failed to add the Villain. Check the console for details.");
      return;
    }
    this.render();
  }

  static async #onDeleteVillain(event, target) {
    const id = target.closest("[data-villain-id]").dataset.villainId;
    const data = SeasonTrackerApplication.#formToData(this.form);
    data.villains = data.villains.filter(entry => entry.id !== id);
    try {
      await setSeasonTracker(data);
    } catch (err) {
      console.error("PROCEDURAL | Failed to delete a Villain from the Season Tracker", err);
      ui.notifications?.error("PROCEDURAL! failed to delete the Villain. Check the console for details.");
      return;
    }
    this.render();
  }
}
