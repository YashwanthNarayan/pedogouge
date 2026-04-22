import * as vscode from "vscode";
import { createParticipantHandler } from "./chat/participant";
import { SecretStore } from "./auth/secrets";
import { PedagogueUriHandler } from "./auth/uri-handler";
import { PedagogueAuthProvider } from "./auth/provider";
import { executeSignIn } from "./commands/sign-in";
import { executeSignOut } from "./commands/sign-out";
import { initParser, applyDocumentEdits, invalidateDocument } from "./ast";
import { runDiagnostics, clearDiagnostics, tutorCollection } from "./diagnostics/collection";
import { registerHoverProvider } from "./diagnostics/hover";
import { registerCodeActionsProvider } from "./diagnostics/actions";
import { PtyNarrator } from "./pty/narrator";

let _sessionId: string | undefined;

export function activate(context: vscode.ExtensionContext) {
  const log = vscode.window.createOutputChannel("Pedagogue", { log: true });
  log.info("Pedagogue extension activating...");

  // Auth layer
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

  // Commands
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
    vscode.commands.registerCommand("pedagogue.openLesson", (_conceptId?: string) => {
      vscode.window.showInformationMessage("Pedagogue: Open Lesson (T1-10 stub)");
    }),
    vscode.commands.registerCommand("pedagogue.finalizeSession", () => {
      vscode.window.showInformationMessage("Pedagogue: Finalize Session (T1-13 stub)");
    }),
    vscode.commands.registerCommand("pedagogue.startPairDebug", () => {
      vscode.window.showInformationMessage("Pedagogue: Start Pair Debug (T1-11 stub)");
    }),
    vscode.commands.registerCommand("pedagogue.runWithTutor", () => {
      vscode.window.showInformationMessage("Pedagogue: Tutor Terminal (T1-09 stub)");
    }),
    vscode.commands.registerCommand("pedagogue.prewarmCache", () => {
      vscode.window.showInformationMessage("Pedagogue: Prewarm Cache (T1-14 stub)");
    }),
  );

  // Tree-sitter parser — init once; language WASMs load in parallel (T1-05)
  // After init, run diagnostics on the currently active document if any
  initParser(context).then(() => {
    log.info("Tree-sitter parser ready");
    const active = vscode.window.activeTextEditor?.document;
    if (active) runDiagnostics(active);
  }).catch((err) => {
    log.warn(`Tree-sitter init failed: ${(err as Error).message}`);
  });

  // Incremental re-parse on document change (keeps the AST tree up to date)
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.contentChanges.length > 0) {
        applyDocumentEdits(event.document, event.contentChanges);
      }
    }),
  );

  // Diagnostics — on save: immediate; on active-editor switch: debounced 500 ms
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
        _diagDebounce = setTimeout(() => runDiagnostics(editor.document), 500);
      }
    }),

    vscode.workspace.onDidCloseTextDocument((doc) => {
      clearTimeout(_diagDebounce);
      invalidateDocument(doc.uri.toString());
      clearDiagnostics(doc.uri);
    }),
  );

  // Language feature providers (T1-07)
  registerHoverProvider(context);
  registerCodeActionsProvider(context);

  // Pseudoterminal narrator skeleton (T1-09 for full stderr→classifier wiring)
  const narrator = new PtyNarrator(context);
  context.subscriptions.push(narrator);

  // @tutor Chat Participant (T1-02)
  const participantHandler = createParticipantHandler(
    context.secrets,
    () => _sessionId,
  );
  const participant = vscode.chat.createChatParticipant("pedagogue.tutor", participantHandler);
  participant.iconPath = new vscode.ThemeIcon("mortar-board");
  context.subscriptions.push(participant);

  log.info("Pedagogue extension activated.");
}

export function deactivate() {}
