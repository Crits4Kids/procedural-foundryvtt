import { buildSkillsSchema } from "./shared.mjs";

export default class TropeActorData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { SchemaField, StringField, NumberField, BooleanField, HTMLField } = foundry.data.fields;

    return {
      stats: new SchemaField({
        mental: new NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        physical: new NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        social: new NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),
      skills: buildSkillsSchema(0),
      rerunPoints: new NumberField({ required: true, integer: true, initial: 1, min: 0 }),
      hurt: new BooleanField({ initial: false }),
      qualities: new StringField({ initial: "" }),
      quirks: new StringField({ initial: "" }),
      bStory: new StringField({ initial: "" }),
      hq: new StringField({ initial: "" }),
      agencyName: new StringField({ initial: "" }),
      deskItem: new StringField({ initial: "" }),
      biography: new HTMLField({ initial: "" })
    };
  }
}
