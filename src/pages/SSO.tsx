import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export default function SSO() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState("Iniciando validação...");
  const [errorDetails, setErrorDetails] = useState("");
  const processedRef = useRef(false);

  useEffect(() => {
    const ticket = searchParams.get("ticket");

    if (!ticket) {
      setStatus("Erro: Nenhum ticket encontrado na URL.");
      return;
    }

    if (processedRef.current) return;
    processedRef.current = true;

    setStatus("Validando ticket no Hub...");

    supabase.functions
      .invoke("sso-validate", { body: { ticket } })
      .then(async ({ data, error }) => {
        if (error) {
          let msg = error.message;
          try {
            const body = await error.context?.json();
            if (body?.message) msg = body.message;
          } catch (_) {}
          throw new Error(`Falha no sso-validate: ${msg}`);
        }

        if (!data?.valid || !data?.token_hash) {
          throw new Error(data?.message || "Resposta inválida recebida da validação.");
        }

        setStatus("Sucesso! Autenticando sessão...");

        const { error: otpError } = await supabase.auth.verifyOtp({
          token_hash: data.token_hash,
          type: "magiclink",
        });

        if (otpError) throw otpError;

        window.location.replace("/");
      })
      .catch((err) => {
        setStatus("Falha na validação do SSO.");
        setErrorDetails(err.message || "Erro desconhecido ao validar ticket.");
      });
  }, [searchParams]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-center">
      <div className="max-w-md rounded-lg border p-6 shadow-md bg-card">
        <h2 className="text-xl font-semibold mb-2">Autenticação SSO</h2>
        <p className="text-sm text-muted-foreground mb-4">{status}</p>
        {errorDetails && (
          <div className="mt-4 p-3 bg-red-100 text-red-800 rounded text-xs text-left overflow-auto max-h-40 font-mono">
            {errorDetails}
          </div>
        )}
      </div>
    </div>
  );
}