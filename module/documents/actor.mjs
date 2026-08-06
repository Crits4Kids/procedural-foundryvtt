import { computeRoll } from "../helpers/dice-rules.mjs";
import { showDiceSoNice } from "../helpers/dice-so-nice.mjs";
import { generateTrope } from "../helpers/character-generator.mjs";

const PHYSICAL_SKILLS = new Set(["violence", "reflexes", "coordination"]);

const TIER_CLASS = {
  criticalFailure: "procedural-tier-critical-failure",
  failure: "procedural-tier-failure",
  soSo: "procedural-tier-so-so",
  success: "procedural-tier-success",
  successEffect: "procedural-tier-success-effect"
};

const GENERATOR_DATA_PATHS = {
  tropes: "systems/procedural/data/tropes.json",
  secondTalents: "systems/procedural/data/second-talents.json",
  qualities: "systems/procedural/data/qualities.json",
  quirks: "systems/procedural/data/quirks.json",
  bstories: "systems/procedural/data/bstories.json",
  hq: "systems/procedural/data/hq.json",
  agencyNames: "systems/procedural/data/agency-names.json"
};

let cachedGeneratorData = null;

async function loadGeneratorData() {
  if (cachedGeneratorData) return cachedGeneratorData;
  try {
    const entries = await Promise.all(
      Object.entries(GENERATOR_DATA_PATHS).map(async ([key, path]) => {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Failed to fetch "${path}" (${response.status} ${response.statusText})`);
        return [key, await response.json()];
      })
    );
    cachedGeneratorData = Object.fromEntries(entries);
    return cachedGeneratorData;
  } catch (err) {
    console.error("PROCEDURAL | Failed to load random Trope generator data", err);
    ui.notifications?.error("PROCEDURAL! failed to load the random Trope generator data. Check the console for details.");
    throw err;
  }
}

export default class ProceduralActor extends Actor {
  async rollSkill(skillKey, { mode = "normal", situationalModifier = 0 } = {}) {
    const skill = this.system.skills?.[skillKey];
    if (!skill) throw new Error(`Unknown skill: ${skillKey}`);

    const result = computeRoll({
      mode,
      skillModifier: skill.value,
      situationalModifier,
      hurt: this.system.hurt ?? false,
      isPhysicalSkill: PHYSICAL_SKILLS.has(skillKey)
    });

    try {
      await Promise.race([
        showDiceSoNice(result.dice),
        new Promise(resolve => setTimeout(resolve, 10000))
      ]);
    } catch (err) {
      console.error("PROCEDURAL | Dice So Nice! animation failed", err);
    }

    await this._postRollCard(skillKey, mode, situationalModifier, result);
    return result;
  }

  async _postRollCard(skillKey, mode, situationalModifier, result) {
    const skillLabel = game.i18n.localize(`PROCEDURAL.Skill.${skillKey}`);
    const content = await renderTemplate("systems/procedural/templates/chat/roll-card.hbs", {
      actorId: this.id,
      skillKey,
      skillLabel,
      mode,
      situationalModifier,
      result,
      tierClass: TIER_CLASS[result.tier],
      canReroll: (this.system.rerunPoints ?? 0) > 0
    });

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content
    });
  }

  async spendRerunPointAndReroll(skillKey, mode, situationalModifier) {
    if ((this.system.rerunPoints ?? 0) <= 0) return null;
    await this.update({ "system.rerunPoints": this.system.rerunPoints - 1 });
    return this.rollSkill(skillKey, { mode, situationalModifier });
  }

  async generateRandomTrope() {
    const data = await loadGeneratorData();
    const result = generateTrope(data);

    const staleItems = this.items.filter(i => i.type === "trope" || i.type === "talent");
    if (staleItems.length) {
      await this.deleteEmbeddedDocuments("Item", staleItems.map(i => i.id));
    }

    await this.update({
      "system.stats": result.stats,
      "system.skills.tech.value": result.skills.tech,
      "system.skills.lab.value": result.skills.lab,
      "system.skills.investigation.value": result.skills.investigation,
      "system.skills.violence.value": result.skills.violence,
      "system.skills.reflexes.value": result.skills.reflexes,
      "system.skills.coordination.value": result.skills.coordination,
      "system.skills.cool.value": result.skills.cool,
      "system.skills.intuition.value": result.skills.intuition,
      "system.skills.deception.value": result.skills.deception,
      "system.qualities": result.quality,
      "system.quirks": result.quirk,
      "system.bStory": result.bStory,
      "system.hq": result.hq,
      "system.agencyName": result.agencyName,
      "system.rerunPoints": result.rerunPoints,
      "system.hurt": false
    });

    await Item.createDocuments([
      { name: result.trope.name, type: "trope", img: result.trope.img, system: result.trope.system },
      { name: result.secondTalent.name, type: "talent", img: result.secondTalent.img, system: { ...result.secondTalent.system } }
    ], { parent: this });

    return result;
  }
}
