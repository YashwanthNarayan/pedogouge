import * as vscode from "vscode";
import type { ConceptNode } from "@pedagogue/shared";
import { createParticipantHandler } from "./chat/participant";
import { SecretStore } from "./auth/secrets";
import { PedagogueUriHandler, registerSetSessionId } from "./auth/uri-handler";
import { PedagogueAuthProvider } from "./auth/provider";
import { executeSignIn } from "./commands/sign-in";
import { executeSignOut } from "./commands/sign-out";
import { initParser, applyDocumentEdits, invalidateDocument } from "./ast";
import { runDiagnostics, clearDiagnostics, tutorCollection } from "./diagnostics/collection";
import { registerHoverProvider } from "./diagnostics/hover";
import { registerCodeActionsProvider } from "./diagnostics/actions";
import { PtyNarrator } from "./pty/narrator";
import { BackendClient } from "./backend/client";
import { SnapshotTicker } from "./ide/snapshot-ticker";
import { TutorCodeLensProvider } from "./ide/codelens";
import { openLesson } from "./notebook/renderer";
import { TutorDebugTrackerFactory } from "./debug/factory";
import { handleIntervention } from "./intervention/tiers";
import { InterventionListener } from "./realtime/intervention-listener";
import { writeSessionMemory } from "./ide/memory-writer";
import { EditListener } from "./realtime/edit-listener";
import { applySignedEdit, prefetchJWKS } from "./ide/remote-edit";
import { runWithJudge0, trackActiveDocument } from "./ide/judge0-runner";

const SESSION_ID_STATE_KEY = "pedagogue.sessionId";

let _sessionId: string | undefined;
let _conceptGraph: ConceptNode[] = [];

