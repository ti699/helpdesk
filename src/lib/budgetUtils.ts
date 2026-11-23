export interface BudgetLineInput {
  quantidade: number;
  valor_unitario: number;
}

export interface BudgetLine extends BudgetLineInput {
  id: string;
  descricao: string;
  total: number;
}

export const roundBudgetValue = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export const calculateBudgetTotal = (items: BudgetLineInput[]) =>
  roundBudgetValue(items.reduce(
    (total, item) => total + roundBudgetValue(item.quantidade * item.valor_unitario),
    0,
  ));

export const formatBudgetCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
