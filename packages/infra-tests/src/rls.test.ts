/**
 * RLS policy matrix tests (T3-02).
 *
 * Prerequisites:
 *   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY set
 *   - All migrations applied (supabase db push)
 *
 * If Supabase is not available (local dev, CI without DB), every test is skipped
 * so `pnpm test:rls` stays green until the project is provisioned.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  supabaseAvailable,
  serviceClient,
  userClient,
  createTestUser,
  cleanupTestUser,
  type TestUser,
} from "./helpers.js";

const skip = !supabaseAvailable;

describe("RLS policy matrix", () => {
  const svc = skip ? (null as never) : serviceClient();

  let studentA: TestUser;
  let studentB: TestUser;
  let teacher: TestUser;
  let classId: string;
  let sessionA: string; // session owned by studentA
  let sessionB: string; // session owned by studentB

  beforeAll(async () => {
    if (skip) return;

    studentA = await createTestUser(svc, "rls-student-a@test.pedagogue", "student");
    studentB = await createTestUser(svc, "rls-student-b@test.pedagogue", "student");
    teacher = await createTestUser(svc, "rls-teacher@test.pedagogue", "teacher");

    // Create class owned by teacher
    const { data: cls, error: clsErr } = await svc.from("classes").insert({
      teacher_id: teacher.id,
      name: "Test Class",
    }).select("id").single();
    if (clsErr) throw new Error(`class insert: ${clsErr.message}`);
    classId = cls.id;

    // Enroll teacher, studentA (with visibility consent), studentB (no consent)
    await svc.from("class_memberships").insert([
      { class_id: classId, user_id: teacher.id, role: "teacher" },
      {
        class_id: classId,
        user_id: studentA.id,
        role: "student",
        visibility_accepted_at: new Date().toISOString(),
        visibility_consent_version: "v1",
      },
      { class_id: classId, user_id: studentB.id, role: "student" },
    ]);

    // Create sessions for both students
    const { data: sA } = await svc.from("sessions").insert({
      user_id: studentA.id,
      class_id: classId,
      project_idea: "Test project A",
    }).select("id").single();
    sessionA = sA!.id;

    const { data: sB } = await svc.from("sessions").insert({
      user_id: studentB.id,
      class_id: classId,
      project_idea: "Test project B",
    }).select("id").single();
    sessionB = sB!.id;
  });

  afterAll(async () => {
    if (skip) return;
    // Cascade deletes handle sessions/memberships/classes
    await svc.from("classes").delete().eq("id", classId);
    await cleanupTestUser(svc, studentA.id);
    await cleanupTestUser(svc, studentB.id);
    await cleanupTestUser(svc, teacher.id);
  });

  // ── users ──────────────────────────────────────────────────────────────────

  it.skipIf(skip)("users: student sees own row", async () => {
    const client = userClient(studentA.accessToken);
    const { data } = await client.from("users").select("id");
    expect(data).toHaveLength(1);
    expect(data![0]!.id).toBe(studentA.id);
  });

  it.skipIf(skip)("users: student cannot see other users", async () => {
    const client = userClient(studentA.accessToken);
    const { data } = await client.from("users").select("id").eq("id", studentB.id);
    expect(data).toHaveLength(0);
  });

  // ── sessions ───────────────────────────────────────────────────────────────

  it.skipIf(skip)("sessions: student sees own session", async () => {
    const client = userClient(studentA.accessToken);
    const { data } = await client.from("sessions").select("id").eq("id", sessionA);
    expect(data).toHaveLength(1);
  });

  it.skipIf(skip)("sessions: student cannot see other student's session", async () => {
    const client = userClient(studentA.accessToken);
    const { data } = await client.from("sessions").select("id").eq("id", sessionB);
    expect(data).toHaveLength(0);
  });

  it.skipIf(skip)("sessions: teacher sees consented student session (A)", async () => {
    const client = userClient(teacher.accessToken);
    const { data } = await client.from("sessions").select("id").eq("id", sessionA);
    expect(data).toHaveLength(1);
  });

  it.skipIf(skip)("sessions: teacher cannot see non-consented student session (B)", async () => {
    const client = userClient(teacher.accessToken);
    const { data } = await client.from("sessions").select("id").eq("id", sessionB);
    expect(data).toHaveLength(0);
  });

  // ── concept_nodes ──────────────────────────────────────────────────────────

  it.skipIf(skip)("concept_nodes: student cannot see other session's nodes", async () => {
    // Insert a node in sessionA via service role
    await svc.from("concept_nodes").insert({
      id: "loops",
      session_id: sessionA,
      name: "For Loops",
      mastery_score: 0.5,
    });

    const client = userClient(studentB.accessToken);
    const { data } = await client
      .from("concept_nodes")
      .select("id")
      .eq("session_id", sessionA);
    expect(data).toHaveLength(0);
  });

  // ── kb_chunks ──────────────────────────────────────────────────────────────

  it.skipIf(skip)("kb_chunks: any authenticated user can read", async () => {
    // Insert a chunk via service role
    await svc.from("kb_chunks").insert({
      concept_id: "loops",
      body_md: "A for loop iterates over a sequence.",
      difficulty: "beginner",
    });

    const client = userClient(studentA.accessToken);
    const { data } = await client
      .from("kb_chunks")
      .select("id")
      .eq("concept_id", "loops")
      .limit(1);
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  // ── editor_snapshots ───────────────────────────────────────────────────────

  it.skipIf(skip)("editor_snapshots: student cannot read other's snapshots", async () => {
    await svc.from("editor_snapshots").insert({
      session_id: sessionA,
      files_json: {},
      prev_hash: "",
      this_hash: "abc123",
    });

    const client = userClient(studentB.accessToken);
    const { data } = await client
      .from("editor_snapshots")
      .select("id")
      .eq("session_id", sessionA);
    expect(data).toHaveLength(0);
  });

  // ── interventions ──────────────────────────────────────────────────────────

  it.skipIf(skip)("interventions: student cannot read other's interventions", async () => {
    await svc.from("interventions").insert({
      session_id: sessionA,
      concept_id: "loops",
      tier: 1,
      content_md: "Try again!",
    });

    const client = userClient(studentB.accessToken);
    const { data } = await client
      .from("interventions")
      .select("id")
      .eq("session_id", sessionA);
    expect(data).toHaveLength(0);
  });

  // ── sm2_schedule ───────────────────────────────────────────────────────────

  it.skipIf(skip)("sm2_schedule: student cannot read other's schedule", async () => {
    await svc.from("sm2_schedule").insert({
      user_id: studentA.id,
      concept_id: "loops",
      next_due_at: new Date().toISOString(),
    });

    const client = userClient(studentB.accessToken);
    const { data } = await client
      .from("sm2_schedule")
      .select("id")
      .eq("user_id", studentA.id);
    expect(data).toHaveLength(0);
  });

  // ── credentials ────────────────────────────────────────────────────────────

  it.skipIf(skip)("credentials: any authenticated user can read (public VC)", async () => {
    const { data: cred } = await svc.from("credentials").insert({
      session_id: sessionA,
      jwt: "dummy.jwt.token",
      vc_json: { type: "VerifiableCredential" },
    }).select("id").single();

    const client = userClient(studentB.accessToken);
    const { data } = await client
      .from("credentials")
      .select("id")
      .eq("id", cred!.id);
    expect(data).toHaveLength(1);
  });

  // ── teacher_view_audit ────────────────────────────────────────────────────

  it.skipIf(skip)("teacher_view_audit: student reads own audit rows only", async () => {
    await svc.from("teacher_view_audit").insert({
      teacher_id: teacher.id,
      student_id: studentA.id,
      table_read: "sessions",
      rows_returned: 1,
    });

    const clientA = userClient(studentA.accessToken);
    const { data: ownRows } = await clientA
      .from("teacher_view_audit")
      .select("id");
    expect((ownRows ?? []).length).toBeGreaterThan(0);

    const clientB = userClient(studentB.accessToken);
    const { data: otherRows } = await clientB
      .from("teacher_view_audit")
      .select("id")
      .eq("student_id", studentA.id);
    expect(otherRows).toHaveLength(0);
  });

  // ── user_memories ─────────────────────────────────────────────────────────

  it.skipIf(skip)("user_memories: student cannot read other's memories", async () => {
    await svc.from("user_memories").insert({
      user_id: studentA.id,
      key: "prior_session_summary",
      value_json: { text: "Learned loops" },
    });

    const client = userClient(studentB.accessToken);
    const { data } = await client
      .from("user_memories")
      .select("id")
      .eq("user_id", studentA.id);
    expect(data).toHaveLength(0);
  });

  // ── security_events: no user access ────────────────────────────────────────

  it.skipIf(skip)("security_events: authenticated users see 0 rows", async () => {
    await svc.from("security_events").insert({
      kind: "test",
      reason: "rls test",
    });

    const client = userClient(studentA.accessToken);
    const { data } = await client.from("security_events").select("id");
    expect(data).toHaveLength(0);
  });
});
