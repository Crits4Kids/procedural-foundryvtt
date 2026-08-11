/**
 * @param {Array<{id: string, type: string, items: Array<{type: string, name: string}>}>} actors
 * @param {string} [excludeActorId] - actor id to exclude from the results (e.g. the acting actor itself)
 * @returns {{tropeNames: string[], secondTalentNames: string[]}}
 */
export function heldNames(actors, excludeActorId = null) {
  const tropeActors = actors.filter(a => a.type === "trope" && a.id !== excludeActorId);
  const tropeNames = tropeActors.flatMap(a => a.items.filter(i => i.type === "trope").map(i => i.name));
  const secondTalentNames = tropeActors.flatMap(a => a.items.filter(i => i.type === "talent").map(i => i.name));
  return { tropeNames, secondTalentNames };
}
