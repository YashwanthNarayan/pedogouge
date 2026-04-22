import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";

const BASE_URL = "https://pedagogue.app";

// Static routes always included
const STATIC_ROUTES: MetadataRoute.Sitemap = [
  { url: BASE_URL, lastModified: new Date(), changeFrequency: "weekly", priority: 1.0 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return STATIC_ROUTES;
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Only surface credentials that are fully signed (have a JWS proof)
    const { data, error } = await supabase
      .from("credentials")
      .select("id, issued_at")
      .not("vc_json->proof", "is", null)
      .order("issued_at", { ascending: false })
      .limit(5000);

    if (error || !data) {
      return STATIC_ROUTES;
    }

    const credentialRoutes: MetadataRoute.Sitemap = data.map((row) => ({
      url: `${BASE_URL}/credential/${row.id}`,
      lastModified: row.issued_at ? new Date(row.issued_at) : new Date(),
      changeFrequency: "yearly" as const,
      priority: 0.7,
    }));

    return [...STATIC_ROUTES, ...credentialRoutes];
  } catch {
    return STATIC_ROUTES;
  }
}
