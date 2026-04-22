import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTeacher, extractBearer, authErrorResponse } from "@/lib/teacher/middleware";
import { rateLimit } from "@/lib/rate-limit";

const AddMemberBody = z.object({
  studentEmail: z.string().email(),
});

const RemoveMemberBody = z.object({
  userId: z.string().uuid(),
});

type RouteParams = { params: Promise<{ classId: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { classId } = await params;

  let ctx;
  try {
    ctx = await requireTeacher(extractBearer(req.headers.get("authorization")));
  } catch (err) {
    return authErrorResponse(err);
  }

  const { userId, classIds, supabase } = ctx;

  if (!classIds.includes(classId)) {
    return NextResponse.json({ error: "Class not found or not owned by this teacher" }, { status: 404 });
  }

  const rl = await rateLimit(userId, "api");
  if (!rl.success) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = AddMemberBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { studentEmail } = parsed.data;

  // Look up user by email
  const { data: student, error: lookupErr } = await supabase
    .from("users")
    .select("id, email")
    .eq("email", studentEmail)
    .single();

  if (lookupErr || !student) {
    return NextResponse.json({ error: "No user with that email" }, { status: 404 });
  }

  const studentId = (student as { id: string; email: string }).id;

  // Check for existing membership
  const { data: existing } = await supabase
    .from("class_memberships")
    .select("user_id")
    .eq("class_id", classId)
    .eq("user_id", studentId)
    .single();

  if (existing) {
    return NextResponse.json({ error: "Already in this class" }, { status: 409 });
  }

  const { error: insertErr } = await supabase
    .from("class_memberships")
    .insert({ class_id: classId, user_id: studentId, role: "student" });

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json(
    { userId: studentId, email: studentEmail },
    { status: 201 },
  );
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { classId } = await params;

  let ctx;
  try {
    ctx = await requireTeacher(extractBearer(req.headers.get("authorization")));
  } catch (err) {
    return authErrorResponse(err);
  }

  const { classIds, supabase } = ctx;

  if (!classIds.includes(classId)) {
    return NextResponse.json({ error: "Class not found or not owned by this teacher" }, { status: 404 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = RemoveMemberBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { userId: targetUserId } = parsed.data;

  const { error } = await supabase
    .from("class_memberships")
    .delete()
    .eq("class_id", classId)
    .eq("user_id", targetUserId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ removed: true });
}
