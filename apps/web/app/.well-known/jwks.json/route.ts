import { NextResponse } from "next/server";
import { getSigningKeys, exportJWK, KEY_ID } from "@/lib/credential/keys";

export const runtime = "edge";

export async function GET() {
  try {
    const { publicKey } = await getSigningKeys();
    const jwk = await exportJWK(publicKey);

    return NextResponse.json(
      {
        keys: [
          {
            ...jwk,
            kid: KEY_ID,
            use: "sig",
            alg: "EdDSA",
          },
        ],
      },
      {
        headers: {
          "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
          "Content-Type": "application/json",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "JWKS not available — signing keys not configured" },
      { status: 503 },
    );
  }
}
