import { supabase } from '@/integrations/supabase/client';

const controlCharacters = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const sanitize = (value: unknown, max = 500) => String(value ?? '')
  .replace(controlCharacters, '')
  .replace(/(bearer|token|password|senha|apikey)[=: ]+[^\s]+/gi, '$1=[redacted]')
  .slice(0, max);

export async function reportClientError(error: unknown, source = 'runtime') {
  const message = error instanceof Error ? error.message : String(error || 'Erro desconhecido');
  try {
    await supabase.functions.invoke('client-diagnostics', {
      body: {
        message: sanitize(message),
        source: sanitize(source, 80),
        route: sanitize(window.location.pathname, 240),
        appVersion: sanitize(import.meta.env.VITE_APP_VERSION || 'local', 80),
        browser: sanitize(navigator.userAgent, 400),
      },
    });
  } catch {
    // Diagnostics must never break the user flow.
  }
}
