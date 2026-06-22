// Notas libres por entidad — reemplaza el localStorage del prototipo.
// PRD §3 (rol marketing puede editar) + §14 (auditoría).

import { getSupabase } from "@/lib/supabase/client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { DbNote } from "@/lib/supabase/types";

export type NoteKind = DbNote["target_kind"];

export async function listNotes(kind: NoteKind): Promise<Record<string, string>> {
  const sb = getSupabase();
  if (!sb) return {};
  const { data, error } = await sb
    .from("notes")
    .select("target_key, body")
    .eq("target_kind", kind);
  if (error || !data) return {};
  return Object.fromEntries(data.map((n) => [n.target_key, n.body]));
}

export async function upsertNote(kind: NoteKind, key: string, body: string): Promise<void> {
  const sb = getSupabaseAdmin();
  if (!sb) return;
  await sb.from("notes").upsert(
    { target_kind: kind, target_key: key, body, author: "anonymous@dev" },
    { onConflict: "target_kind,target_key,author" },
  );
}
