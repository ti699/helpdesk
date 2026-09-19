import { describe, expect, it } from 'vitest';
import { detectAssetMapping, normalizeAssetDate, parseBrazilianMoney, parseCsvRows } from './assetImport';

describe('asset import helpers', () => {
  it('detecta cabeçalhos oficiais e alternativos', () => {
    expect(detectAssetMapping(['Código do patrimônio', 'Item', 'E-mail do responsável'])).toEqual({
      asset_code: '0', name: '1', responsible_email: '2',
    });
  });

  it('normaliza datas brasileiras, ISO e seriais do Excel', () => {
    expect(normalizeAssetDate('15/09/2026')).toBe('2026-09-15');
    expect(normalizeAssetDate('2026-09-15')).toBe('2026-09-15');
    expect(normalizeAssetDate(46380)).toBe('2026-12-24');
    expect(normalizeAssetDate('31/02/2026')).toBeNull();
  });

  it('normaliza valores brasileiros', () => {
    expect(parseBrazilianMoney('4.500,00')).toBe(4500);
    expect(parseBrazilianMoney(4500)).toBe(4500);
    expect(parseBrazilianMoney('-1')).toBeNull();
  });

  it('lê CSV delimitado por ponto e vírgula preservando campos entre aspas', () => {
    expect(parseCsvRows('Código;Nome\nPAT-1;"Notebook, Dell"')).toEqual([
      ['Código', 'Nome'], ['PAT-1', 'Notebook, Dell'],
    ]);
  });
});
