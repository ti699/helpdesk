import { describe, expect, it } from 'vitest';
import { isEvaluatedFeedbackOutcome } from './ticketFeedback';

describe('isEvaluatedFeedbackOutcome', () => {
  it('recognizes the other-department outcome despite surrounding history text', () => {
    expect(isEvaluatedFeedbackOutcome(
      'Solicitante informou que a solicitação pertence a outro setor. Chamado mantido fechado.',
    )).toBe(true);
    expect(isEvaluatedFeedbackOutcome('Não, é de outro setor')).toBe(true);
  });

  it('recognizes both persisted and button wording for not reopening', () => {
    expect(isEvaluatedFeedbackOutcome(
      'Solicitante informou que optou por não reabri-lo.',
    )).toBe(true);
    expect(isEvaluatedFeedbackOutcome('Não foi resolvido, mas não quero reabrir')).toBe(true);
  });

  it('does not count unrelated status history or a missing message as an evaluation', () => {
    expect(isEvaluatedFeedbackOutcome('Ticket encaminhado para outro setor.')).toBe(false);
    expect(isEvaluatedFeedbackOutcome(null)).toBe(false);
  });
});
