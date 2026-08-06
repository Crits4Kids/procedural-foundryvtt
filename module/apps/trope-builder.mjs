const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ApplicationV2 } = foundry.applications.api;

import { loadGeneratorData } from "../helpers/generator-data.mjs";
import { rollTrope, validateSkillAllocation, rollQualityOrQuirk, rollBStoryOrHq, rollAgencyName } from "../helpers/character-generator.mjs";

const STEP_IDS = [
  "name", "trope", "skills", "quality", "quirk", "bstory",
  "secondTalent", "hq", "agencyName", "review"
];

const STAT_KEYS = ["mental", "physical", "social"];

const STAT_SKILLS = {
  mental: ["tech", "lab", "investigation"],
  physical: ["violence", "reflexes", "coordination"],
  social: ["cool", "intuition", "deception"]
};

const EMPTY_SKILLS = {
  tech: 0, lab: 0, investigation: 0,
  violence: 0, reflexes: 0, coordination: 0,
  cool: 0, intuition: 0, deception: 0
};

const TEXT_STEP_DRAFT_KEYS = {
  name: "name",
  quality: "quality",
  quirk: "quirk",
  bstory: "bStory",
  hq: "hq",
  agencyName: "agencyName"
};

const ROLL_CHOOSE_CREATE_CONFIG = {
  quality: { dataKey: "qualities", labelKey: "PROCEDURAL.Actor.Qualities", draftKey: "quality", rollFn: rollQualityOrQuirk },
  quirk: { dataKey: "quirks", labelKey: "PROCEDURAL.Actor.Quirks", draftKey: "quirk", rollFn: rollQualityOrQuirk },
  bstory: { dataKey: "bstories", labelKey: "PROCEDURAL.Actor.BStory", draftKey: "bStory", rollFn: rollBStoryOrHq },
  hq: { dataKey: "hq", labelKey: "PROCEDURAL.Actor.HQ", draftKey: "hq", rollFn: rollBStoryOrHq }
};

