import React, { createContext, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
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

export function SupabaseProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  return (
    <SupabaseContext.Provider value={{ session, user: session?.user ?? null, loading }}>
      {children}
    </SupabaseContext.Provider>
  );
}
