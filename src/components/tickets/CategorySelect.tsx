import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface CategorySelectProps {
  tipo: string;
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}

const categoriasTI = [
  'Computador',
  'Notebook',
  'Internet',
  'E-mail',
  'Impressora',
  'Sistema',
  'Telefone',
  'Outros',
];

const categoriasManutencao = [
  'Luz queimada',
  'Furo na parede',
  'Vazamento',
  'Entupimento',
  'Porta com defeito',
  'Vidro quebrado',
  'Ar condicionado',
  'Pintura/Acabamento',
  'Outros',
];

export function CategorySelect({ tipo, value, onValueChange, disabled }: CategorySelectProps) {
  const categorias = tipo === 'TI' ? categoriasTI : categoriasManutencao;

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Selecione a categoria" />
      </SelectTrigger>
      <SelectContent>
        {categorias.map((cat) => (
          <SelectItem key={cat} value={cat}>
            {cat}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export { categoriasTI, categoriasManutencao };
