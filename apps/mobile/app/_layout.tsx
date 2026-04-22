import { Stack } from "expo-router";
import { SupabaseProvider } from "../providers/SupabaseProvider";

export default function RootLayout() {
  return (
    <SupabaseProvider>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="credential/[id]" options={{ title: "Credential" }} />
      </Stack>
    </SupabaseProvider>
  );
}
