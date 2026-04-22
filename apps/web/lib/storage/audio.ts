// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDB = any;

const BUCKET = "audio";

export type AudioUploadResult = { url: string; path: string };

function extFromMime(mimeType: "audio/webm" | "audio/mpeg" | "audio/wav"): string {
  switch (mimeType) {
    case "audio/webm":  return "webm";
    case "audio/mpeg":  return "mp3";
    case "audio/wav":   return "wav";
  }
}

export async function uploadAudio(
  defenseTurnId: string,
  audioBuffer: Buffer | Uint8Array,
  mimeType: "audio/webm" | "audio/mpeg" | "audio/wav",
  supabase: AnyDB,
): Promise<AudioUploadResult> {
  const ext = extFromMime(mimeType);
  const path = `defense/${defenseTurnId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, audioBuffer, { contentType: mimeType, upsert: false });

  if (error) {
    throw new Error(`Audio upload failed at ${path}: ${error.message}`);
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl as string, path };
}

export async function deleteAudio(
  path: string,
  supabase: AnyDB,
): Promise<void> {
  try {
    await supabase.storage.from(BUCKET).remove([path]);
  } catch {
    // purge is best-effort — swallow all errors
  }
}
