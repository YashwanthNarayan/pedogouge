import { NextRequest, NextResponse } from "next/server";
import { requireTeacher, extractBearer, authErrorResponse, ForbiddenError } from "@/lib/teacher/middleware";
import { logTeacherView } from "@/lib/teacher/audit";

export async function GET(
  req: NextRequest,
  { params }: { params: { classId: string } },
) {
  let ctx;
  try {
    ctx = await requireTeacher(extractBearer(req.headers.get("authorization")));
  } catch (err) {
    return authErrorResponse(err);
  }

  const { userId, classIds, supabase } = ctx;
  const { classId } = params;

  if (!classIds.includes(classId)) {
    return NextResponse.json({ error: "Class not found or not owned by this teacher" }, { status: 404 });
  }

  // Students in the class with their consent status and latest session info
  const { data: memberships, error } = await supabase
    .from("class_memberships")
    .select(`
      user_id,
      role,
      visibility_accepted_at,
      visibility_revoked_at,
      users!inner(id, email, display_name),
      sessions(
        id,
        created_at,
        finalized_at,
        concept_nodes(mastery_score)
      )
    `)
    .eq("class_id", classId)
    .neq("role", "teacher")
    .neq("role", "ta")
    .order("visibility_accepted_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const students = (memberships ?? []).map((m: Record<string, unknown>) => {
    const user = m.users as { id: string; email: string; display_name: string | null };
    const sessions = (m.sessions as Array<{
      id: string;
      created_at: string;
      finalized_at: string | null;
      concept_nodes: Array<{ mastery_score: number }>;
    }>) ?? [];

    // Latest session
    const latest = sessions.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )[0];

    const allNodes = sessions.flatMap(s => s.concept_nodes ?? []);
    const masteryAvg =
      allNodes.length > 0
        ? allNodes.reduce((s, n) => s + n.mastery_score, 0) / allNodes.length
        : null;

    const consentGiven =
      m.visibility_accepted_at !== null && m.visibility_revoked_at === null;

    return {
      userId: user.id,
      email: user.email,
      displayName: user.display_name,
      sessionId: latest?.id ?? null,
      lastActive: latest?.created_at ?? null,
      masteryAvg: masteryAvg !== null ? Math.round(masteryAvg * 100) / 100 : null,
      consentGiven,
    };
  });

  // Fire-and-forget audit log for each student row returned
  for (const s of students) {
    if (s.consentGiven) {
      logTeacherView(userId, s.userId, s.sessionId, supabase, "class_memberships", 1);
    }
  }

  return NextResponse.json({ students });
}
