import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { ReportRankRow } from '@/lib/reporting';

interface RankingBlockProps {
  title: string;
  rows: ReportRankRow[];
}

export function RankingBlock({ title, rows }: RankingBlockProps) {
  return (
    <Card>
      <CardHeader className="px-4 pb-2 pt-4">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4">
        {rows.length ? rows.map((row) => (
          <div key={row.label} className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate font-medium">{row.label}</span>
              <span className="text-muted-foreground">{row.count}</span>
            </div>
            <Progress value={row.percent} className="h-2" />
          </div>
        )) : (
          <p className="text-sm text-muted-foreground">Sem dados para exibir.</p>
        )}
      </CardContent>
    </Card>
  );
}
