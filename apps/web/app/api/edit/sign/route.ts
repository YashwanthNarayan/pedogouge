import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTeacher, extractBearer, authErrorResponse } from "@/lib/teacher/middleware";
import { signEdit } from "@/lib/edit-signing";
import { getSigningKeys } from "@/lib/credential/keys";

const EditSignRequest = z.object({
  sessionId: z.string().uuid(),
  filePath: z.string().min(1),
  originalLine: z.string(),
  patchedLine: z.string(),
});

export async function POST(req: NextRequest) {
  // Teacher-only OR service-role (checked via X-Service-Role header in server-to-server calls)
  const isServiceRole = req.headers.get("x-service-role") === process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!isServiceRole) {
    let ctx;
    try {
      ctx = await requireTeacher(extractBearer(req.headers.get("authorization")));
    } catch (err) {
      return authErrorResponse(err);
    }
    void ctx; // auth verified; ctx unused beyond the guard
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = EditSignRequest.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { sessionId, filePath, originalLine, patchedLine } = parsed.data;

  let privateKey: CryptoKey;
  try {
    const keys = await getSigningKeys();
    privateKey = keys.privateKey;
  } catch {
    return NextResponse.json(
      { error: "Credential signing keys not configured. Set CREDENTIAL_PRIVATE_KEY_JWK." },
      { status: 503 },
    );
  }

  const jwt = await signEdit({ sessionId, filePath, originalLine, patchedLine }, privateKey);
  return NextResponse.json({ jwt });
}
