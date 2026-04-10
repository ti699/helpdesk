import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Shield, User, UserCog, Wrench } from 'lucide-react';

interface RoleSelectorProps {
  currentRole: 'solicitante' | 'agente_ti' | 'agente_manutencao' | 'admin';
  onRoleChange: (role: 'solicitante' | 'agente_ti' | 'agente_manutencao' | 'admin') => void;
  disabled?: boolean;
}

const roleOptions = [
  { value: 'solicitante', label: 'Solicitante', icon: User },
  { value: 'agente_ti', label: 'Agente TI', icon: UserCog },
  { value: 'agente_manutencao', label: 'Agente Manutenção', icon: Wrench },
  { value: 'admin', label: 'Administrador', icon: Shield },
] as const;

export function RoleSelector({ currentRole, onRoleChange, disabled }: RoleSelectorProps) {
  return (
    <Select
      value={currentRole}
      onValueChange={(value) => onRoleChange(value as 'solicitante' | 'agente_ti' | 'agente_manutencao' | 'admin')}
      disabled={disabled}
    >
      <SelectTrigger className="w-[160px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {roleOptions.map((option) => {
          const Icon = option.icon;
          return (
            <SelectItem key={option.value} value={option.value}>
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                <span>{option.label}</span>
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
