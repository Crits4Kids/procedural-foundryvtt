import { rollD6 } from "../helpers/dice-rules.mjs";
import { validateLevelUpChoice } from "../helpers/level-up.mjs";
import { loadGeneratorData } from "../helpers/generator-data.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export default class ProceduralTropeActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["procedural", "sheet", "actor", "trope"],
    position: { width: 640, height: 720 },
    window: { resizable: true },
    actions: {
      rollSkill: ProceduralTropeActorSheet.#onRollSkill,
      toggleHurt: ProceduralTropeActorSheet.#onToggleHurt,
      hurtAgain: ProceduralTropeActorSheet.#onHurtAgain,
      resolveBStory: ProceduralTropeActorSheet.#onResolveBStory,
      levelUp: ProceduralTropeActorSheet.#onLevelUp,
      createItem: ProceduralTropeActorSheet.#onCreateItem,
      editItem: ProceduralTropeActorSheet.#onEditItem,
      deleteItem: ProceduralTropeActorSheet.#onDeleteItem,
      randomizeTrope: ProceduralTropeActorSheet.#onRandomizeTrope
    }
  };

  static PARTS = {
    form: { template: "systems/procedural/templates/actor/trope-sheet.hbs", scrollable: [""] }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.actor = this.actor;
    context.system = this.actor.system;
    context.enrichedBiography = await TextEditor.implementation.enrichHTML(this.actor.system.biography, {
      secrets: this.actor.isOwner,
      relativeTo: this.actor
    });
    context.deskItem = this.actor.items.get(this.actor.system.deskItemId) ?? null;
    context.items = {
      trope: this.actor.items.filter(i => i.type === "trope"),
      talent: this.actor.items.filter(i => i.type === "talent"),
      equipment: this.actor.items.filter(i => i.type === "equipment" && i.id !== this.actor.system.deskItemId)
    };
    return context;
  }

  async _onDropItem(event, item) {
    const created = await super._onDropItem(event, item);
    if (created?.type === "equipment" && event.target.closest?.('[data-drop-zone="desk-item"]')) {
      await this.#setDeskItem(created);
    }
    return created;
  }

  async #setDeskItem(item) {
    const actor = this.actor;
    const previousId = actor.system.deskItemId;
    if (previousId && previousId !== item.id) {
      await actor.items.get(previousId)?.delete();
    }
    if (actor.system.deskItemId !== item.id) {
      await actor.update({ "system.deskItemId": item.id });
    }
  }

  static async #onRollSkill(event, target) {
    const skillKey = target.dataset.skill;
    const skillLabel = game.i18n.localize(`PROCEDURAL.Skill.${skillKey}`);

    const config = await foundry.applications.api.DialogV2.wait({
      window: { title: `${skillLabel} ${game.i18n.localize("PROCEDURAL.Roll.DialogTitleSuffix")}` },
      content: `
        <div class="procedural-roll-dialog">
          <label><input type="radio" name="mode" value="normal" checked> ${game.i18n.localize("PROCEDURAL.Roll.Normal")}</label>
          <label><input type="radio" name="mode" value="advantage"> ${game.i18n.localize("PROCEDURAL.Roll.Advantage")}</label>
          <label><input type="radio" name="mode" value="disadvantage"> ${game.i18n.localize("PROCEDURAL.Roll.Disadvantage")}</label>
          <label>${game.i18n.localize("PROCEDURAL.Roll.SituationalModifier")}
            <input type="number" name="situationalModifier" value="0" step="1">
          </label>
        </div>
      `,
      buttons: [
        {
          action: "roll",
          label: game.i18n.localize("PROCEDURAL.Roll.Roll"),
          default: true,
          callback: (event, button) => ({
            mode: button.form.elements.mode.value,
            situationalModifier: Number(button.form.elements.situationalModifier.value) || 0
          })
        },
        { action: "cancel", label: game.i18n.localize("PROCEDURAL.Roll.Cancel"), callback: () => false }
      ],
      rejectClose: false
    });

    if (!config) return;
    await this.actor.rollSkill(skillKey, config);
  }

  static async #onToggleHurt() {
    await this.actor.update({ "system.hurt": !this.actor.system.hurt });
  }

  static async #onHurtAgain() {
    if (!this.actor.system.hurt) return;
    const hours = rollD6();
    await this.actor.update({ "system.knockedOut": true });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<p>${game.i18n.format("PROCEDURAL.Actor.HurtAgainMessage", { name: this.actor.name, hours })}</p>`
    });
  }

  static async #onResolveBStory() {
    await this.actor.update({ "system.rerunPoints": this.actor.system.rerunPoints + 1 });
  }

  static async #onLevelUp() {
    if (!this.actor.system.levelUpsAvailable) return;

    const generatorData = await loadGeneratorData();
    const currentTalent = this.actor.items.find(i => i.type === "talent");
    const heldElsewhere = new Set(
      game.actors
        .filter(a => a.type === "trope" && a.id !== this.actor.id)
        .flatMap(a => a.items.filter(i => i.type === "talent").map(i => i.name))
    );
    const availableTalents = generatorData.secondTalents.filter(t => !heldElsewhere.has(t.name));
    const skills = this.actor.system.skills;

    const skillOption = (key) => {
      const label = game.i18n.localize(`PROCEDURAL.Skill.${key}`);
      const disabled = skills[key].value >= 3 ? "disabled" : "";
      return `<option value="${key}" ${disabled}>${label}</option>`;
    };

    const config = await foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.localize("PROCEDURAL.Actor.LevelUp") },
      content: `
        <div class="procedural-level-up-dialog">
          <fieldset>
            <legend>${game.i18n.localize("PROCEDURAL.Actor.LevelUpStat")}</legend>
            <label><input type="radio" name="stat" value="mental" checked> ${game.i18n.localize("PROCEDURAL.Stat.mental")}</label>
            <label><input type="radio" name="stat" value="physical"> ${game.i18n.localize("PROCEDURAL.Stat.physical")}</label>
            <label><input type="radio" name="stat" value="social"> ${game.i18n.localize("PROCEDURAL.Stat.social")}</label>
          </fieldset>
          <label>${game.i18n.localize("PROCEDURAL.Actor.LevelUpSkill")}
            <select name="skillKey">
              <optgroup label="${game.i18n.localize("PROCEDURAL.Stat.mental")}">
                ${skillOption("tech")}${skillOption("lab")}${skillOption("investigation")}
              </optgroup>
              <optgroup label="${game.i18n.localize("PROCEDURAL.Stat.physical")}">
                ${skillOption("violence")}${skillOption("reflexes")}${skillOption("coordination")}
              </optgroup>
              <optgroup label="${game.i18n.localize("PROCEDURAL.Stat.social")}">
                ${skillOption("cool")}${skillOption("intuition")}${skillOption("deception")}
              </optgroup>
            </select>
          </label>
          <label>${game.i18n.localize("PROCEDURAL.Actor.LevelUpTalentSwap")}
            <select name="talentName">
              <option value="">${game.i18n.localize("PROCEDURAL.Actor.LevelUpKeepTalent")}</option>
              ${availableTalents.map(t => `<option value="${t.name}">${t.name}</option>`).join("")}
            </select>
          </label>
        </div>
      `,
      buttons: [
        {
          action: "confirm",
          label: game.i18n.localize("PROCEDURAL.Actor.LevelUpConfirm"),
          default: true,
          callback: (event, button) => ({
            stat: button.form.elements.stat.value,
            skillKey: button.form.elements.skillKey.value,
            talentName: button.form.elements.talentName.value
          })
        },
        { action: "cancel", label: game.i18n.localize("PROCEDURAL.Roll.Cancel"), callback: () => false }
      ],
      rejectClose: false
    });

    if (!config) return;

    const currentSkills = Object.fromEntries(
      Object.entries(skills).map(([key, skill]) => [key, skill.value])
    );
    const result = validateLevelUpChoice({ stat: config.stat, skillKey: config.skillKey, currentSkills });
    if (!result.valid) {
      ui.notifications?.error(game.i18n.localize("PROCEDURAL.Actor.LevelUpInvalid"));
      return;
    }

    await this.actor.update({
      [`system.stats.${config.stat}`]: this.actor.system.stats[config.stat] + 1,
      [`system.skills.${config.skillKey}.value`]: skills[config.skillKey].value + 1,
      "system.levelUpsAvailable": this.actor.system.levelUpsAvailable - 1
    });

    if (config.talentName) {
      const talentSource = availableTalents.find(t => t.name === config.talentName);
      if (talentSource) {
        if (currentTalent) await currentTalent.delete();
        await Item.createDocuments(
          [{ name: talentSource.name, type: "talent", img: talentSource.img, system: { ...talentSource.system } }],
          { parent: this.actor }
        );
      }
    }
  }

  static async #onCreateItem(event, target) {
    const type = target.dataset.type;
    await Item.create({ name: `New ${type}`, type }, { parent: this.actor });
  }

  static async #onEditItem(event, target) {
    const itemId = target.closest("[data-item-id]").dataset.itemId;
    this.actor.items.get(itemId)?.sheet.render(true);
  }

  static async #onDeleteItem(event, target) {
    const itemId = target.closest("[data-item-id]").dataset.itemId;
    const isDeskItem = this.actor.system.deskItemId === itemId;
    await this.actor.items.get(itemId)?.delete();
    if (isDeskItem) {
      await this.actor.update({ "system.deskItemId": "" });
    }
  }

  static async #onRandomizeTrope() {
    const s = this.actor.system;
    const hasExistingData =
      this.actor.items.some(i => i.type === "trope" || i.type === "talent") ||
      !!(s.qualities || s.quirks || s.bStory || s.hq || s.agencyName || s.deskItemId);

    if (hasExistingData) {
      const confirmed = await foundry.applications.api.DialogV2.wait({
        window: { title: game.i18n.localize("PROCEDURAL.Actor.Randomize") },
        content: `<p>${game.i18n.localize("PROCEDURAL.Actor.RandomizeConfirm")}</p>`,
        buttons: [
          {
            action: "confirm",
            label: game.i18n.localize("PROCEDURAL.Actor.Confirm"),
            default: true,
            callback: () => true
          },
          {
            action: "cancel",
            label: game.i18n.localize("PROCEDURAL.Roll.Cancel"),
            callback: () => false
          }
        ],
        rejectClose: false
      });
      if (!confirmed) return;
    }

    await this.actor.generateRandomTrope();
  }
}
