// Canonical Supabase Realtime channel names — shared by extension, web, and y-websocket
export const Channels = {
  conceptNodes: (sessionId: string) => `concept_nodes:${sessionId}`,
  events: (sessionId: string) => `events:${sessionId}`,
  interventions: (sessionId: string) => `interventions:${sessionId}`,
  edits: (sessionId: string) => `edits:${sessionId}`,
  nudges: (sessionId: string) => `nudge:${sessionId}`,
  execution: (runId: string) => `execution:${runId}`,
  presence: (sessionId: string) => `presence:${sessionId}`,
  snapshots: (sessionId: string) => `snapshots:${sessionId}`,
} as const;

export type ChannelName = ReturnType<(typeof Channels)[keyof typeof Channels]>;
