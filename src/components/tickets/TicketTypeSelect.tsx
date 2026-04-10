import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Monitor, Wrench } from 'lucide-react';

interface TicketTypeSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}

export function TicketTypeSelect({ value, onValueChange, disabled }: TicketTypeSelectProps) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Selecione o tipo" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="TI">
          <div className="flex items-center gap-2">
            <Monitor className="h-4 w-4" />
            <span>TI - Tecnologia da Informação</span>
          </div>
        </SelectItem>
        <SelectItem value="Manutenção predial">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4" />
            <span>Manutenção Predial</span>
          </div>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
