export default class CaseTrackerData extends foundry.abstract.DataModel {
  static defineSchema() {
    const { SchemaField, StringField, NumberField, BooleanField, ArrayField } = foundry.data.fields;

    return {
      act: new NumberField({ required: true, integer: true, initial: 1 }),
      scene: new NumberField({ required: true, integer: true, initial: 1 }),
      turnOrder: new StringField({ initial: "" }),
      interludes: new ArrayField(new BooleanField({ initial: false }), { initial: [false, false, false] }),
      arrestPhaseTriggered: new BooleanField({ initial: false }),
      culpritEscaped: new BooleanField({ initial: false }),
      arrestPhaseNotes: new StringField({ initial: "" }),
      epilogueNotes: new StringField({ initial: "" }),
      drama: new StringField({ initial: "" }),
      leadsPooled: new ArrayField(new BooleanField({ initial: false }), { initial: [false, false, false] }),
      epilogueTiebreakRoll: new NumberField({ initial: 0, integer: true, min: 0, max: 6 }),
      epilogueTiebreakOutcome: new StringField({ initial: "", blank: true, choices: ["", "against", "for"] }),
      evidence: new ArrayField(
        new SchemaField({
          id: new StringField({ required: true }),
          description: new StringField({ initial: "" }),
          status: new StringField({ initial: "unknown", choices: ["good", "bad", "unknown"] }),
          notes: new StringField({ initial: "" })
        }),
        { initial: [] }
      ),
      interrogations: new ArrayField(
        new SchemaField({
          id: new StringField({ required: true }),
          suspect: new StringField({ initial: "" }),
          questionsRemaining: new NumberField({ required: true, integer: true, initial: 0, min: 0 }),
          notes: new StringField({ initial: "" })
        }),
        { initial: [] }
      )
    };
  }
}
