import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { Platform } from "react-native";
import { supabase } from "../lib/supabase";

type SupabaseContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
};

const SupabaseContext = createContext<SupabaseContextValue>({
  session: null,
  user: null,
  loading: true,
});

export function useSupabase(): SupabaseContextValue {
  return useContext(SupabaseContext);
}

// Show notifications when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

async function _registerPushToken(userId: string): Promise<void> {
  if (!Device.isDevice) return; // simulators can't receive push

  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") return;

  // Android needs a notification channel
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId =
    (Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.eas?.projectId as
      | string
      | undefined;

  let token: string;
  try {
    const result = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    token = result.data;
  } catch {
    return; // non-fatal — push is a nice-to-have
  }

  const platform = Platform.OS === "ios" ? "ios" : "android";
  await supabase.from("push_tokens").upsert(
    { user_id: userId, token, platform },
    { onConflict: "user_id, token", ignoreDuplicates: true },
  );
}

export function SupabaseProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const notifResponseSub = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === "SIGNED_IN" && newSession?.user) {
        void _registerPushToken(newSession.user.id);
      }
    });

    // Navigate to due tab when student taps an SM-2 reminder notification
    notifResponseSub.current = Notifications.addNotificationResponseReceivedListener(() => {
      router.push("/(tabs)/due");
    });

    return () => {
      listener.subscription.unsubscribe();
      notifResponseSub.current?.remove();
    };
  }, []);

  return (
    <SupabaseContext.Provider value={{ session, user: session?.user ?? null, loading }}>
      {children}
    </SupabaseContext.Provider>
  );
}
