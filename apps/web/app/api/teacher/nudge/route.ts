import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTeacher, extractBearer, authErrorResponse } from "@/lib/teacher/middleware";
import { Channels } from "@pedagogue/shared";

const NudgeRequest = z.object({
  sessionId: z.string().uuid(),
  kind: z.enum(["hint", "pause", "redirect"]),
  payload: z.record(z.string(), z.unknown()).optional().default({}),
});

export async function POST(req: NextRequest) {
  let ctx;
  try {
    ctx = await requireTeacher(extractBearer(req.headers.get("authorization")));
  } catch (err) {
    return authErrorResponse(err);
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = NudgeRequest.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { sessionId, kind, payload } = parsed.data;
  const { userId, classIds, supabase } = ctx;

  // Resolve the session → class, verify teacher owns it, check consent
  const { data: session, error: sErr } = await supabase
    .from("sessions")
    .select("id, user_id, class_id")
    .eq("id", sessionId)
    .single();

  if (sErr || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const { class_id: classId, user_id: studentId } = session as {
    class_id: string | null;
    user_id: string;
  };

  if (!classId || !classIds.includes(classId)) {
    return NextResponse.json({ error: "You do not own this student's class" }, { status: 403 });
  }

  // Consent check
  const { data: hasConsent } = await supabase.rpc("has_visibility_consent", {
    p_class_id: classId,
    p_student_id: studentId,
  });
  if (!hasConsent) {
    return NextResponse.json(
      { error: "Student has not consented to teacher visibility." },
      { status: 403 },
    );
  }

  // Insert nudge
  const { data: nudge, error: nErr } = await supabase
    .from("teacher_nudges")
    .insert({
      from_user: userId,
      to_session: sessionId,
      kind,
      payload_json: payload,
    })
    .select("id")
    .single();

  if (nErr) return NextResponse.json({ error: nErr.message }, { status: 500 });

  // Broadcast on nudge channel — fire-and-forget
  supabase
    .channel(Channels.nudges(sessionId))
    .send({ type: "broadcast", event: "nudge", payload: { kind, payload, from: userId } })
    .catch(() => {})
    .finally(() => supabase.removeAllChannels());

  return NextResponse.json({ nudgeId: (nudge as { id: string }).id });
}
