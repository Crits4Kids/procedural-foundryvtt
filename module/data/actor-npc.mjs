import { buildSkillsSchema } from "./shared.mjs";

export default class NpcActorData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { StringField } = foundry.data.fields;

    return {
      skills: buildSkillsSchema(1),
      personality: new StringField({ initial: "" })
    };
  }
}
