function rollDie(rng) {
  return Math.floor(rng() * 6) + 1;
}

/**
 * @param {"normal"|"advantage"|"disadvantage"} mode
 * @param {() => number} rng - returns a float in [0,1), like Math.random
 * @returns {{die1: number, die2: number, rawTotal: number}}
 */
export function resolveDice(mode, rng) {
  const first = [rollDie(rng), rollDie(rng)];

  if (mode === "advantage") {
    const second = [rollDie(rng), rollDie(rng)];
    const die1 = Math.max(first[0], second[0]);
    const die2 = Math.max(first[1], second[1]);
    return { die1, die2, rawTotal: die1 + die2 };
  }

  if (mode === "disadvantage") {
    const dice = [...first];
    const higherIndex = dice[0] >= dice[1] ? 0 : 1;
    dice[higherIndex] = rollDie(rng);
    return { die1: dice[0], die2: dice[1], rawTotal: dice[0] + dice[1] };
  }

  return { die1: first[0], die2: first[1], rawTotal: first[0] + first[1] };
}

/**
 * @param {number} rawTotal - sum of the two resolved dice, before modifiers
 * @param {number} modifiedTotal - rawTotal + all applicable modifiers
 * @returns {{tier: string, label: string, isCriticalFailure: boolean, isCriticalSuccess: boolean}}
 */
export function resolveTier(rawTotal, modifiedTotal) {
  if (rawTotal === 2) {
    return {
      tier: "criticalFailure",
      label: "Critical Failure",
      isCriticalFailure: true,
      isCriticalSuccess: false
    };
  }

  const isCriticalSuccess = rawTotal === 12;

  if (modifiedTotal <= 6) {
    return { tier: "failure", label: "Failure", isCriticalFailure: false, isCriticalSuccess };
  }
  if (modifiedTotal <= 9) {
    return { tier: "soSo", label: "So-So Result", isCriticalFailure: false, isCriticalSuccess };
  }
  if (modifiedTotal <= 11) {
    return { tier: "success", label: "Outright Success", isCriticalFailure: false, isCriticalSuccess };
  }
  return {
    tier: "successEffect",
    label: "Outright Success + Positive Effect",
    isCriticalFailure: false,
    isCriticalSuccess
  };
}

/**
 * @param {object} params
 * @param {"normal"|"advantage"|"disadvantage"} params.mode
 * @param {number} params.skillModifier
 * @param {number} [params.situationalModifier]
 * @param {boolean} [params.hurt]
 * @param {boolean} [params.isPhysicalSkill]
 * @param {() => number} [params.rng]
 */
export function computeRoll({
  mode,
  skillModifier,
  situationalModifier = 0,
  hurt = false,
  isPhysicalSkill = false,
  rng = Math.random
}) {
  const effectiveMode = hurt && isPhysicalSkill ? "disadvantage" : mode;
  const effectiveSkillModifier = hurt ? 0 : skillModifier;
  const effectiveSituationalModifier = situationalModifier;

  const { die1, die2, rawTotal } = resolveDice(effectiveMode, rng);
  const modifiedTotal = rawTotal === 2
    ? 2
    : rawTotal + effectiveSkillModifier + effectiveSituationalModifier;
  const tierInfo = resolveTier(rawTotal, modifiedTotal);

  return {
    die1,
    die2,
    rawTotal,
    modifiedTotal,
    skillModifier: effectiveSkillModifier,
    situationalModifier: effectiveSituationalModifier,
    effectiveMode,
    ...tierInfo
  };
}
