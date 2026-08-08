/**
 * Finds every embedded item subject to the rulebook's "once per act" limit
 * (a Trope's own built-in Talent, and any second Talent item) that is
 * currently marked used.
 * @param {Array<{id: string, items: Array<{id: string, type: string, system: {used: boolean}}>}>} actors
 * @returns {Array<{actorId: string, itemId: string}>}
 */
export function findTalentsToReset(actors) {
  const updates = [];
  for (const actor of actors) {
    for (const item of actor.items ?? []) {
      const isTalentLike = item.type === "talent" || item.type === "trope";
      if (isTalentLike && item.system?.used === true) {
        updates.push({ actorId: actor.id, itemId: item.id });
      }
    }
  }
  return updates;
}