export function activate(context: vscode.ExtensionContext) {
  const log = vscode.window.createOutputChannel("Pedagogue", { log: true });
  log.info("Pedagogue extension activating...");

  // ── Auth layer ────────────────────────────────────────────────────────────
  const secrets = new SecretStore(context.secrets);
  const uriHandler = new PedagogueUriHandler(secrets);
  const authProvider = new PedagogueAuthProvider(secrets, uriHandler);

  context.subscriptions.push(
    vscode.window.registerUriHandler(uriHandler),
    vscode.authentication.registerAuthenticationProvider(
      PedagogueAuthProvider.PROVIDER_ID,
      PedagogueAuthProvider.PROVIDER_LABEL,
      authProvider,
      { supportsMultipleAccounts: false },
    ),
    uriHandler,
    authProvider,
  );

  // Shared backend client (auth headers injected automatically)
  const backendClient = new BackendClient(context.secrets);
  const config = vscode.workspace.getConfiguration("pedagogue");

  // ── Crash recovery ────────────────────────────────────────────────────────
  // Restore sessionId persisted before the last extension-host crash/restart.
  const recoveredId = context.workspaceState.get<string>(SESSION_ID_STATE_KEY);
  if (recoveredId) {
    _sessionId = recoveredId;
    void vscode.commands.executeCommand("setContext", "pedagogue.sessionActive", true);
    log.info(`Pedagogue session recovered: ${recoveredId}`);
    // _refreshConceptGraph is defined later — called at end of activate after backendClient ready
  }

  // Ref bag so setSessionId / resubscribeRealtimeListeners can reach listeners
  // that are created later in this function (populated before first call).
  const realtimeRef: {
    intervention: InterventionListener | undefined;
    edit: EditListener | undefined;
  } = { intervention: undefined, edit: undefined };

  function resubscribeRealtimeListeners(): void {
    realtimeRef.intervention?.stop();
    realtimeRef.edit?.stop();
    realtimeRef.intervention?.start();
    realtimeRef.edit?.start();
  }

  // Fetch concept nodes for a session — silently fails until P3 ships the endpoint.
  async function _refreshConceptGraph(id: string): Promise<void> {
    try {
      const nodes = await backendClient.request<ConceptNode[]>(
        `/api/sessions/${encodeURIComponent(id)}/concepts`,
      );
      if (Array.isArray(nodes)) _conceptGraph = nodes;
    } catch {
      // Endpoint not yet implemented or network error — keep existing graph
    }
  }

  function setSessionId(id: string | undefined): void {
    _sessionId = id;
    void context.workspaceState.update(SESSION_ID_STATE_KEY, id);
    void vscode.commands.executeCommand("setContext", "pedagogue.sessionActive", id !== undefined);
    resubscribeRealtimeListeners();
    if (id) void _refreshConceptGraph(id);
    else _conceptGraph = [];
  }

  // Allow the URI handler to call setSessionId without a circular import
  registerSetSessionId((id) => setSessionId(id));

  // ── PtyNarrator (created early so commands can use it) ────────────────────
  const narrator = new PtyNarrator(context, () => _sessionId);
  context.subscriptions.push(narrator);

  // ── Commands ──────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand("pedagogue.signIn", () => executeSignIn(authProvider)),
    vscode.commands.registerCommand("pedagogue.signOut", () => executeSignOut(authProvider)),

    vscode.commands.registerCommand("pedagogue.setup", () => {
      vscode.window.showInformationMessage("Pedagogue: Setup Project (T1-01 stub)");
    }),
    vscode.commands.registerCommand("pedagogue.defend", () => {
      vscode.window.showInformationMessage("Pedagogue: Start Defense (T1-02 stub)");
    }),
    vscode.commands.registerCommand("pedagogue.openSkillGraph", () => {
      vscode.window.showInformationMessage("Pedagogue: Open Skill Graph (T1-10 stub)");
    }),
    vscode.commands.registerCommand("pedagogue.runTests", () => {
      vscode.window.showInformationMessage("Pedagogue: Run Tests (T1-08 stub)");
    }),
    vscode.commands.registerCommand("pedagogue.startPairDebug", () => {
      vscode.window.showInformationMessage("Pedagogue: Start Pair Debug (T1-11 stub)");
    }),

    // Judge0 multi-file submission (T1-08)
    vscode.commands.registerCommand("pedagogue.runWithJudge0", () =>
      runWithJudge0(
        context,
        backendClient,
        () => _sessionId,
        config.get<string>("supabaseUrl") ?? "",
        config.get<string>("supabaseAnonKey") ?? "",
      ),
    ),

    // Open lesson — pass conceptId from CodeLens/hover, or null for cursor-based lookup
    vscode.commands.registerCommand("pedagogue.openLesson", (conceptId?: string) =>
      openLesson(context, backendClient, conceptId ?? "", _sessionId),
    ),

    // Run active file through PtyNarrator terminal (T1-14)
    vscode.commands.registerCommand("pedagogue.runWithTutor", () => {
      if (!vscode.window.activeTextEditor) {
        vscode.window.showWarningMessage("Open a source file first to run with Tutor.");
        return;
      }
      const terminal = narrator.createTerminal("Tutor Run");
      terminal.show();
    }),

    // Prewarm — force JWKS + health ping now (also runs automatically on activate)
    vscode.commands.registerCommand("pedagogue.prewarmCache", () => {
      void backendClient.request("/api/health").catch(() => {});
      void prefetchJWKS(context);
      vscode.window.showInformationMessage("Pedagogue: Cache prewarmed.");
    }),

    // End session — persist memory, clear sessionId context key (T1-13)
    vscode.commands.registerCommand("pedagogue.endSession", async () => {
      const confirm = await vscode.window.showWarningMessage(
        "End session and submit to your teacher?",
        { modal: true },
        "End Session",
      );
      if (confirm !== "End Session") return;
      if (_sessionId) void writeSessionMemory(_sessionId, backendClient);
      setSessionId(undefined);
      vscode.window.showInformationMessage(
        "Session complete! Your teacher can now view your progress.",
      );
    }),

    // finalizeSession is an alias for backward compat
    vscode.commands.registerCommand("pedagogue.finalizeSession", () => {
      void vscode.commands.executeCommand("pedagogue.endSession");
    }),
  );

  // ── Tree-sitter parser ────────────────────────────────────────────────────
  initParser(context).then(() => {
    log.info("Tree-sitter parser ready");
    const active = vscode.window.activeTextEditor?.document;
    if (active) runDiagnostics(active);
  }).catch((err) => {
    log.warn(`Tree-sitter init failed: ${(err as Error).message}`);
  });

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.contentChanges.length > 0) {
        applyDocumentEdits(event.document, event.contentChanges);
      }
    }),
  );

  // ── Diagnostics ───────────────────────────────────────────────────────────
  let _diagDebounce: ReturnType<typeof setTimeout> | undefined;

  context.subscriptions.push(
    tutorCollection,

    vscode.workspace.onDidSaveTextDocument((doc) => {
      clearTimeout(_diagDebounce);
      runDiagnostics(doc);
    }),

    vscode.window.onDidChangeActiveTextEditor((editor) => {
      clearTimeout(_diagDebounce);
      if (editor) {
        trackActiveDocument(editor.document.uri);
        _diagDebounce = setTimeout(() => runDiagnostics(editor.document), 500);
      }
    }),

    vscode.workspace.onDidCloseTextDocument((doc) => {
      clearTimeout(_diagDebounce);
      invalidateDocument(doc.uri.toString());
      clearDiagnostics(doc.uri);
    }),
  );

  // ── Language feature providers ────────────────────────────────────────────
  registerHoverProvider(context);
  registerCodeActionsProvider(context);

  // ── CodeLens ──────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { scheme: "file" },
      new TutorCodeLensProvider(() => _conceptGraph),
    ),
  );

  // ── Snapshot ticker ───────────────────────────────────────────────────────
  const snapshotTicker = new SnapshotTicker(context, () => _sessionId);
  snapshotTicker.start();
  context.subscriptions.push(snapshotTicker);

  // ── DAP tracker ───────────────────────────────────────────────────────────
  const debugOutputChannel = vscode.window.createOutputChannel("Tutor Debug Narrator");
  context.subscriptions.push(
    debugOutputChannel,
    vscode.debug.registerDebugAdapterTrackerFactory(
      "*",
      new TutorDebugTrackerFactory(backendClient, debugOutputChannel, () => _sessionId),
    ),
  );

  // ── Supabase Realtime listeners ───────────────────────────────────────────
  const supabaseUrl     = config.get<string>("supabaseUrl") ?? "";
  const supabaseAnonKey = config.get<string>("supabaseAnonKey") ?? "";

  realtimeRef.intervention = new InterventionListener(
    supabaseUrl,
    supabaseAnonKey,
    () => _sessionId,
    (decision) => void handleIntervention(decision, context, backendClient),
  );

  realtimeRef.edit = new EditListener(
    supabaseUrl,
    supabaseAnonKey,
    () => _sessionId,
    (jwt) => applySignedEdit(jwt, context),
  );

  // Initial subscription — covers crash-recovery (sessionId already set above)
  resubscribeRealtimeListeners();

  context.subscriptions.push(
    { dispose: () => realtimeRef.intervention?.stop() },
    { dispose: () => realtimeRef.edit?.stop() },
  );

  // ── @tutor Chat Participant ───────────────────────────────────────────────
  const participantHandler = createParticipantHandler(
    context.secrets,
    () => _sessionId,
  );
  const participant = vscode.chat.createChatParticipant("pedagogue.tutor", participantHandler);
  participant.iconPath = new vscode.ThemeIcon("mortar-board");
  context.subscriptions.push(participant);

  // ── Prewarm — fire-and-forget after all registrations ────────────────────
  void backendClient.request("/api/health").catch(() => {});
  if (!context.workspaceState.get("pedagogue.jwks")) {
    void prefetchJWKS(context);
  }

  // Populate concept graph for recovered session (setSessionId not called on recovery path)
  if (recoveredId) void _refreshConceptGraph(recoveredId);

  log.info("Pedagogue extension activated.");
}

export function deactivate() {}
