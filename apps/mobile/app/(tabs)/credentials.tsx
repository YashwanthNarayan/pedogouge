import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useSupabase } from "../../providers/SupabaseProvider";
import type { VerifiableCredentialSubject } from "@pedagogue/shared";

// Minimal shape returned by the Supabase credentials table (T1-15 wires the full query)
type CredentialRow = {
  id: string;
  issued_at: string;
  subject: VerifiableCredentialSubject;
};

export default function CredentialsTab() {
  const { session, loading: authLoading } = useSupabase();
  const [credentials, setCredentials] = useState<CredentialRow[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!session) return;
    // Full fetch implemented in T1-15; stub returns empty list
    setLoading(false);
  }, [session]);

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
        <Text style={styles.subtitle}>Complete a Pedagogue session to earn your first credential.</Text>
        <Text style={styles.stub}>(T1-15 — full implementation)</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={credentials}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push(`/credential/${item.id}`)}
        >
          <Text style={styles.cardTitle}>{item.subject.projectTitle}</Text>
          <Text style={styles.cardMeta}>{new Date(item.issued_at).toLocaleDateString()}</Text>
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 8, color: "#111" },
  subtitle: { fontSize: 15, color: "#6b7280", textAlign: "center", marginBottom: 16 },
  stub: { fontSize: 11, color: "#d1d5db" },
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
  cardMeta: { fontSize: 13, color: "#9ca3af" },
});
