import { View, Text, FlatList, StyleSheet, ActivityIndicator } from "react-native";
import { useEffect, useState } from "react";
import { useSupabase } from "../../providers/SupabaseProvider";
import type { ConceptNode } from "@pedagogue/shared";

type DueItem = ConceptNode & { dueAt: string };

export default function DueTab() {
  const { session, loading: authLoading } = useSupabase();
  const [items, setItems] = useState<DueItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!session) return;
    // SM-2 spaced-repetition fetch implemented in T1-13; stub returns empty list
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
        <Text style={styles.title}>Review Queue</Text>
        <Text style={styles.subtitle}>Sign in to see concepts due for review.</Text>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emoji}>🎉</Text>
        <Text style={styles.title}>All caught up!</Text>
        <Text style={styles.subtitle}>No concepts due for review right now.</Text>
        <Text style={styles.stub}>(T1-13 — SM-2 implementation)</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{item.name}</Text>
            <Text style={[styles.badge, item.masteryScore < 0.4 ? styles.badgeLow : styles.badgeOk]}>
              {Math.round(item.masteryScore * 100)}%
            </Text>
          </View>
          <Text style={styles.cardMeta}>Due: {new Date(item.dueAt).toLocaleDateString()}</Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  emoji: { fontSize: 40, marginBottom: 12 },
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
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  cardTitle: { fontSize: 16, fontWeight: "600", color: "#1f2937", flex: 1 },
  cardMeta: { fontSize: 13, color: "#9ca3af" },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, fontSize: 12, fontWeight: "700", overflow: "hidden" },
  badgeLow: { backgroundColor: "#fee2e2", color: "#dc2626" },
  badgeOk: { backgroundColor: "#dcfce7", color: "#16a34a" },
});
