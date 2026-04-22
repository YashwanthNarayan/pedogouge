import { NextRequest, NextResponse } from "next/server";
import { requireTeacher, extractBearer, authErrorResponse, ForbiddenError } from "@/lib/teacher/middleware";
import { logTeacherView } from "@/lib/teacher/audit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ classId: string; studentId: string }> },
) {
  let ctx;
  try {
    ctx = await requireTeacher(extractBearer(req.headers.get("authorization")));
  } catch (err) {
    return authErrorResponse(err);
  }

  const { userId, classIds, supabase } = ctx;
  const { classId, studentId } = await params;

  if (!classIds.includes(classId)) {
    return NextResponse.json({ error: "Class not found or not owned by this teacher" }, { status: 404 });
  }

  // Explicit consent check — has_visibility_consent is also enforced by RLS,
  // but we return a clear 403 message here before making any further queries.
  const { data: consent } = await supabase
    .rpc("has_visibility_consent", {
      p_class_id: classId,
      p_student_id: studentId,
    });

  if (!consent) {
    return NextResponse.json(
      { error: "Student has not consented to teacher visibility." },
      { status: 403 },
    );
  }

  // Fetch session owned by this student in this class
  const { data: session, error: sErr } = await supabase
    .from("sessions")
    .select("id, project_idea, blueprint_json, created_at, finalized_at, yjs_room_id")
    .eq("user_id", studentId)
    .eq("class_id", classId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (sErr || !session) {
    return NextResponse.json({ error: "No session found for this student" }, { status: 404 });
  }

  const sessionId = (session as { id: string }).id;

  // Fetch concept nodes, recent events, snapshot count in parallel
  const [nodesResult, eventsResult, snapshotResult] = await Promise.all([
    supabase
      .from("concept_nodes")
      .select("id, name, mastery_score, struggle_pattern, x, y, prerequisites")
      .eq("session_id", sessionId),
    supabase
      .from("events")
      .select("id, ts, kind, payload_json")
      .eq("session_id", sessionId)
      .order("ts", { ascending: false })
      .limit(20),
    supabase
      .from("editor_snapshots")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId),
  ]);

  if (nodesResult.error) return NextResponse.json({ error: nodesResult.error.message }, { status: 500 });
  if (eventsResult.error) return NextResponse.json({ error: eventsResult.error.message }, { status: 500 });

  // Audit log — fire-and-forget
  logTeacherView(userId, studentId, sessionId, supabase, "sessions", 1);

  return NextResponse.json({
    session,
    conceptNodes: nodesResult.data ?? [],
    recentEvents: eventsResult.data ?? [],
    snapshotCount: snapshotResult.count ?? 0,
  });
}
