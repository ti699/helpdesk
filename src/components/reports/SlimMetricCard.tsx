import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';

interface SlimMetricCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: ReactNode;
  tone?: 'default' | 'blue' | 'green' | 'warning' | 'danger' | 'muted';
}

export function SlimMetricCard({
  title,
  value,
  description,
  icon,
  tone = 'default',
}: SlimMetricCardProps) {
  const tones = {
    default: 'border-l-slate-500',
    blue: 'border-l-blue-500',
    green: 'border-l-emerald-500',
    warning: 'border-l-amber-500',
    danger: 'border-l-red-500',
    muted: 'border-l-slate-400',
  };

  return (
    <Card className={`border-l-[3px] ${tones[tone]} shadow-sm`}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 px-3 pb-1.5 pt-3">
        <CardDescription className="truncate text-[11px] font-medium uppercase tracking-wide">
          {title}
        </CardDescription>
        <span className="text-muted-foreground [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0">
        <div className="truncate text-xl font-bold leading-tight sm:text-2xl">{value}</div>
        {description && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{description}</p>}
      </CardContent>
    </Card>
  );
}
