import { describe, expect, it } from 'vitest';
import { calculateBudgetTotal, canAccessBudgets, roundBudgetValue } from './budgetUtils';

describe('budget access', () => {
  it('only allows admins and users with management access', () => {
    expect(canAccessBudgets('admin', false)).toBe(true);
    expect(canAccessBudgets('solicitante', true)).toBe(true);
    expect(canAccessBudgets('agente_ti', false)).toBe(false);
    expect(canAccessBudgets('agente_manutencao', false)).toBe(false);
    expect(canAccessBudgets('solicitante', false)).toBe(false);
  });
});

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
