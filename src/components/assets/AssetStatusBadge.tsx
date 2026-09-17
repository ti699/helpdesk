import { Badge } from '@/components/ui/badge';

export function AssetStatusBadge({ name, color }: { name?: string | null; color?: string | null }) {
  return (
    <Badge
      variant="outline"
      className="whitespace-nowrap"
      style={{ borderColor: color || '#64748b', color: color || '#64748b', backgroundColor: `${color || '#64748b'}12` }}
    >
      {name || 'Sem status'}
    </Badge>
  );
}
