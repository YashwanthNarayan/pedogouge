import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
} from "react-native";
import { useEffect, useState, useCallback } from "react";
import { useSupabase } from "../../providers/SupabaseProvider";

type DueItem = {
  conceptId: string;
  conceptName: string;
  nextDueAt: string;
  ease: number;
  intervalDays: number;
};

const GRADES: { label: string; value: number }[] = [
  { label: "😢", value: 0 },
  { label: "🤔", value: 1 },
  { label: "😐", value: 2 },
  { label: "🙂", value: 3 },
  { label: "😊", value: 4 },
  { label: "🎉", value: 5 },
];

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

export default function DueTab() {
  const { session, user, loading: authLoading } = useSupabase();
  const [items, setItems] = useState<DueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [grading, setGrading] = useState<DueItem | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchDue = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/sm2/due?userId=${encodeURIComponent(user.id)}`, {
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {},
      });
      if (res.ok) {
        const data = (await res.json()) as { items: DueItem[] };
        setItems(data.items ?? []);
      }
    } catch {
      // Network error — fall through to empty state
    } finally {
      setLoading(false);
    }
  }, [user, session]);

  useEffect(() => {
    void fetchDue();
  }, [fetchDue]);

  const submitGrade = useCallback(
    async (conceptId: string, grade: number) => {
      setSubmitting(true);
      try {
        await fetch(`${API_URL}/api/sm2/mark-reviewed`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(session?.access_token
              ? { Authorization: `Bearer ${session.access_token}` }
              : {}),
          },
          body: JSON.stringify({ conceptId, grade }),
        });
        setGrading(null);
        await fetchDue();
      } catch {
        // Silently swallow — student can retry
      } finally {
        setSubmitting(false);
      }
    },
    [session, fetchDue],
  );

  const daysOverdue = (nextDueAt: string) => {
    const diff = Math.floor((Date.now() - new Date(nextDueAt).getTime()) / 86_400_000);
    return diff > 0 ? `${diff}d overdue` : "Due today";
  };

  if (authLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.center}>
        <Text style={styles.emoji}>📚</Text>
        <Text style={styles.title}>Review Queue</Text>
        <Text style={styles.subtitle}>Sign in to track your reviews</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4f46e5" />
        <Text style={styles.loadingText}>Loading due concepts…</Text>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emoji}>🎉</Text>
        <Text style={styles.title}>All caught up!</Text>
        <Text style={styles.subtitle}>Check back tomorrow.</Text>
      </View>
    );
  }

  return (
    <>
      <FlatList
        data={items}
        keyExtractor={(item) => item.conceptId}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => setGrading(item)}
            accessibilityLabel={`Review ${item.conceptName}`}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.conceptName}</Text>
              <Text style={styles.overdue}>{daysOverdue(item.nextDueAt)}</Text>
            </View>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  { width: `${Math.min(100, Math.round(item.ease * 20))}%` as `${number}%` },
                ]}
              />
            </View>
            <Text style={styles.cardMeta}>
              Interval: {item.intervalDays}d · Ease: {item.ease.toFixed(2)}
            </Text>
          </TouchableOpacity>
        )}
      />

      <Modal
        visible={grading !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setGrading(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>How well did you know it?</Text>
            <Text style={styles.modalConcept}>{grading?.conceptName}</Text>
            <View style={styles.gradeRow}>
              {GRADES.map(({ label, value }) => (
                <TouchableOpacity
                  key={value}
                  style={styles.gradeBtn}
                  disabled={submitting}
                  onPress={() => grading && void submitGrade(grading.conceptId, value)}
                >
                  <Text style={styles.gradeEmoji}>{label}</Text>
                  <Text style={styles.gradeValue}>{value}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {submitting && <ActivityIndicator style={styles.spinner} color="#4f46e5" />}
            <TouchableOpacity onPress={() => setGrading(null)} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  emoji: { fontSize: 40, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 8, color: "#111" },
  subtitle: { fontSize: 15, color: "#6b7280", textAlign: "center" },
  loadingText: { marginTop: 12, color: "#6b7280", fontSize: 14 },
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
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  cardTitle: { fontSize: 16, fontWeight: "600", color: "#1f2937", flex: 1, marginRight: 8 },
  overdue: { fontSize: 12, color: "#dc2626", fontWeight: "600" },
  barTrack: { height: 6, backgroundColor: "#e5e7eb", borderRadius: 3, marginBottom: 6 },
  barFill: { height: 6, backgroundColor: "#4f46e5", borderRadius: 3 },
  cardMeta: { fontSize: 12, color: "#9ca3af" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#111", marginBottom: 4 },
  modalConcept: { fontSize: 14, color: "#6b7280", marginBottom: 20 },
  gradeRow: { flexDirection: "row", justifyContent: "space-between" },
  gradeBtn: { alignItems: "center", padding: 8 },
  gradeEmoji: { fontSize: 28 },
  gradeValue: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  spinner: { marginTop: 12 },
  cancelBtn: { marginTop: 16, alignItems: "center" },
  cancelText: { color: "#6b7280", fontSize: 15 },
});
