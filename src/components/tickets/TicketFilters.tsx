import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Filter, X } from 'lucide-react';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '@/components/ui/select';

import type { TicketStatus } from "@/pages/Index";
interface TicketFiltersProps {
  statusFilter: TicketStatus[];
  onStatusChange: (value: TicketStatus[]) => void;
  tipoFilter: string;
  onTipoChange: (value: string) => void;
  periodoInicio?: string;
  onPeriodoInicioChange: (value: string) => void;
  periodoFim?: string;
  onPeriodoFimChange: (value: string) => void;
  setorFilter?: string;
  onSetorChange?: (value: string) => void;
  ratingMin?: number;
  onRatingMinChange?: (value: number | undefined) => void;
  showTipoFilter?: boolean;
  showAdvancedFilters?: boolean;
  onExportPDF: () => void;
  disableExportPDF?: boolean;
}

export function TicketFilters({
  statusFilter,
  onStatusChange,
  tipoFilter,
  onTipoChange,
  periodoInicio,
  onPeriodoInicioChange,
  periodoFim,
  onPeriodoFimChange,
  setorFilter,
  onSetorChange,
  ratingMin,
  onRatingMinChange,
  showTipoFilter = true,
  showAdvancedFilters = false,
  onExportPDF,
  disableExportPDF = false,
}: TicketFiltersProps) {
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  
  const hasActiveFilters = 
    statusFilter.length > 0 ||
    tipoFilter !== 'all' || 
    periodoInicio || 
    periodoFim || 
    (setorFilter && setorFilter !== 'all') ||
    (ratingMin && ratingMin > 0);

  const clearFilters = () => {
    onStatusChange([]);
    onTipoChange('all');
    onPeriodoInicioChange('');
    onPeriodoFimChange('');
    if (onSetorChange) onSetorChange('all');
    if (onRatingMinChange) onRatingMinChange(undefined);
  };

  // Status options
  const statusOptions = [
    { value: 'aberto', label: 'Abertos' },
    { value: 'em_andamento', label: 'Em Andamento' },
    { value: 'aguardando_resposta', label: 'Aguardando' },
    { value: 'resolvido', label: 'Resolvidos' },
    { value: 'fechado', label: 'Fechados' },
  ];

  // Helpers para seleção
  const allSelected = statusFilter.length === statusOptions.length;
  const noneSelected = statusFilter.length === 0;
  const indeterminate = !allSelected && !noneSelected;

  function handleStatusChange(value: string) {
    if (statusFilter.includes(value)) {
      onStatusChange(statusFilter.filter((v) => v !== value));
    } else {
      onStatusChange([...statusFilter, value]);
    }
  }

  function handleSelectAll() {
    if (allSelected) {
      onStatusChange([]);
    } else {
      onStatusChange(statusOptions.map((s) => s.value));
    }
  }

  // Texto do trigger
  let statusLabel = 'Status';
  if (allSelected) statusLabel = 'Todos';
  else if (statusFilter.length === 1) {
    const found = statusOptions.find(s => s.value === statusFilter[0]);
    statusLabel = found ? found.label : 'Status';
  } else if (statusFilter.length > 1) {
    statusLabel = `${statusFilter.length} selecionados`;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
      {/* Botão Exportar PDF */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1 sm:gap-2 text-xs sm:text-sm flex-shrink-0"
        onClick={() => { console.log('[UI] Clique exportar PDF'); onExportPDF(); }}
        disabled={disableExportPDF}
        title="Exportar tickets como PDF"
      >
        {/* Ícone FileDown Lucide */}
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="h-4 w-4 mr-1"><path d="M12 3v12m0 0-4-4m4 4 4-4"/><rect x="4" y="19" width="16" height="2" rx="1"/></svg>
        Exportar PDF
      </Button>
      {/* Status Filter - Multi-select Dropdown */}
      <Popover open={isStatusOpen} onOpenChange={setIsStatusOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="gap-1 sm:gap-2 text-xs sm:text-sm min-w-[120px] sm:min-w-[150px] justify-between"
          >
            <span>{statusLabel}</span>
            {!noneSelected && (
              <Badge variant="secondary">{statusFilter.length}</Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2" align="start">
          <div className="flex flex-col gap-1">
            {/* Select All */}
            <label className="flex items-center gap-2 cursor-pointer px-2 py-1 rounded hover:bg-muted">
              <Checkbox
                checked={allSelected}
                indeterminate={indeterminate}
                onCheckedChange={handleSelectAll}
              />
              <span className="text-xs sm:text-sm font-medium">Todos</span>
            </label>
            <div className="border-t my-1" />
            {statusOptions.map((option) => (
              <label key={option.value} className="flex items-center gap-2 cursor-pointer px-2 py-1 rounded hover:bg-muted">
                <Checkbox
                  checked={statusFilter.includes(option.value)}
                  onCheckedChange={() => handleStatusChange(option.value)}
                />
                <span className="text-xs sm:text-sm">{option.label}</span>
              </label>
            ))}
          </div>
          {/* Rodapé: Limpar seleção */}
          {!noneSelected && (
            <div className="mt-2 flex justify-end">
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => onStatusChange([])}>
                Limpar seleção
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Tipo Filter */}
      {showTipoFilter && (
        <Select value={tipoFilter} onValueChange={onTipoChange}>
          <SelectTrigger className="w-[120px] sm:w-[180px] text-xs sm:text-sm">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Tipos</SelectItem>
            <SelectItem value="TI">TI</SelectItem>
            <SelectItem value="Manutenção predial">Manutenção</SelectItem>
          </SelectContent>
        </Select>
      )}

      {/* Advanced Filters Popover */}
      {showAdvancedFilters && (
        <Popover open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1 sm:gap-2 text-xs sm:text-sm">
              <Filter className="h-4 w-4" />
              <span className="hidden xs:inline">Filtros</span>
              {hasActiveFilters && (
                <span className="ml-1 h-2 w-2 rounded-full bg-primary" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <div className="space-y-3 sm:space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm">Filtros Avançados</h4>
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs">
                    <X className="mr-1 h-3 w-3" />
                    Limpar
                  </Button>
                )}
              </div>

              {/* Período */}
              <div className="space-y-2">
                <Label className="text-xs sm:text-sm">Período</Label>
                <div className="flex gap-2">
                  <Input
                    type="date"
                    value={periodoInicio || ''}
                    onChange={(e) => onPeriodoInicioChange(e.target.value)}
                    className="flex-1 text-xs sm:text-sm"
                  />
                  <Input
                    type="date"
                    value={periodoFim || ''}
                    onChange={(e) => onPeriodoFimChange(e.target.value)}
                    className="flex-1 text-xs sm:text-sm"
                  />
                </div>
              </div>

              {/* Setor */}
              {onSetorChange && (
                <div className="space-y-2">
                  <Label className="text-xs sm:text-sm">Setor</Label>
                  <Select value={setorFilter || 'all'} onValueChange={onSetorChange}>
                    <SelectTrigger className="text-xs sm:text-sm">
                      <SelectValue placeholder="Todos os Setores" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os Setores</SelectItem>
                      <SelectItem value="Administrativo">Administrativo</SelectItem>
                      <SelectItem value="Comercial">Comercial</SelectItem>
                      <SelectItem value="Financeiro">Financeiro</SelectItem>
                      <SelectItem value="Marketing">Marketing</SelectItem>
                      <SelectItem value="Operações">Operações</SelectItem>
                      <SelectItem value="Recursos Humanos">RH</SelectItem>
                      <SelectItem value="TI">TI</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Rating Mínimo */}
              {onRatingMinChange && (
                <div className="space-y-2">
                  <Label className="text-xs sm:text-sm">Avaliação Mínima</Label>
                  <Select 
                    value={ratingMin?.toString() || 'any'} 
                    onValueChange={(v) => onRatingMinChange(v === 'any' ? undefined : parseInt(v))}
                  >
                    <SelectTrigger className="text-xs sm:text-sm">
                      <SelectValue placeholder="Qualquer" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Qualquer</SelectItem>
                      <SelectItem value="1">1+ estrela</SelectItem>
                      <SelectItem value="2">2+ estrelas</SelectItem>
                      <SelectItem value="3">3+ estrelas</SelectItem>
                      <SelectItem value="4">4+ estrelas</SelectItem>
                      <SelectItem value="5">5 estrelas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
