export default class EquipmentItemData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { StringField } = foundry.data.fields;

    return {
      description: new StringField({ required: true, initial: "", blank: true })
    };
  }
}
