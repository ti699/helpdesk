import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";

export default function SSO() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState("Iniciando validação...");
  const [errorDetails, setErrorDetails] = useState("");
  const processedRef = useRef(false);

  useEffect(() => {
    const ticket = searchParams.get("ticket");
    const hubApiUrl = "http://187.127.0.219:8080";
    const clientSecret = "fe8a1afe90b17ef73209db7e69c181215996958b567be7751f7d53d59c567086";

    if (!ticket) {
      setStatus("Erro: Nenhum ticket encontrado na URL.");
      return;
    }

    if (processedRef.current) return;
    processedRef.current = true;

    setStatus("Validando ticket no Hub...");

    fetch(`${hubApiUrl}/api/sso/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticket,
        client_secret: clientSecret,
        clientSecret: clientSecret
      }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        console.log("Resposta do Hub:", res.status, data);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`);
        }
        return data;
      })
      .then((data) => {
        if (data.valid && (data.user || data.success !== false)) {
          setStatus("Sucesso! Autenticando sessão...");
          const token = data.token || data.access_token || "sso-session-token";

          window.localStorage.setItem("token", token);
          window.localStorage.setItem("user", JSON.stringify(data.user || {}));
          window.localStorage.setItem("sb-access-token", token);
          window.localStorage.setItem("supabase.auth.token", JSON.stringify({
            currentSession: {
              access_token: token,
              user: data.user || {}
            },
            expiresAt: Math.floor(Date.now() / 1000) + 3600 * 24
          }));

          setTimeout(() => {
            window.location.href = "/";
          }, 500);
        } else {
          setStatus("Erro: Resposta inválida da API do Hub.");
          setErrorDetails(JSON.stringify(data));
        }
      })
      .catch((err) => {
        setStatus("Falha na validação do SSO.");
        setErrorDetails(err.message);
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