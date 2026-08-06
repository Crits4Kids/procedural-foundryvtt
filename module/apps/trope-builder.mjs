const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ApplicationV2 } = foundry.applications.api;

import { loadGeneratorData } from "../helpers/generator-data.mjs";
import { rollTrope, validateSkillAllocation } from "../helpers/character-generator.mjs";

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
      rollTrope: TropeBuilderApplication.#onRollTrope
    }
  };

  static PARTS = {
    form: {
      template: "systems/procedural/templates/apps/trope-builder.hbs",
      templates: [
        "systems/procedural/templates/apps/trope-builder-steps/name.hbs",
        "systems/procedural/templates/apps/trope-builder-steps/trope.hbs",
        "systems/procedural/templates/apps/trope-builder-steps/skills.hbs"
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
      rollChooseCreate: false, // Task 5 replaces this with a real check
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
}
