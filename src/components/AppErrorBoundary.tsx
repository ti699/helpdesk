import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { reportClientError } from '@/lib/diagnostics';

interface Props { children: ReactNode }
interface State { hasError: boolean }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    void reportClientError(error, `react-boundary:${info.componentStack?.split('\n')[1]?.trim() || 'unknown'}`);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <section className="w-full max-w-lg rounded-md border bg-card p-6 text-center shadow-sm">
        <AlertTriangle className="mx-auto mb-3 h-9 w-9 text-destructive" />
        <h1 className="text-xl font-semibold">Não foi possível exibir esta tela</h1>
        <p className="mt-2 text-sm text-muted-foreground">A ocorrência técnica foi registrada sem dados sensíveis. Recarregue a página para continuar.</p>
        <Button className="mt-5" onClick={() => window.location.reload()}>Recarregar página</Button>
      </section>
    </main>;
  }
}
