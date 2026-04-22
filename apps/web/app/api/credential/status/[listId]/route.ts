import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSigningKeys } from "@/lib/credential/keys";
import {
  getStatusListVC,
  buildStatusListVC,
  getOrCreateEncodedList,
} from "@/lib/credential/revocation";

export const runtime = "nodejs";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ listId: string }> },
) {
  const { listId } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getServiceClient() as any;

  // Try to serve the cached signed VC first
  const cached = await getStatusListVC(listId, supabase);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
    });
  }

  // No cached VC — build and sign one from the current encoded list
  try {
    const { privateKey } = await getSigningKeys();
    const encodedList = await getOrCreateEncodedList(listId, supabase);
    const vc = await buildStatusListVC(listId, encodedList, privateKey);

    // Persist the signed VC back to the DB so future requests are cached
    await supabase
      .from("status_lists")
      .update({ signed_vc_json: vc, updated_at: new Date().toISOString() })
      .eq("id", listId);

    return NextResponse.json(vc, {
      headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Status list unavailable";
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
