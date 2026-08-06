export default class TropeItemData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { SchemaField, StringField, NumberField, BooleanField } = foundry.data.fields;

    return {
      statBlock: new SchemaField({
        mental: new NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        physical: new NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        social: new NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),
      statNotes: new StringField({ initial: "", blank: true }),
      talentName: new StringField({ required: true, initial: "" }),
      talentDescription: new StringField({ required: true, initial: "", blank: true }),
      talentUsesPerAct: new NumberField({ required: false, integer: true, initial: 1, min: 0, nullable: true }),
      used: new BooleanField({ initial: false })
    };
  }
}
