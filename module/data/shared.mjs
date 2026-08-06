export const SKILL_KEYS = [
  "tech", "lab", "investigation",
  "violence", "reflexes", "coordination",
  "cool", "intuition", "deception"
];

export function buildSkillsSchema(initialValue = 0) {
  const { SchemaField, NumberField } = foundry.data.fields;
  const skills = {};
  for (const key of SKILL_KEYS) {
    skills[key] = new SchemaField({
      value: new NumberField({ required: true, integer: true, initial: initialValue, min: 0 })
    });
  }
  return new SchemaField(skills);
}
