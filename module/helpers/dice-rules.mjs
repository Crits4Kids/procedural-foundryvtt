function rollDie(rng) {
  return Math.floor(rng() * 6) + 1;
}

/**
 * @param {"normal"|"advantage"|"disadvantage"} mode
 * @param {() => number} rng - returns a float in [0,1), like Math.random
 * @returns {{die1: number, die2: number, rawTotal: number, dice: Array<{ value: number, kept: boolean }>}}
 */
export function resolveDice(mode, rng) {
  const first = [rollDie(rng), rollDie(rng)];

  if (mode === "advantage") {
    const second = [rollDie(rng), rollDie(rng)];
    const pair1 = [first[0], second[0]];
    const pair2 = [first[1], second[1]];
    const die1 = Math.max(...pair1);
    const die2 = Math.max(...pair2);
    const keptIndex1 = pair1[0] >= pair1[1] ? 0 : 1;
    const keptIndex2 = pair2[0] >= pair2[1] ? 0 : 1;

    const dice = [
      { value: pair1[0], kept: keptIndex1 === 0 },
      { value: pair1[1], kept: keptIndex1 === 1 },
      { value: pair2[0], kept: keptIndex2 === 0 },
      { value: pair2[1], kept: keptIndex2 === 1 }
    ];

    return { die1, die2, rawTotal: die1 + die2, dice };
  }

  if (mode === "disadvantage") {
    const higherIndex = first[0] >= first[1] ? 0 : 1;
    const lowerIndex = higherIndex === 0 ? 1 : 0;
    const reroll = rollDie(rng);

    const final = [0, 0];
    final[lowerIndex] = first[lowerIndex];
    final[higherIndex] = reroll;

    const dice = [
      { value: first[0], kept: 0 === lowerIndex },
      { value: first[1], kept: 1 === lowerIndex },
      { value: reroll, kept: true }
    ];

    return { die1: final[0], die2: final[1], rawTotal: final[0] + final[1], dice };
  }

  return {
    die1: first[0],
    die2: first[1],
    rawTotal: first[0] + first[1],
    dice: [
      { value: first[0], kept: true },
      { value: first[1], kept: true }
    ]
  };
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

  const { die1, die2, rawTotal, dice } = resolveDice(effectiveMode, rng);
  const modifiedTotal = rawTotal === 2
    ? 2
    : rawTotal + effectiveSkillModifier + effectiveSituationalModifier;
  const tierInfo = resolveTier(rawTotal, modifiedTotal);

  return {
    die1,
    die2,
    rawTotal,
    modifiedTotal,
    dice,
    skillModifier: effectiveSkillModifier,
    situationalModifier: effectiveSituationalModifier,
    effectiveMode,
    ...tierInfo
  };
}
