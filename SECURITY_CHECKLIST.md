# Checklist Operacional De Segurança

- Manter chaves privadas somente no Supabase e na Vercel; nunca usar `service_role` no frontend.
- Revisar mensalmente usuários administradores, gestores patrimoniais e acessos de Alta Gestão.
- Confirmar RLS ativa em todas as tabelas antes de publicar uma migration.
- Executar `npm run check` e exigir o workflow **Quality Gate** aprovado antes do deploy.
- Conferir que `.env`, `node_modules`, `dist`, `.DS_Store` e arquivos temporários não estão versionados.
- Usar `npm ci` no CI para respeitar exatamente o `package-lock.json`.
- Revisar a aba **Administração > Diagnóstico** sem copiar tokens, mensagens ou dados pessoais para chamados externos.
- Tratar exportações e planilhas como dados corporativos; compartilhar somente com usuários autorizados.
- Testar permissões de solicitante, agente, gestor patrimonial, Alta Gestão e admin após mudanças de RLS.
- Revogar imediatamente acessos de usuários desligados e revisar sessões ativas no Supabase Auth.
