import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Share,
} from "react-native";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useSupabase } from "../../providers/SupabaseProvider";
import { supabase } from "../../lib/supabase";
import { verifyCredentialOffline } from "../../lib/verify";
import type { VerifiableCredentialSubject } from "@pedagogue/shared";

const API_URL =
  (process.env.EXPO_PUBLIC_API_URL as string | undefined) ?? "https://pedagogue.app";

type CredentialRow = {
  id: string;
  issued_at: string;
  jwt: string;
  vc_json: { credentialSubject?: VerifiableCredentialSubject } | null;
};

function _masteryColor(score: number): string {
  if (score >= 0.7) return "#10b981";
  if (score >= 0.4) return "#f59e0b";
  return "#ef4444";
}

function MasteryDots({ concepts }: { concepts: VerifiableCredentialSubject["conceptsDemonstrated"] }) {
  if (!concepts?.length) return null;
  return (
    <View style={styles.dots}>
      {concepts.slice(0, 8).map((c) => (
        <View
          key={c.id}
          style={[styles.dot, { backgroundColor: _masteryColor(c.masteryScore ?? 0) }]}
        />
      ))}
    </View>
  );
}

export default function CredentialsTab() {
  const { session, loading: authLoading } = useSupabase();
  const [credentials, setCredentials] = useState<CredentialRow[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    supabase
      .from("credentials")
      .select("id, issued_at, jwt, vc_json")
      .order("issued_at", { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setCredentials(data as CredentialRow[]);
        setLoading(false);
      });
  }, [session]);

  async function _handleVerify(row: CredentialRow): Promise<void> {
    const result = await verifyCredentialOffline(row.jwt, API_URL);
    Alert.alert(
      result.valid ? "✅ Valid credential" : "❌ Invalid credential",
      result.valid
        ? "Signature verified offline with Pedagogue public key."
        : `Verification failed: ${result.error ?? "unknown"}`,
    );
  }

  async function _handleShare(row: CredentialRow): Promise<void> {
    const url = `${API_URL}/credential/${row.id}`;
    await Share.share({ message: url, url });
  }

  if (authLoading || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Credentials</Text>
        <Text style={styles.subtitle}>Sign in to see your learning credentials.</Text>
      </View>
    );
  }

  if (credentials.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>No credentials yet</Text>
        <Text style={styles.subtitle}>
          Complete a Pedagogue session to earn your first credential.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={credentials}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => {
        const subject = item.vc_json?.credentialSubject;
        return (
          <View style={styles.card}>
            <TouchableOpacity onPress={() => router.push(`/credential/${item.id}`)}>
              <Text style={styles.cardTitle}>{subject?.projectTitle ?? "Credential"}</Text>
              <Text style={styles.cardMeta}>
                {new Date(item.issued_at).toLocaleDateString()}
              </Text>
              <MasteryDots concepts={subject?.conceptsDemonstrated ?? []} />
            </TouchableOpacity>
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => void _handleVerify(item)}
              >
                <Text style={styles.actionBtnText}>Verify offline</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.shareBtn]}
                onPress={() => void _handleShare(item)}
              >
                <Text style={styles.actionBtnText}>Share</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push(`/credential/${item.id}`)}>
                <Text style={styles.deepLink}>View full →</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 8, color: "#111" },
  subtitle: { fontSize: 15, color: "#6b7280", textAlign: "center" },
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: { fontSize: 16, fontWeight: "600", color: "#1f2937", marginBottom: 4 },
  cardMeta: { fontSize: 13, color: "#9ca3af", marginBottom: 8 },
  dots: { flexDirection: "row", gap: 6, marginBottom: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
  actionBtn: {
    backgroundColor: "#4f46e5",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  shareBtn: { backgroundColor: "#10b981" },
  actionBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  deepLink: { color: "#4f46e5", fontSize: 13, fontWeight: "600" },
});
