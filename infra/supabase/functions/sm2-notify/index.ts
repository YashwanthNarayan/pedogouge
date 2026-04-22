// Supabase Edge Function: sm2-notify
// Triggered daily at 08:00 UTC via pg_cron.
//
// To register the schedule, run this SQL once after deploying:
//   SELECT cron.schedule(
//     'sm2-notify',
//     '0 8 * * *',
//     $$SELECT net.http_post(
//       url := current_setting('app.supabase_functions_endpoint') || '/sm2-notify',
//       headers := jsonb_build_object(
//         'Content-Type', 'application/json',
//         'Authorization', 'Bearer ' || current_setting('app.service_role_key')
//       ),
//       body := '{}'::jsonb
//     )$$
//   );

import { createClient } from "@supabase/supabase-js";
import { Expo, type ExpoPushMessage, type ExpoPushTicket } from "expo-server-sdk";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const expo = new Expo({
  accessToken: Deno.env.get("EXPO_ACCESS_TOKEN"),
});

Deno.serve(async (_req: Request): Promise<Response> => {
  try {
    const now = new Date().toISOString();

    // Step 1: Find all users with at least one due item
    const { data: dueRows, error: dueErr } = await supabase
      .from("sm2_schedule")
      .select("user_id, concept_id")
      .lte("next_due_at", now);

    if (dueErr) {
      console.error("[sm2-notify] Failed to fetch due rows:", dueErr.message);
      return new Response(JSON.stringify({ error: dueErr.message }), { status: 500 });
    }

    if (!dueRows || dueRows.length === 0) {
      console.log("[sm2-notify] No due items found.");
      return new Response(JSON.stringify({ sent: 0, users: 0 }), { status: 200 });
    }

    // Group by user_id to count due items per user
    const dueByUser = new Map<string, number>();
    for (const row of dueRows) {
      const uid = row.user_id as string;
      dueByUser.set(uid, (dueByUser.get(uid) ?? 0) + 1);
    }

    const userIds = Array.from(dueByUser.keys());

    // Step 2: Fetch push tokens for those users
    const { data: tokenRows, error: tokenErr } = await supabase
      .from("push_tokens")
      .select("user_id, token")
      .in("user_id", userIds);

    if (tokenErr) {
      console.error("[sm2-notify] Failed to fetch tokens:", tokenErr.message);
      return new Response(JSON.stringify({ error: tokenErr.message }), { status: 500 });
    }

    if (!tokenRows || tokenRows.length === 0) {
      console.log("[sm2-notify] No push tokens registered for due users.");
      return new Response(JSON.stringify({ sent: 0, users: userIds.length }), { status: 200 });
    }

    // Step 3: Build Expo push messages
    const messages: ExpoPushMessage[] = [];
    for (const { user_id: userId, token } of tokenRows) {
      if (!Expo.isExpoPushToken(token as string)) {
        console.warn(`[sm2-notify] Skipping invalid token: ${token}`);
        continue;
      }
      const count = dueByUser.get(userId as string) ?? 0;
      messages.push({
        to: token as string,
        sound: "default",
        title: "Time to review",
        body: `${count} concept${count !== 1 ? "s" : ""} due for review`,
        data: { screen: "due", userId },
      });
    }

    if (messages.length === 0) {
      return new Response(JSON.stringify({ sent: 0, users: userIds.length }), { status: 200 });
    }

    // Step 4: Send in chunks (Expo SDK handles chunking internally)
    const chunks = expo.chunkPushNotifications(messages);
    const tickets: ExpoPushTicket[] = [];

    for (const chunk of chunks) {
      const chunkTickets = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...chunkTickets);
    }

    // Step 5: Handle DeviceNotRegistered errors — delete stale tokens
    const staleTokens: string[] = [];
    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      if (
        ticket.status === "error" &&
        ticket.details?.error === "DeviceNotRegistered"
      ) {
        const staleToken = messages[i]?.to;
        if (staleToken) staleTokens.push(staleToken as string);
      }
    }

    if (staleTokens.length > 0) {
      const { error: deleteErr } = await supabase
        .from("push_tokens")
        .delete()
        .in("token", staleTokens);
      if (deleteErr) {
        console.error("[sm2-notify] Failed to delete stale tokens:", deleteErr.message);
      } else {
        console.log(`[sm2-notify] Deleted ${staleTokens.length} stale token(s).`);
      }
    }

    const sentCount = tickets.filter((t) => t.status === "ok").length;
    console.log(
      `[sm2-notify] Sent ${sentCount} notification(s) to ${userIds.length} user(s).`,
    );

    return new Response(
      JSON.stringify({ sent: sentCount, users: userIds.length }),
      { status: 200 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sm2-notify] Unexpected error:", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
});
