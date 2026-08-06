import { computeRoll } from "../helpers/dice-rules.mjs";

const PHYSICAL_SKILLS = new Set(["violence", "reflexes", "coordination"]);

const TIER_CLASS = {
  criticalFailure: "procedural-tier-critical-failure",
  failure: "procedural-tier-failure",
  soSo: "procedural-tier-so-so",
  success: "procedural-tier-success",
  successEffect: "procedural-tier-success-effect"
};

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
}
