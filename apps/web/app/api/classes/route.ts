import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTeacher, extractBearer, authErrorResponse } from "@/lib/teacher/middleware";
import { rateLimit } from "@/lib/rate-limit";

const CreateClassBody = z.object({
  name: z.string().min(3).max(100),
  githubClassroomUrl: z.string().url().optional(),
});

export async function POST(req: NextRequest) {
  let ctx;
  try {
    ctx = await requireTeacher(extractBearer(req.headers.get("authorization")));
  } catch (err) {
    return authErrorResponse(err);
  }

  const { userId, supabase } = ctx;

  const rl = await rateLimit(userId, "api");
  if (!rl.success) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CreateClassBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { name, githubClassroomUrl } = parsed.data;

  const { data: cls, error: clsErr } = await supabase
    .from("classes")
    .insert({ teacher_id: userId, name, github_classroom_url: githubClassroomUrl ?? null })
    .select("id, name")
    .single();

  if (clsErr || !cls) {
    return NextResponse.json({ error: clsErr?.message ?? "Insert failed" }, { status: 500 });
  }

  const classId = (cls as { id: string; name: string }).id;

  // Add the teacher as a class member so requireTeacher classIds includes this class
  await supabase
    .from("class_memberships")
    .insert({ class_id: classId, user_id: userId, role: "teacher" });

  return NextResponse.json(
    { classId, name: (cls as { id: string; name: string }).name },
    { status: 201 },
  );
}

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
