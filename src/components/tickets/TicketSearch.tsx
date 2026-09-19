import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface TicketSearchProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function TicketSearch({ value, onChange, className }: TicketSearchProps) {
  return (
    <div className={cn('relative min-w-0', className)} role="search">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Buscar protocolo, título, solicitante, setor..."
        aria-label="Pesquisar tickets"
        className="h-10 w-full pl-9 pr-10"
      />
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onChange('')}
          aria-label="Limpar pesquisa"
          title="Limpar pesquisa"
          className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
