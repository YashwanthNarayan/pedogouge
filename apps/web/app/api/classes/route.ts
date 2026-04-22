import { NextRequest, NextResponse } from "next/server";
import { requireTeacher, extractBearer, authErrorResponse } from "@/lib/teacher/middleware";

export async function GET(req: NextRequest) {
  let ctx;
  try {
    ctx = await requireTeacher(extractBearer(req.headers.get("authorization")));
  } catch (err) {
    return authErrorResponse(err);
  }

  const { userId, supabase } = ctx;

  // Classes the teacher created, with student count
  const { data, error } = await supabase
    .from("classes")
    .select(`
      id,
      name,
      github_classroom_url,
      created_at,
      class_memberships(count)
    `)
    .eq("teacher_id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const classes = (data ?? []).map((cls: Record<string, unknown>) => ({
    id: cls.id,
    name: cls.name,
    githubClassroomUrl: cls.github_classroom_url,
    createdAt: cls.created_at,
    studentCount: (cls.class_memberships as Array<{ count: number }>)[0]?.count ?? 0,
  }));

  return NextResponse.json({ classes });
}
