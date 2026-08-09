import { computeRating, countRecordedEpisodes } from "../helpers/season-benchmarks.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ApplicationV2 } = foundry.applications.api;

const OUTCOME_CHOICES = ["", "successful", "neutral", "unsuccessful"];

function getSeasonTracker() {
  return game.settings.get("procedural", "seasonTracker");
}

async function setSeasonTracker(data) {
  await game.settings.set("procedural", "seasonTracker", data);
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
    actions: {}
  };

  static PARTS = {
    form: { template: "systems/procedural/templates/apps/season-tracker.hbs" }
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
      villains: []
    };
  }

  static async #onSubmit(event, form) {
    await setSeasonTracker(SeasonTrackerApplication.#formToData(form));
  }
}
