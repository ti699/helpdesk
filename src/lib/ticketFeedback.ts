export function isEvaluatedFeedbackOutcome(message: string | null): boolean {
  const normalizedMessage = (message || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  return normalizedMessage.includes('pertence a outro setor') ||
    normalizedMessage.includes('nao, e de outro setor') ||
    normalizedMessage.includes('nao e de outro setor') ||
    normalizedMessage.includes('optou por nao reabri-lo') ||
    normalizedMessage.includes('nao quero reabrir');
}
