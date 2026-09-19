export const normalizeTicketSearch = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();

export const matchesTicketSearch = (values: unknown[], query: string) => {
  const terms = normalizeTicketSearch(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const searchableContent = values.map(normalizeTicketSearch).join(' ');
  return terms.every((term) => searchableContent.includes(term));
};
