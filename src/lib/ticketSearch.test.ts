import { describe, expect, it } from 'vitest';
import { matchesTicketSearch, normalizeTicketSearch } from './ticketSearch';

describe('ticket search', () => {
  it('ignores accents and letter case', () => {
    expect(normalizeTicketSearch('Manutenção CRÍTICA')).toBe('manutencao critica');
  });

  it('finds multiple terms even when they belong to different fields', () => {
    expect(matchesTicketSearch(
      ['TKT-123456', 'Troca de monitor', 'João da Silva', 'TI'],
      'joao monitor ti',
    )).toBe(true);
  });

  it('rejects a result when one term is absent', () => {
    expect(matchesTicketSearch(['TKT-123456', 'Troca de monitor'], 'monitor manutenção')).toBe(false);
  });
});
