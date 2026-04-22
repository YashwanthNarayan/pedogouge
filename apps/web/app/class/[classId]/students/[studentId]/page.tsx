import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createCookieClient } from "@/lib/teacher/middleware";
import { StudentSessionView } from "@/components/teacher/StudentSessionView";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ classId: string; studentId: string }>;
}

interface ConceptNode {
  id: string;
  name: string;
  mastery_score: number;
  struggle_pattern: string;
}

interface EventRow {
  id: string;
  ts: string;
  kind: string;
  payload_json: Record<string, unknown> | null;
}

export default async function StudentDetailPage({ params }: Props) {
  const { classId, studentId } = await params;
  const supabase = await createCookieClient();

  // Auth check
  const {
    data: { session: authSession },
  } = await supabase.auth.getSession();
  if (!authSession) redirect("/");

  const { data: userRow } = await supabase
    .from("users")
    .select("role")
    .eq("id", authSession.user.id)
    .single();

  if (!userRow || (userRow as { role: string }).role !== "teacher") redirect("/");

  // Teacher must own this class
  const { data: cls } = await supabase
    .from("classes")
    .select("id, name")
    .eq("id", classId)
    .eq("teacher_id", authSession.user.id)
    .single();

  if (!cls) notFound();

  // Student identity
  const { data: studentUser } = await supabase
    .from("users")
    .select("email, display_name")
    .eq("id", studentId)
    .single();

  // Consent check — mirror the API route's explicit check
  const { data: hasConsent } = await supabase.rpc("has_visibility_consent", {
    p_class_id: classId,
    p_student_id: studentId,
  });

  if (!hasConsent) {
    return (
      <main style={{ maxWidth: 960, margin: "0 auto", padding: "40px 24px" }}>
        <div style={{ marginBottom: 16, fontSize: 13, color: "#6b7280" }}>
          <Link href={`/class/${classId}`} style={{ color: "#7c3aed", textDecoration: "none" }}>
            ← Back to roster
          </Link>
        </div>
        <div
          style={{
            background: "#fef3c7",
            border: "1px solid #fcd34d",
            borderRadius: 12,
            padding: "32px 28px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            maxWidth: 520,
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 700, color: "#92400e" }}>
            ⚠ Visibility not granted
          </div>
          <p style={{ margin: 0, fontSize: 14, color: "#78350f", lineHeight: 1.6 }}>
            This student has not consented to teacher visibility. No session data
            is available until the student opts in.
          </p>
        </div>
      </main>
    );
  }

  // Fetch session owned by this student in this class
  const { data: sessionRow } = await supabase
    .from("sessions")
    .select("id, project_idea, blueprint_json, created_at, finalized_at")
    .eq("user_id", studentId)
    .eq("class_id", classId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!sessionRow) {
    return (
      <main style={{ maxWidth: 960, margin: "0 auto", padding: "40px 24px" }}>
        <div style={{ marginBottom: 16, fontSize: 13 }}>
          <Link href={`/class/${classId}`} style={{ color: "#7c3aed", textDecoration: "none" }}>
            ← Back to roster
          </Link>
        </div>
        <p style={{ color: "#6b7280", fontSize: 14 }}>No session found for this student.</p>
      </main>
    );
  }

  const sessionId = (sessionRow as { id: string }).id;

  // Parallel data fetch
  const [nodesRes, eventsRes, snapshotRes] = await Promise.all([
    supabase
      .from("concept_nodes")
      .select("id, name, mastery_score, struggle_pattern")
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

  const conceptNodes = (nodesRes.data ?? []) as ConceptNode[];
  const recentEvents = (eventsRes.data ?? []) as EventRow[];
  const snapshotCount = snapshotRes.count ?? 0;

  const studentName =
    (studentUser as { email: string; display_name: string | null } | null)
      ?.display_name ??
    (studentUser as { email: string } | null)?.email ??
    "Student";

  const projectTitle =
    (sessionRow as { project_idea?: string }).project_idea ?? "Untitled project";

  return (
    <main style={{ maxWidth: 1040, margin: "0 auto", padding: "40px 24px" }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: 8, fontSize: 13, color: "#6b7280" }}>
        <Link href="/class" style={{ color: "#7c3aed", textDecoration: "none" }}>
          My Classes
        </Link>
        {" / "}
        <Link href={`/class/${classId}`} style={{ color: "#7c3aed", textDecoration: "none" }}>
          {(cls as { name: string }).name}
        </Link>
        {" / "}
        <span>{studentName}</span>
      </div>

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#111827" }}>
          {studentName}
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>
          {projectTitle}
          {" · "}
          Started {new Date((sessionRow as { created_at: string }).created_at).toLocaleDateString()}
        </p>
      </div>

      <StudentSessionView
        sessionId={sessionId}
        conceptNodes={conceptNodes}
        recentEvents={recentEvents}
        snapshotCount={snapshotCount}
        teacherToken={authSession.access_token}
      />
    </main>
  );
}
