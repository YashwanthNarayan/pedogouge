import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Fire-and-forget: log a teacher read to teacher_view_audit.
 * Never throws — log-and-continue pattern for route handlers.
 */
export async function logTeacherView(
  teacherId: string,
  studentId: string,
  sessionId: string | null,
  supabase: SupabaseClient,
  tableName = "sessions",
  rowsReturned = 1,
): Promise<void> {
  supabase
    .from("teacher_view_audit")
    .insert({
      teacher_id: teacherId,
      student_id: studentId,
      session_id: sessionId,
      table_read: tableName,
      rows_returned: rowsReturned,
    })
    .then(({ error }) => {
      if (error) console.error("[teacher_view_audit] insert failed:", error.message);
    });
}
