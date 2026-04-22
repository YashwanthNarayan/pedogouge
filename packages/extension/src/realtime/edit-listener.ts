import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { Channels } from "@pedagogue/shared";

export class EditListener {
  private _supabase: SupabaseClient | undefined;
  private _channel: RealtimeChannel | undefined;

  constructor(
    private readonly _supabaseUrl: string,
    private readonly _supabaseAnonKey: string,
    private readonly _getSessionId: () => string | undefined,
    private readonly _onEdit: (jwt: string) => Promise<void>,
  ) {}

  start(): void {
    const sessionId = this._getSessionId();
    if (!sessionId || !this._supabaseUrl || !this._supabaseAnonKey) return;

    this._supabase = createClient(this._supabaseUrl, this._supabaseAnonKey);

    this._channel = this._supabase
      .channel(Channels.edits(sessionId))
      .on(
        "broadcast",
        { event: "inject_bug" },
        ({ payload }: { payload: unknown }) => {
          const jwt = (payload as { jwt?: string })?.jwt;
          if (!jwt) return;
          this._onEdit(jwt).catch((err: Error) => {
            console.error("[EditListener] applySignedEdit failed:", err.message);
          });
        },
      )
      .subscribe();
  }

  stop(): void {
    if (this._channel) {
      void this._channel.unsubscribe();
      this._channel = undefined;
    }
    this._supabase = undefined;
  }
}
