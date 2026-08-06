export default class TalentItemData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { StringField, NumberField, BooleanField } = foundry.data.fields;

    return {
      description: new StringField({ required: true, initial: "", blank: true }),
      usesPerAct: new NumberField({ required: false, integer: true, initial: 1, min: 0, nullable: true }),
      used: new BooleanField({ initial: false })
    };
  }
}
