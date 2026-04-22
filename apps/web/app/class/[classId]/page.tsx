import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createCookieClient } from "@/lib/teacher/middleware";
import { StudentRoster, type StudentRow } from "@/components/teacher/StudentRoster";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ classId: string }>;
}

export default async function ClassPage({ params }: Props) {
  const { classId } = await params;
  const supabase = await createCookieClient();

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: userRow } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!userRow || (userRow as { role: string }).role !== "teacher") redirect("/");

  // Verify teacher owns this class
  const { data: cls } = await supabase
    .from("classes")
    .select("id, name")
    .eq("id", classId)
    .eq("teacher_id", user.id)
    .single();

  if (!cls) notFound();

  // Students with consent + latest session info
  const { data: memberships, error } = await supabase
    .from("class_memberships")
    .select(`
      user_id,
      visibility_accepted_at,
      visibility_revoked_at,
      users!inner(id, email, display_name),
      sessions(id, created_at, concept_nodes(mastery_score))
    `)
    .eq("class_id", classId)
    .neq("role", "teacher")
    .neq("role", "ta");

  if (error) {
    return (
      <main style={{ maxWidth: 960, margin: "0 auto", padding: "40px 24px" }}>
        <p style={{ color: "#dc2626" }}>Failed to load students: {error.message}</p>
      </main>
    );
  }

  const students: StudentRow[] = (memberships ?? []).map((m: Record<string, unknown>) => {
    const u = m.users as { id: string; email: string; display_name: string | null };
    const sessions = (m.sessions as Array<{
      id: string;
      created_at: string;
      concept_nodes: Array<{ mastery_score: number }>;
    }>) ?? [];

    const latest = sessions.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )[0];

    const allNodes = sessions.flatMap((s) => s.concept_nodes ?? []);
    const masteryAvg =
      allNodes.length > 0
        ? allNodes.reduce((s, n) => s + n.mastery_score, 0) / allNodes.length
        : null;

    return {
      userId: u.id,
      email: u.email,
      displayName: u.display_name,
      sessionId: latest?.id ?? null,
      lastActive: latest?.created_at ?? null,
      masteryAvg: masteryAvg !== null ? Math.round(masteryAvg * 100) / 100 : null,
      consentGiven:
        m.visibility_accepted_at !== null && m.visibility_revoked_at === null,
    };
  });

  return (
    <main style={{ maxWidth: 1040, margin: "0 auto", padding: "40px 24px" }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: 8, fontSize: 13, color: "#6b7280" }}>
        <Link href="/class" style={{ color: "#7c3aed", textDecoration: "none" }}>
          My Classes
        </Link>
        {" / "}
        <span>{(cls as { name: string }).name}</span>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 28,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#111827" }}>
            {(cls as { name: string }).name}
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>
            {students.length} student{students.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Roster */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #f3f4f6" }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#111827" }}>
            Student Roster
          </h2>
        </div>
        <div style={{ padding: "0 4px" }}>
          <StudentRoster students={students} classId={classId} />
        </div>
      </div>
    </main>
  );
}
