import { createClient } from "@supabase/supabase-js";
import type { Data, Entry } from "./store";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase = url && key ? createClient(url, key) : null;
const bucket = "engenharia-arquivos";
export type CloudState = { revision: number; data: Data };
export function cloudError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String((error as { message?: string })?.message || error);
  if (raw.includes("STATE_CONFLICT")) return "Os dados foram alterados em outra aba. Atualize os dados e tente novamente; esta alteração não foi salva.";
  if (raw.includes("PAID_RECORD_IMMUTABLE")) return "Um registro já pago não pode ser alterado ou excluído.";
  if (raw.includes("NEGATIVE_STOCK")) return "A movimentação deixaria o estoque negativo.";
  if (/Invalid login credentials/i.test(raw)) return "E-mail ou senha incorretos.";
  if (/Email not confirmed/i.test(raw)) return "Confirme seu e-mail antes de entrar.";
  if (/rate limit|security purposes/i.test(raw)) return "Limite de tentativas atingido. Aguarde alguns minutos e tente novamente.";
  if (/fetch|network|timeout/i.test(raw)) return "Não foi possível conectar ao Supabase. Confira sua conexão e tente novamente.";
  return raw;
}
async function signed(path: string): Promise<string> {
  if (!supabase) throw new Error("Supabase não configurado.");
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}
export async function hydrate(data: Data): Promise<Data> {
  const entries = await Promise.all(data.entries.map(async (e) => ({
    ...e,
    file: e.filePath ? await signed(e.filePath) : e.file,
    photos: e.photoPaths?.length ? await Promise.all(e.photoPaths.map(signed)) : e.photos,
  })));
  return { ...data, entries };
}
export async function loadCloud(): Promise<CloudState | null> {
  if (!supabase) throw new Error("Supabase não configurado.");
  const { data, error } = await supabase.rpc("ei_load_state");
  if (error) throw error;
  if (!data) return null;
  return { revision: Number(data.revision), data: await hydrate(data.data as Data) };
}
export async function saveCloud(data: Data, revision: number, userId: string): Promise<CloudState> {
  if (!supabase) throw new Error("Supabase não configurado.");
  const client = supabase;
  const uploaded: string[] = [];
  let safeToCleanup = true;
  async function upload(value: string, entryId: string, filename: string): Promise<string> {
    const blob = await (await fetch(value)).blob();
    if (blob.size > 2097152) throw new Error("Cada anexo deve ter até 2 MB.");
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
    const path = `${userId}/${entryId}/${crypto.randomUUID()}-${safe}`;
    const { error } = await client.storage.from(bucket).upload(path, blob, { contentType: blob.type || "application/octet-stream", upsert: false });
    if (error) throw error;
    uploaded.push(path);
    return path;
  }
  try {
    const entries: Entry[] = [];
    for (const original of data.entries) {
      const e = { ...original };
      if (e.file?.startsWith("data:")) e.filePath = await upload(e.file, e.id, e.filename || "projeto.pdf");
      if (e.photos?.some(photo => photo.startsWith("data:"))) {
        e.photoPaths = [];
        for (let index = 0; index < e.photos.length; index++) {
          const photo = e.photos[index];
          e.photoPaths.push(photo.startsWith("data:") ? await upload(photo, e.id, `foto-${index + 1}.${photo.startsWith("data:image/png") ? "png" : "jpg"}`) : original.photoPaths?.[index] || "");
        }
        if (e.photoPaths.some(path => !path)) throw new Error("Foto sem referência no armazenamento. Reenvie as fotos.");
      }
      delete e.file; delete e.photos;
      entries.push(e);
    }
    const clean: Data = { ...data, entries };
    // Sign before committing: a signing failure must not leave a successful DB write reported as failed.
    const display = await hydrate(clean);
    safeToCleanup = false;
    const { data: nextRevision, error } = await client.rpc("ei_save_state", { p_expected_revision: revision, p_data: clean });
    if (error) { safeToCleanup = Boolean(error.code); throw error; }
    return { revision: Number(nextRevision), data: display };
  } catch (error) {
    if (uploaded.length && safeToCleanup) await client.storage.from(bucket).remove(uploaded);
    throw error;
  }
}
export async function downloadPrivate(path: string, filename: string) {
  if (!supabase) throw new Error("Supabase não configurado.");
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error) throw error;
  const url = URL.createObjectURL(data);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
