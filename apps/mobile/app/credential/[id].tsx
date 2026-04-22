import { View, Text, StyleSheet } from "react-native";
import { useLocalSearchParams } from "expo-router";

// Full implementation in T1-15 (credential viewer + offline verify)
export default function CredentialPage() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Credential</Text>
      <Text style={styles.id}>{id}</Text>
      <Text style={styles.stub}>(T1-15 stub — radar + proof-of-struggle + offline verify)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16 },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 8 },
  id: { fontSize: 12, color: "#555", marginBottom: 24, fontFamily: "monospace" },
  stub: { fontSize: 12, color: "#999", textAlign: "center" },
});
