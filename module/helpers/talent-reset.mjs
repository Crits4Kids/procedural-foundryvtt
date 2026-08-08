/**
 * @param {Array<{id: string, items: Array<{id: string, type: string, system: {used: boolean}}>}>} actors
 * @returns {Array<{actorId: string, itemId: string}>}
 */
export function findTalentsToReset(actors) {
  const updates = [];
  for (const actor of actors) {
    for (const item of actor.items ?? []) {
      if (item.type === "talent" && item.system?.used === true) {
        updates.push({ actorId: actor.id, itemId: item.id });
      }
    }
  }
  return updates;
}
