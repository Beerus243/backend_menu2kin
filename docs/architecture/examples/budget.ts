/** CODE EXEMPLE exécutable ; non raccordé à NestJS ou au repository PostgreSQL. */
export interface BudgetCandidate {
  readonly dishId: string;
  readonly restaurantId: string;
  readonly unitPriceCdf: string;
  readonly servesPeople: number | null;
  readonly isMainDish: boolean;
  readonly eligible: boolean; // projection SQL: visibilité complète et disponibilité
  readonly distanceMeters: number;
}
export interface BudgetProposal {
  readonly dishId: string;
  readonly restaurantId: string;
  readonly currency: 'CDF';
  readonly budget: string;
  readonly people: number;
  readonly quantity: number;
  readonly servesPeople: number;
  readonly unitPrice: string;
  readonly total: string;
  readonly pricePerPerson: string;
  readonly remainingBudget: string;
  readonly distanceMeters: number;
  readonly coverageBasis: 'EDITORIAL_PORTION';
}
export function parseCdf(value: string): bigint {
  if (!/^(0|[1-9][0-9]{0,11})\.[0-9]{2}$/.test(value)) {
    throw new RangeError('INVALID_MONEY_FORMAT');
  }
  const [whole, fraction] = value.split('.');
  return BigInt(whole!) * 100n + BigInt(fraction!);
}
function formatCdf(cents: bigint): string {
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`;
}
function roundDivideHalfUp(cents: bigint, divisor: bigint): bigint {
  return (2n * cents + divisor) / (2n * divisor);
}
/** Retourne une proposition ou null, sans troncature cachée des candidats. */
export function proposeDish(
  budget: string,
  people: number,
  candidate: BudgetCandidate,
): BudgetProposal | null {
  const budgetCents = parseCdf(budget);
  if (budgetCents < 100n || budgetCents > 1_000_000_000n) {
    throw new RangeError('BUDGET_OUT_OF_RANGE');
  }
  if (!Number.isInteger(people) || people < 1 || people > 20) {
    throw new RangeError('PEOPLE_OUT_OF_RANGE');
  }
  if (!Number.isFinite(candidate.distanceMeters) || candidate.distanceMeters < 0) {
    throw new RangeError('INVALID_DISTANCE');
  }
  const portion = candidate.servesPeople;
  if (!candidate.eligible || !candidate.isMainDish || portion === null) return null;
  if (!Number.isInteger(portion) || portion < 1 || portion > 20) {
    throw new RangeError('INVALID_PORTION');
  }
  const price = parseCdf(candidate.unitPriceCdf);
  if (price <= 0n) throw new RangeError('INVALID_DISH_PRICE');
  const quantity = Math.ceil(people / portion);
  const total = price * BigInt(quantity);
  if (total > budgetCents) return null;
  return {
    dishId: candidate.dishId,
    restaurantId: candidate.restaurantId,
    currency: 'CDF',
    budget,
    people,
    quantity,
    servesPeople: portion,
    unitPrice: candidate.unitPriceCdf,
    total: formatCdf(total),
    pricePerPerson: formatCdf(roundDivideHalfUp(total, BigInt(people))),
    remainingBudget: formatCdf(budgetCents - total),
    distanceMeters: candidate.distanceMeters,
    coverageBasis: 'EDITORIAL_PORTION',
  };
}
