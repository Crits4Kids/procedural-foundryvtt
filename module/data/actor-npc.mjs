import { buildSkillsSchema } from "./shared.mjs";

export default class NpcActorData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      skills: buildSkillsSchema(1)
    };
  }
}
