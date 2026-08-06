export async function showDiceSoNice(diceResults, { synchronize = true } = {}) {
  if (!game.dice3d) return;
  if (!diceResults?.length) return;

  const die = new foundry.dice.terms.Die({ number: diceResults.length, faces: 6 });
  die.results = diceResults.map(entry => ({ result: entry.value, active: entry.kept }));
  die._evaluated = true;

  const roll = Roll.fromTerms([die]);
  roll._evaluated = true;

  await game.dice3d.showForRoll(roll, game.user, synchronize);
}
