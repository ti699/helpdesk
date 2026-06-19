import { Check, ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface StatusMultiSelectOption<TValue extends string = string> {
  value: TValue;
  label: string;
}

interface StatusMultiSelectProps<TValue extends string = string> {
  options: StatusMultiSelectOption<TValue>[];
  value: TValue[];
  onChange: (value: TValue[]) => void;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
}

export function StatusMultiSelect<TValue extends string = string>({
  options,
  value,
  onChange,
  placeholder = 'Todos',
  className,
  triggerClassName,
  disabled,
}: StatusMultiSelectProps<TValue>) {
  const selectedLabels = options.filter((option) => value.includes(option.value));
  const allSelected = value.length === 0 || value.length === options.length;
  const buttonLabel = value.length === 0
    ? placeholder
    : value.length === 1
      ? selectedLabels[0]?.label || '1 selecionado'
      : `${value.length} selecionados`;

  const toggleValue = (nextValue: TValue, checked: boolean) => {
    if (checked) {
      onChange(value.includes(nextValue) ? value : [...value, nextValue]);
      return;
    }

    onChange(value.filter((item) => item !== nextValue));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn('h-9 w-full justify-between px-3 font-normal', triggerClassName)}
        >
          <span className="truncate">{buttonLabel}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className={cn('w-64 p-2', className)}>
        <div className="mb-1 flex items-center justify-between gap-2 border-b pb-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
            <Checkbox checked={allSelected} onCheckedChange={() => onChange([])} />
            <span>{placeholder}</span>
          </label>
          {value.length > 0 && (
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onChange([])}>
              <X className="mr-1 h-3 w-3" />
              Limpar
            </Button>
          )}
        </div>

        <div className="max-h-60 space-y-1 overflow-y-auto py-1">
          {options.map((option) => {
            const checked = value.includes(option.value);
            return (
              <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                <Checkbox checked={checked} onCheckedChange={(nextChecked) => toggleValue(option.value, nextChecked === true)} />
                <span className="flex-1">{option.label}</span>
                {checked && <Check className="h-3.5 w-3.5 text-primary" />}
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
