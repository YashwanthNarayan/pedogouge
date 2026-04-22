import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { CredentialIssueRequest } from "@pedagogue/shared";
import type { VerifiableCredentialSubject } from "@pedagogue/shared";
import { buildVC } from "@/lib/credential/builder";
import { signVC } from "@/lib/credential/sign";
import { getSigningKeys, KEY_ID } from "@/lib/credential/keys";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CredentialIssueRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { sessionId } = parsed.data;
  const supabase = getServiceClient();

  // Fetch session
  const { data: session, error: sessionErr } = await supabase
    .from("sessions")
    .select("id, project_idea")
    .eq("id", sessionId)
    .single();

  if (sessionErr || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Check defense is complete
  const { data: defenseSession } = await supabase
    .from("defense_sessions")
    .select("overall_rubric_json, phase")
    .eq("session_id", sessionId)
    .eq("phase", "complete")
    .maybeSingle();

  if (!defenseSession) {
    return NextResponse.json(
      { error: "Defense not complete — credential cannot be issued yet" },
      { status: 422 },
    );
  }

  // Concept mastery
  const { data: concepts } = await supabase
    .from("concept_nodes")
    .select("id, name, mastery_score")
    .eq("session_id", sessionId)
    .order("mastery_score", { ascending: false });

  const rubric = (defenseSession.overall_rubric_json ?? {}) as {
    correctness?: number;
    reasoningDepth?: number;
    tradeoffAwareness?: number;
    phases?: Array<{ phase: string; questions: number }>;
    proofOfStruggle?: Array<{
      errorSignature: string;
      fixDiff: string;
      defenseAnswerId: string;
    }>;
    competencyRadar?: Record<string, number>;
  };

  const subject: VerifiableCredentialSubject = {
    projectTitle: session.project_idea,
    conceptsDemonstrated: (concepts ?? []).map((c) => ({
      id: c.id as string,
      name: c.name as string,
      masteryScore: c.mastery_score as number,
    })),
    competencyRadar: rubric.competencyRadar ?? {},
    proofOfStruggle: rubric.proofOfStruggle ?? [],
    interviewSummary: {
      phases: rubric.phases ?? [],
      overallRubric: {
        correctness: rubric.correctness ?? 0,
        reasoningDepth: rubric.reasoningDepth ?? 0,
        tradeoffAwareness: rubric.tradeoffAwareness ?? 0,
      },
    },
  };

  // Assign a sequential status list index (count of existing credentials)
  let statusListIndex: number | undefined;
  try {
    const { count } = await supabase
      .from("credentials")
      .select("id", { count: "exact", head: true });
    if (typeof count === "number") statusListIndex = count;
  } catch {
    // Non-critical — credential issuance proceeds without a status list index
  }

  // Build + sign
  let jwt: string;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://pedagogue.app";
  try {
    const { privateKey } = await getSigningKeys();
    const vcDocument = buildVC(subject, sessionId, statusListIndex);
    jwt = await signVC(vcDocument, privateKey);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Signing failed";
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  const vcDocument = buildVC(subject, sessionId, statusListIndex);
  const vcJson = {
    ...vcDocument,
    proof: {
      type: "JsonWebSignature2020",
      created: new Date().toISOString(),
      verificationMethod: `${appUrl}/issuer#${KEY_ID}`,
      proofPurpose: "assertionMethod",
      jws: jwt,
    },
  };

  // Persist
  const { data: stored, error: insertErr } = await supabase
    .from("credentials")
    .insert({
      session_id: sessionId,
      jwt,
      radar_json: subject.competencyRadar,
      proof_of_struggle_json: subject.proofOfStruggle,
      vc_json: vcJson,
      ...(statusListIndex !== undefined
        ? { status_list_index: statusListIndex, status_list_id: "default" }
        : {}),
    })
    .select("id")
    .single();

  if (insertErr || !stored) {
    return NextResponse.json({ error: "Failed to persist credential" }, { status: 500 });
  }

  // Audit entry
  await supabase.from("credential_audit").insert({
    credential_id: stored.id,
    action: "issued",
    signer_kid: KEY_ID,
  });

  return NextResponse.json({
    credentialId: stored.id,
    credentialUrl: `${appUrl}/credential/${stored.id}`,
    id: stored.id,
    vcJson,
    jwt,
  });
}
