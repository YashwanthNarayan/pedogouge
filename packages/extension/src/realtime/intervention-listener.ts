import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { Channels } from "@pedagogue/shared";
import type { InterventionDecision } from "../intervention/panels";

export class InterventionListener {
  private _supabase: SupabaseClient | undefined;
  private _channel: RealtimeChannel | undefined;

  constructor(
    private readonly _supabaseUrl: string,
    private readonly _supabaseAnonKey: string,
    private readonly _getSessionId: () => string | undefined,
    private readonly _onIntervention: (d: InterventionDecision) => void,
  ) {}

  start(): void {
    const sessionId = this._getSessionId();
    if (!sessionId || !this._supabaseUrl || !this._supabaseAnonKey) return;

    this._supabase = createClient(this._supabaseUrl, this._supabaseAnonKey);

    this._channel = this._supabase
      .channel(Channels.interventions(sessionId))
      .on(
        "broadcast",
        { event: "intervention" },
        ({ payload }: { payload: unknown }) => {
          try {
            this._onIntervention(payload as InterventionDecision);
          } catch (err) {
            console.error("[InterventionListener] bad payload", err);
          }
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
