const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ApplicationV2 } = foundry.applications.api;

import { loadGeneratorData } from "../helpers/generator-data.mjs";
import { rollTrope, rollNpcPersonality, parseNpcName } from "../helpers/character-generator.mjs";

const STEP_IDS = ["personality", "trope", "review"];

export default class NpcBuilderApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "procedural-npc-builder",
    classes: ["procedural", "npc-builder"],
    position: { width: 480, height: 520 },
    window: { title: "PROCEDURAL.NpcBuilder.Title", resizable: true },
    actions: {
      goNext: NpcBuilderApplication.#onNext,
      goBack: NpcBuilderApplication.#onBack,
      goToStep: NpcBuilderApplication.#onGoToStep,
      rollTable: NpcBuilderApplication.#onRollTable,
      rollTrope: NpcBuilderApplication.#onRollTrope,
      finish: NpcBuilderApplication.#onFinish
    }
  };

  static PARTS = {
    form: {
      template: "systems/procedural/templates/apps/npc-builder.hbs",
      templates: [
        "systems/procedural/templates/apps/trope-builder-steps/roll-choose-create.hbs",
        "systems/procedural/templates/apps/npc-builder-steps/trope.hbs",
        "systems/procedural/templates/apps/npc-builder-steps/review.hbs"
      ]
    }
  };

  #stepIndex = 0;
  #data = null;
  #draft = {
    personality: "",
    trope: null
  };
  #finishing = false;

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
      personality: stepId === "personality",
      trope: stepId === "trope",
      review: stepId === "review"
    };

    if (stepId === "personality") {
      context.rollChooseCreate = {
        label: game.i18n.localize("PROCEDURAL.Actor.Personality"),
        options: this.#data.npcPersonalities,
        value: this.#draft.personality
      };
    }

    if (stepId === "trope") {
      context.tropeOptions = this.#data.tropes.map(t => ({
        name: t.name,
        selected: t.name === (this.#draft.trope?.name ?? "")
      }));
    }

    if (stepId === "review") {
      context.name = parseNpcName(this.#draft.personality);
    }

    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const stepId = this.#stepId;

    const textInput = this.element.querySelector('[name="stepValue"]');
    if (textInput) {
      textInput.addEventListener("input", () => {
        this.#draft.personality = textInput.value;
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
        this.#draft.trope = trope ?? null;
        this.render();
      });
    }
  }

  #refreshNextEnabled() {
    const enabled = this.#isStepValid(this.#stepId);
    const nextBtn = this.element.querySelector('[data-action="goNext"], [data-action="finish"]');
    if (nextBtn) nextBtn.disabled = !enabled;
  }

  #isStepValid(stepId) {
    switch (stepId) {
      case "personality": return this.#draft.personality.trim().length > 0;
      case "trope": return this.#draft.trope !== null;
      case "review": return this.#isStepValid("personality") && this.#isStepValid("trope");
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

  static #onRollTable() {
    this.#draft.personality = rollNpcPersonality(this.#data.npcPersonalities, Math.random);
    this.render();
  }

  static #onRollTrope() {
    this.#draft.trope = rollTrope(this.#data.tropes, Math.random);
    this.render();
  }

  static async #onFinish() {
    if (!this.#isStepValid("review")) return;
    if (this.#finishing) return;
    this.#finishing = true;

    try {
      const draft = this.#draft;
      const name = parseNpcName(draft.personality);
      const actor = await Actor.create({ name, type: "npc" });

      await actor.update({ "system.personality": draft.personality });

      await Item.createDocuments([
        {
          name: draft.trope.name,
          type: "trope",
          img: draft.trope.img,
          system: { ...draft.trope.system, talentName: "", talentDescription: "", talentUsesPerAct: null }
        },
        {
          name: draft.trope.system.talentName,
          type: "talent",
          img: draft.trope.img,
          system: {
            description: draft.trope.system.talentDescription,
            usesPerAct: draft.trope.system.talentUsesPerAct
          }
        }
      ], { parent: actor });

      await this.close();
      actor.sheet.render(true);
    } catch (err) {
      console.error("PROCEDURAL | Failed to finish the NPC builder wizard", err);
      ui.notifications?.error("PROCEDURAL! failed to create your NPC. Check the console for details.");
      this.#finishing = false;
    }
  }
}
