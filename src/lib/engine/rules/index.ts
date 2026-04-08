import type { RuleDefinition } from '../../types';

import categoryA from './categoryA';
import categoryB from './categoryB';
import categoryC from './categoryC';
import categoryD from './categoryD';
import categoryE from './categoryE';
import categoryF from './categoryF';
import categoryG from './categoryG';
import categoryH from './categoryH';
import categoryI from './categoryI';
import categoryJ from './categoryJ';
import categoryK from './categoryK';
import categoryL from './categoryL';
import categoryM from './categoryM';

/** All ~150 rules as a single flat array */
export const allRules: RuleDefinition[] = [
  ...categoryA,
  ...categoryB,
  ...categoryC,
  ...categoryD,
  ...categoryE,
  ...categoryF,
  ...categoryG,
  ...categoryH,
  ...categoryI,
  ...categoryJ,
  ...categoryK,
  ...categoryL,
  ...categoryM,
];

/** Lookup map: rule ID -> RuleDefinition */
export const ruleMap: Map<string, RuleDefinition> = new Map(
  allRules.map(r => [r.id, r])
);

/** Get a rule by ID, or undefined if not found */
export function getRule(id: string): RuleDefinition | undefined {
  return ruleMap.get(id);
}

/** Get all rules for a given category */
export function getRulesByCategory(category: string): RuleDefinition[] {
  return allRules.filter(r => r.category === category);
}

// Re-export individual categories for direct access
export {
  categoryA,
  categoryB,
  categoryC,
  categoryD,
  categoryE,
  categoryF,
  categoryG,
  categoryH,
  categoryI,
  categoryJ,
  categoryK,
  categoryL,
  categoryM,
};

// Re-export helpers for use by engine code
export * from './helpers';
