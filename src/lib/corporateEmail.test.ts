import { describe, expect, it } from 'vitest';
import { isCorporateEmail } from './corporateEmail';

describe('corporate email validation', () => {
  it.each([
    'user@astroturviagens.com',
    'user@GRUPOASTROTUR.COM.BR',
    'user@transastro.com.br',
    'user+helpdesk@astroturviagens.com',
  ])('accepts corporate email %s', (email) => {
    expect(isCorporateEmail(email)).toBe(true);
  });

  it.each([
    'user@example.com',
    'user@astroturviagens.com.example.com',
    'user@sub.astroturviagens.com',
    'user@grupoastrotur.com',
    'user@transastro.com.br.evil',
  ])('rejects non-corporate email %s', (email) => {
    expect(isCorporateEmail(email)).toBe(false);
  });
});
