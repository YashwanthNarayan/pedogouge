import { View, Text, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useState } from "react";
import { useRouter } from "expo-router";
import { verifyCredentialOffline } from "../../lib/verify";

const API_URL =
  (process.env.EXPO_PUBLIC_API_URL as string | undefined) ?? "https://pedagogue.app";

export default function ScanTab() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const router = useRouter();

  // Permission not yet determined
  if (!permission) {
    return <View style={styles.permContainer} />;
  }

  // Camera not granted — show enable prompt
  if (!permission.granted) {
    return (
      <View style={styles.permContainer}>
        <Text style={styles.title}>Scan a Credential QR</Text>
        <Text style={styles.subtitle}>
          Camera access is needed to scan QR codes.
        </Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Enable Camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  async function _onBarcodeScanned({ data }: { data: string }): Promise<void> {
    if (scanned) return;
    setScanned(true);

    if (data.startsWith("eyJ")) {
      // Raw JWT credential — verify offline
      const result = await verifyCredentialOffline(data, API_URL);
      Alert.alert(
        result.valid ? "✅ Valid credential" : "❌ Invalid credential",
        result.valid
          ? "Signature verified offline with Pedagogue public key."
          : `Verification failed: ${result.error ?? "unknown"}`,
        [{ text: "Scan again", onPress: () => setScanned(false) }],
      );
    } else if (data.startsWith("http")) {
      // URL-based credential — extract id and navigate
      const match = data.match(/\/credential\/([a-f0-9-]{36})/);
      if (match?.[1]) {
        router.push(`/credential/${match[1]}`);
        setScanned(false);
      } else {
        Alert.alert(
          "Unrecognized QR",
          "This QR code does not look like a Pedagogue credential.",
          [{ text: "Scan again", onPress: () => setScanned(false) }],
        );
      }
    } else {
      Alert.alert(
        "Unrecognized QR",
        "This QR code does not look like a Pedagogue credential.",
        [{ text: "Scan again", onPress: () => setScanned(false) }],
      );
    }
  }

  return (
    <View style={styles.cameraContainer}>
      <CameraView
        style={StyleSheet.absoluteFill}
        barCodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={_onBarcodeScanned}
      />
      <View style={styles.overlay}>
        <View style={styles.frame} />
        <Text style={styles.hint}>Point at a Pedagogue credential QR code</Text>
        {scanned && (
          <TouchableOpacity style={styles.button} onPress={() => setScanned(false)}>
            <Text style={styles.buttonText}>Scan again</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  permContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#f9fafb",
  },
  cameraContainer: { flex: 1 },
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  frame: {
    width: 240,
    height: 240,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: "#fff",
    marginBottom: 24,
  },
  title: { fontSize: 22, fontWeight: "700", color: "#111827", marginBottom: 8 },
  subtitle: {
    fontSize: 15,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 22,
  },
  hint: { color: "#fff", fontSize: 15, textAlign: "center", marginBottom: 20 },
  button: {
    backgroundColor: "#4f46e5",
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 10,
  },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
