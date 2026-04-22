import { redirect } from "next/navigation";
import { createCookieClient } from "@/lib/teacher/middleware";
import { ClassCard, type ClassInfo } from "@/components/teacher/ClassCard";

export const dynamic = "force-dynamic";

export default async function ClassListPage() {
  const supabase = await createCookieClient();

  // Confirm authenticated + teacher role
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: userRow } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!userRow || (userRow as { role: string }).role !== "teacher") {
    redirect("/");
  }

  // Classes this teacher owns with student count
  const { data: rawClasses } = await supabase
    .from("classes")
    .select("id, name, github_classroom_url, created_at, class_memberships(count)")
    .eq("teacher_id", user.id);

  const classes: ClassInfo[] = (rawClasses ?? []).map((cls: Record<string, unknown>) => ({
    id: cls.id as string,
    name: cls.name as string,
    studentCount:
      ((cls.class_memberships as Array<{ count: number }>)[0]?.count ?? 0),
    createdAt: cls.created_at as string,
  }));

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "40px 24px" }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: "#111827" }}>
          My Classes
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: 14, color: "#6b7280" }}>
          Select a class to view the student roster.
        </p>
      </div>

      {classes.length === 0 ? (
        <div
          style={{
            background: "#f9fafb",
            border: "1px dashed #d1d5db",
            borderRadius: 12,
            padding: "48px 24px",
            textAlign: "center",
            color: "#6b7280",
            fontSize: 14,
          }}
        >
          No classes yet. Create one to get started.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 16,
          }}
        >
          {classes.map((cls) => (
            <ClassCard key={cls.id} cls={cls} />
          ))}
        </div>
      )}
    </main>
  );
}
