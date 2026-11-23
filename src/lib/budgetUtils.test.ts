import { describe, expect, it } from 'vitest';
import { calculateBudgetTotal, roundBudgetValue } from './budgetUtils';

describe('budget totals', () => {
  it('calculates line totals and rounds the final value to cents', () => {
    expect(calculateBudgetTotal([
      { quantidade: 3, valor_unitario: 12.35 },
      { quantidade: 1, valor_unitario: 9.99 },
    ])).toBe(47.04);
  });

  it('handles floating point precision when rounding currency values', () => {
    expect(roundBudgetValue(0.1 + 0.2)).toBe(0.3);
    expect(calculateBudgetTotal([])).toBe(0);
  });
});
