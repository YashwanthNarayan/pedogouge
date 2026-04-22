import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";

// Full camera + QR scanning implemented in T1-15.
// This stub shows the UI frame and permission request path.

export default function ScanTab() {
  const [permissionRequested, setPermissionRequested] = useState(false);

  return (
    <View style={styles.container}>
      <View style={styles.frame}>
        <Ionicons name="scan-outline" size={120} color="#4f46e5" />
      </View>
      <Text style={styles.title}>Scan a Credential QR</Text>
      <Text style={styles.subtitle}>
        Point your camera at a Pedagogue credential QR code to verify it offline.
      </Text>
      {!permissionRequested ? (
        <TouchableOpacity
          style={styles.button}
          onPress={() => setPermissionRequested(true)}
        >
          <Text style={styles.buttonText}>Enable Camera</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.permNote}>Camera permission UI — full scanner in T1-15</Text>
      )}
      <Text style={styles.stub}>(T1-15 — expo-barcode-scanner + Ed25519 offline verify)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#f9fafb" },
  frame: {
    width: 200,
    height: 200,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: "#4f46e5",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 32,
    backgroundColor: "#ede9fe",
  },
  title: { fontSize: 22, fontWeight: "700", color: "#111827", marginBottom: 8 },
  subtitle: { fontSize: 15, color: "#6b7280", textAlign: "center", marginBottom: 24, lineHeight: 22 },
  button: { backgroundColor: "#4f46e5", paddingHorizontal: 28, paddingVertical: 12, borderRadius: 10 },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  permNote: { marginTop: 12, fontSize: 13, color: "#9ca3af" },
  stub: { marginTop: 32, fontSize: 11, color: "#d1d5db" },
});
