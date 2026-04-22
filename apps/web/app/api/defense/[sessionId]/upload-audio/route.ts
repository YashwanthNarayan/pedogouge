import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { uploadAudio } from "@/lib/storage/audio";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function getAuthenticatedUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    },
  );
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  return user?.id ?? null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;

  // Allow session owner OR the defense-ws service (x-service-secret header)
  const serviceSecret = req.headers.get("x-service-secret");
  const isService = serviceSecret === process.env.SUPABASE_SERVICE_ROLE_KEY;

  let userId: string | null = null;
  if (!isService) {
    userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const turnId = formData.get("turnId");
  const role = formData.get("role");
  const audioFile = formData.get("audio");

  if (typeof turnId !== "string" || !turnId) {
    return NextResponse.json({ error: "Missing turnId" }, { status: 400 });
  }
  if (role !== "student" && role !== "tutor") {
    return NextResponse.json({ error: "role must be 'student' or 'tutor'" }, { status: 400 });
  }
  if (!(audioFile instanceof File)) {
    return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
  }
  if (audioFile.size > MAX_BYTES) {
    return NextResponse.json({ error: "Audio exceeds 10 MB limit" }, { status: 413 });
  }

  const mimeType = audioFile.type as "audio/webm" | "audio/mpeg" | "audio/wav";
  if (!["audio/webm", "audio/mpeg", "audio/wav"].includes(mimeType)) {
    return NextResponse.json(
      { error: "Unsupported audio type — use audio/webm, audio/mpeg, or audio/wav" },
      { status: 415 },
    );
  }

  const supabase = getServiceClient();

  // If authenticated user: verify they own the session
  if (userId) {
    const { data: session } = await supabase
      .from("sessions")
      .select("user_id")
      .eq("id", sessionId)
      .single();
    if (!session || session.user_id !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const buffer = Buffer.from(await audioFile.arrayBuffer());

  let result: { url: string; path: string };
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result = await uploadAudio(turnId, buffer, mimeType, supabase as any);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  // Update defense_turns.audio_url
  await supabase
    .from("defense_turns")
    .update({ audio_url: result.url })
    .eq("id", turnId);

  return NextResponse.json({ url: result.url });
}
