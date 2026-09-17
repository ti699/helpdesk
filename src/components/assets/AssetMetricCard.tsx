import { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export function AssetMetricCard({ label, value, detail, icon: Icon, accent = '#2563eb' }: {
  label: string;
  value: string | number;
  detail?: string;
  icon: LucideIcon;
  accent?: string;
}) {
  return (
    <Card className="rounded-md border-l-4" style={{ borderLeftColor: accent }}>
      <CardContent className="flex min-h-[92px] items-center justify-between p-4">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
          {detail && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{detail}</p>}
        </div>
        <Icon className="h-5 w-5 text-muted-foreground" />
      </CardContent>
    </Card>
  );
}
