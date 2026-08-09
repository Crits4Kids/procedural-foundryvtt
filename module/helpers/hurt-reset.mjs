/**
 * @param {Array<{id: string, system: {hurt: boolean, knockedOut: boolean}}>} actors
 * @returns {string[]} actor ids that need healing
 */
export function findActorsToHeal(actors) {
  return actors
    .filter(a => a.system?.hurt === true || a.system?.knockedOut === true)
    .map(a => a.id);
}
