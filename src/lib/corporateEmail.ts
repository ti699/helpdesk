export const CORPORATE_EMAIL_ERROR =
  'Use um e-mail corporativo terminado em @astroturviagens.com, @grupoastrotur.com.br ou @transastro.com.br.';

const CORPORATE_EMAIL_DOMAINS = [
  'astroturviagens.com',
  'grupoastrotur.com.br',
  'transastro.com.br',
];

export function isCorporateEmail(email: string): boolean {
  const normalizedEmail = email.trim().toLowerCase();
  return CORPORATE_EMAIL_DOMAINS.some((domain) => normalizedEmail.endsWith(`@${domain}`));
}