export default class TropeBuilderApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "procedural-trope-builder",
    classes: ["procedural", "trope-builder"],
    position: { width: 560, height: 680 },
    window: { title: "PROCEDURAL.TropeBuilder.Title", resizable: true },
    actions: {
      goNext: TropeBuilderApplication.#onNext,
      goBack: TropeBuilderApplication.#onBack,
      goToStep: TropeBuilderApplication.#onGoToStep,
      rollTrope: TropeBuilderApplication.#onRollTrope,
      rollTable: TropeBuilderApplication.#onRollTable,
      rollAgencyName: TropeBuilderApplication.#onRollAgencyName,
      finish: TropeBuilderApplication.#onFinish
    }
  };

  static PARTS = {
    form: {
      template: "systems/procedural/templates/apps/trope-builder.hbs",
      templates: [
        "systems/procedural/templates/apps/trope-builder-steps/name.hbs",
        "systems/procedural/templates/apps/trope-builder-steps/trope.hbs",
        "systems/procedural/templates/apps/trope-builder-steps/skills.hbs",
        "systems/procedural/templates/apps/trope-builder-steps/roll-choose-create.hbs",
        "systems/procedural/templates/apps/trope-builder-steps/second-talent.hbs",
        "systems/procedural/templates/apps/trope-builder-steps/agency-name.hbs",
        "systems/procedural/templates/apps/trope-builder-steps/review.hbs"
      ]
    }
  };

  #stepIndex = 0;
  #data = null;
  #draft = {
    name: "",
    trope: null,
    giftedStat: null,
    stats: null,
    skills: { ...EMPTY_SKILLS },
    quality: "",
    quirk: "",
    bStory: "",
    secondTalent: null,
    hq: "",
    agencyName: ""
  };

  get #stepId() {
    return STEP_IDS[this.#stepIndex];
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    this.#data ??= await loadGeneratorData();

    const stepId = this.#stepId;
    context.stepId = stepId;
    context.stepNumber = this.#stepIndex + 1;
    context.stepCount = STEP_IDS.length;
    context.isFirstStep = this.#stepIndex === 0;
    context.draft = this.#draft;
    context.canAdvance = this.#isStepValid(stepId);
    context.show = {
      name: stepId === "name",
      trope: stepId === "trope",
      skills: stepId === "skills",
      rollChooseCreate: stepId in ROLL_CHOOSE_CREATE_CONFIG,
      secondTalent: stepId === "secondTalent",
      agencyName: stepId === "agencyName",
      review: stepId === "review"
    };

    if (stepId === "trope") {
      context.tropeOptions = this.#data.tropes.map(t => ({
        name: t.name,
        selected: t.name === (this.#draft.trope?.name ?? "")
      }));
      context.statKeys = STAT_KEYS;
      context.isGifted = this.#isGiftedTrope();
      context.giftedStatChecked = {
        mental: this.#draft.giftedStat === "mental",
        physical: this.#draft.giftedStat === "physical",
        social: this.#draft.giftedStat === "social"
      };
      context.finalStats = this.#draft.stats;
    }

    if (stepId === "skills") {
      context.statKeys = STAT_KEYS;
      context.statSkills = STAT_SKILLS;
      context.validation = this.#draft.trope
        ? validateSkillAllocation(this.#draft.stats, this.#draft.trope.system.statNotes, this.#draft.skills)
        : { remaining: { mental: 0, physical: 0, social: 0 }, violations: [] };
    }

    if (stepId in ROLL_CHOOSE_CREATE_CONFIG) {
      const config = ROLL_CHOOSE_CREATE_CONFIG[stepId];
      const table = this.#data[config.dataKey];
      context.rollChooseCreate = {
        label: game.i18n.localize(config.labelKey),
        options: [...table.odds, ...table.evens],
        value: this.#draft[config.draftKey]
      };
    }

    if (stepId === "secondTalent") {
      context.secondTalentOptions = this.#data.secondTalents.map(t => ({
        name: t.name,
        selected: t.name === (this.#draft.secondTalent?.name ?? "")
      }));
    }

    if (stepId === "agencyName") {
      context.table1 = this.#data.agencyNames.table1;
      context.table2 = this.#data.agencyNames.table2;
      context.table3 = this.#data.agencyNames.table3;
    }

    if (stepId === "review") {
      context.finalStats = this.#draft.stats;
    }

    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const stepId = this.#stepId;

    const textInput = this.element.querySelector('[name="stepValue"]');
    if (textInput) {
      textInput.addEventListener("input", () => {
        this.#draft[TEXT_STEP_DRAFT_KEYS[stepId]] = textInput.value;
        this.#refreshNextEnabled();
      });
    }

    const fillSelect = this.element.querySelector('[data-fills-value]');
    if (fillSelect && textInput) {
      fillSelect.addEventListener("change", () => {
        if (!fillSelect.value) return;
        textInput.value = fillSelect.value;
        textInput.dispatchEvent(new Event("input"));
      });
    }

    if (stepId === "trope") {
      const tropeSelect = this.element.querySelector('[data-role="trope-select"]');
      tropeSelect?.addEventListener("change", () => {
        const trope = this.#data.tropes.find(t => t.name === tropeSelect.value);
        if (trope) this.#setTrope(trope);
      });

      this.element.querySelectorAll('[data-role="gifted-stat"]').forEach(radio => {
        radio.addEventListener("change", () => {
          if (radio.checked) this.#setGiftedStat(radio.value);
        });
      });
    }

    if (stepId === "skills") {
      this.element.querySelectorAll(".procedural-builder-skill-input").forEach(input => {
        input.addEventListener("input", () => this.#onSkillInput());
      });
    }

    if (stepId === "secondTalent") {
      const talentSelect = this.element.querySelector('[data-role="talent-select"]');
      talentSelect?.addEventListener("change", () => {
        const talent = this.#data.secondTalents.find(t => t.name === talentSelect.value);
        this.#draft.secondTalent = talent ?? null;
        this.#refreshNextEnabled();
      });
    }

    if (stepId === "agencyName") {
      this.element.querySelectorAll('[data-role="agency-word-select"]').forEach((select, index) => {
        select.addEventListener("change", () => {
          if (!select.value || !textInput) return;
          const words = textInput.value.split(" ");
          words[index] = select.value;
          textInput.value = words.join(" ").trim();
          textInput.dispatchEvent(new Event("input"));
        });
      });
    }
  }

  #refreshNextEnabled(forcedValue) {
    const enabled = forcedValue ?? this.#isStepValid(this.#stepId);
    const nextBtn = this.element.querySelector('[data-action="goNext"], [data-action="finish"]');
    if (nextBtn) nextBtn.disabled = !enabled;
  }

  #onSkillInput() {
    const skills = { ...EMPTY_SKILLS };
    this.element.querySelectorAll(".procedural-builder-skill-input").forEach(input => {
      skills[input.dataset.skill] = Number(input.value) || 0;
    });
    this.#draft.skills = skills;

    const validation = validateSkillAllocation(this.#draft.stats, this.#draft.trope.system.statNotes, skills);
    for (const stat of STAT_KEYS) {
      const el = this.element.querySelector(`[data-remaining-for="${stat}"]`);
      if (el) el.textContent = validation.remaining[stat];
    }
    const violationsEl = this.element.querySelector(".procedural-builder-violations");
    if (violationsEl) {
      violationsEl.innerHTML = validation.violations.map(v => `<li>${v}</li>`).join("");
    }

    this.#refreshNextEnabled(validation.valid);
  }

  #isGiftedTrope() {
    return this.#draft.trope?.system.talentName === "Gifted";
  }

  #setTrope(tropeEntry) {
    this.#draft.trope = tropeEntry;
    this.#draft.giftedStat = null;
    this.#draft.stats = { ...tropeEntry.system.statBlock };
    this.#draft.skills = { ...EMPTY_SKILLS };
    this.render();
  }

  #setGiftedStat(statKey) {
    if (!this.#isGiftedTrope() || !this.#draft.trope) return;
    this.#draft.giftedStat = statKey;
    const base = this.#draft.trope.system.statBlock;
    this.#draft.stats = { ...base, [statKey]: base[statKey] + 3 };
    this.#draft.skills = { ...EMPTY_SKILLS };
    this.render();
  }

  #isStepValid(stepId) {
    switch (stepId) {
      case "name": return this.#draft.name.trim().length > 0;
      case "trope": return this.#draft.trope !== null && (!this.#isGiftedTrope() || this.#draft.giftedStat !== null);
      case "skills":
        return !!this.#draft.trope && validateSkillAllocation(this.#draft.stats, this.#draft.trope.system.statNotes, this.#draft.skills).valid;
      case "quality": return this.#draft.quality.trim().length > 0;
      case "quirk": return this.#draft.quirk.trim().length > 0;
      case "bstory": return this.#draft.bStory.trim().length > 0;
      case "secondTalent": return this.#draft.secondTalent !== null;
      case "hq": return this.#draft.hq.trim().length > 0;
      case "agencyName": return this.#draft.agencyName.trim().length > 0;
      case "review": return true;
      default: return false;
    }
  }

  static #onNext() {
    if (!this.#isStepValid(this.#stepId)) return;
    this.#stepIndex = Math.min(this.#stepIndex + 1, STEP_IDS.length - 1);
    this.render();
  }

  static #onBack() {
    this.#stepIndex = Math.max(this.#stepIndex - 1, 0);
    this.render();
  }

  static #onGoToStep(event, target) {
    const index = STEP_IDS.indexOf(target.dataset.step);
    if (index >= 0) {
      this.#stepIndex = index;
      this.render();
    }
  }

  static #onRollTrope() {
    const trope = rollTrope(this.#data.tropes, Math.random);
    this.#setTrope(trope);
  }

  static #onRollTable() {
    const config = ROLL_CHOOSE_CREATE_CONFIG[this.#stepId];
    if (!config) return;
    const value = config.rollFn(this.#data[config.dataKey], Math.random);
    this.#draft[config.draftKey] = value;
    this.render();
  }

  static #onRollAgencyName() {
    this.#draft.agencyName = rollAgencyName(this.#data.agencyNames, Math.random);
    this.render();
  }

  static async #onFinish() {
    if (!this.#isStepValid("review")) return;
    const draft = this.#draft;

    const actor = await Actor.create({ name: draft.name, type: "trope" });

    await actor.update({
      "system.stats": draft.stats,
      "system.skills.tech.value": draft.skills.tech,
      "system.skills.lab.value": draft.skills.lab,
      "system.skills.investigation.value": draft.skills.investigation,
      "system.skills.violence.value": draft.skills.violence,
      "system.skills.reflexes.value": draft.skills.reflexes,
      "system.skills.coordination.value": draft.skills.coordination,
      "system.skills.cool.value": draft.skills.cool,
      "system.skills.intuition.value": draft.skills.intuition,
      "system.skills.deception.value": draft.skills.deception,
      "system.qualities": draft.quality,
      "system.quirks": draft.quirk,
      "system.bStory": draft.bStory,
      "system.hq": draft.hq,
      "system.agencyName": draft.agencyName,
      "system.rerunPoints": 1
    });

    await Item.createDocuments([
      { name: draft.trope.name, type: "trope", img: draft.trope.img, system: { ...draft.trope.system, statBlock: draft.stats } },
      { name: draft.secondTalent.name, type: "talent", img: draft.secondTalent.img, system: { ...draft.secondTalent.system } }
    ], { parent: actor });

    await this.close();
    actor.sheet.render(true);
  }
}
