-- El CHECK de `targets.channel` (0003) solo permitía 'LinkedIn' | 'Google',
-- de cuando esos eran los únicos canales del PRD. Overview ya deja editar
-- Spend/Pipeline Obj para los 5 canales de `CHANNELS` (lib/mock-data.ts):
-- LinkedIn, Google, Organic, Email Marketing, Otros. Guardar un objetivo de
-- cualquiera de los tres últimos violaba el constraint y el upsert fallaba
-- en silencio (upsertTarget no comprobaba el error) — el objetivo parecía
-- guardarse (estado local optimista) pero se perdía al refrescar.

alter table targets drop constraint if exists targets_channel_check;
alter table targets add constraint targets_channel_check
  check (channel in ('LinkedIn', 'Google', 'Organic', 'Email Marketing', 'Otros'));
