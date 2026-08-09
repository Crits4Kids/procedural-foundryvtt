export default class SeasonTrackerData extends foundry.abstract.DataModel {
  static defineSchema() {
    const { SchemaField, StringField, BooleanField, ArrayField } = foundry.data.fields;

    return {
      episodes: new ArrayField(
        new SchemaField({
          outcome: new StringField({ initial: "", choices: ["", "successful", "neutral", "unsuccessful"] })
        }),
        { initial: [{ outcome: "" }, { outcome: "" }, { outcome: "" }, { outcome: "" }, { outcome: "" }, { outcome: "" }] }
      ),
      ep3RerunGranted: new BooleanField({ initial: false }),
      ep5RerunGranted: new BooleanField({ initial: false }),
      ep3LevelUpGranted: new BooleanField({ initial: false }),
      ep6LevelUpGranted: new BooleanField({ initial: false }),
      villains: new ArrayField(
        new SchemaField({
          id: new StringField({ required: true }),
          name: new StringField({ initial: "" }),
          reason: new StringField({ initial: "" }),
          active: new BooleanField({ initial: true })
        }),
        { initial: [] }
      )
    };
  }
}
