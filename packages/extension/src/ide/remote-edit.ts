import * as vscode from "vscode";
import { jwtVerify, importJWK, type JWTPayload, type KeyLike, type JWK } from "jose";

type EditPayload = JWTPayload & {
  filePath: string;
  originalLine: string;
  patchedLine: string;
  issuedAt: number;
  sessionId: string;
};

type JWKSCache = {
  keys: JWK[];
  fetchedAt: number;
};

const JWKS_STATE_KEY  = "pedagogue.jwks";
const JWKS_TTL_MS     = 3_600_000; // 1 hour
const EDIT_EXPIRY_SEC = 300;        // 5 minutes

function getBackendUrl(): string {
  return (
    vscode.workspace.getConfiguration("pedagogue").get<string>("backendUrl") ??
    "https://pedagogue.app"
  ).replace(/\/$/, "");
}

async function _fetchPublicKey(
  context: vscode.ExtensionContext,
): Promise<KeyLike> {
  const cached = context.workspaceState.get<JWKSCache>(JWKS_STATE_KEY);

  let keys: JWK[];
  if (cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS) {
    keys = cached.keys;
  } else {
    const res = await fetch(`${getBackendUrl()}/.well-known/jwks.json`);
    if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
    const jwks = (await res.json()) as { keys: JWK[] };
    keys = jwks.keys;
    await context.workspaceState.update(JWKS_STATE_KEY, {
      keys,
      fetchedAt: Date.now(),
    } satisfies JWKSCache);
  }

  const sigKey = keys.find((k) => k["use"] === "sig" && k["alg"] === "EdDSA");
  if (!sigKey) throw new Error("No EdDSA signing key found in JWKS");

  return importJWK(sigKey, "EdDSA") as Promise<KeyLike>;
}

// Prewarm: fetch and cache the JWKS so the first inject_bug apply is instant.
export async function prefetchJWKS(context: vscode.ExtensionContext): Promise<void> {
  try {
    await _fetchPublicKey(context);
  } catch {
    // Prewarm only — failures are silent
  }
}

export async function applySignedEdit(
  jwt: string,
  context: vscode.ExtensionContext,
): Promise<void> {
  // Step 1 — Fetch / serve cached public key
  let publicKey: KeyLike;
  try {
    publicKey = await _fetchPublicKey(context);
  } catch (err) {
    void vscode.window.showErrorMessage(
      `inject_bug: could not fetch signing key — ${(err as Error).message}`,
    );
    return;
  }

  // Step 2 — Verify JWT (jose validates exp automatically; we add issuedAt check)
  let payload: EditPayload;
  try {
    const result = await jwtVerify(jwt, publicKey, { algorithms: ["EdDSA"] });
    payload = result.payload as EditPayload;
  } catch (err) {
    void vscode.window.showErrorMessage(
      `inject_bug: JWT verification failed — ${(err as Error).message}`,
    );
    return;
  }

  if (Date.now() / 1000 - payload.issuedAt >= EDIT_EXPIRY_SEC) {
    void vscode.window.showErrorMessage("inject_bug: edit JWT has expired");
    return;
  }

  if (!payload.filePath || !payload.originalLine || payload.patchedLine === undefined) {
    void vscode.window.showErrorMessage("inject_bug: malformed payload");
    return;
  }

  // Step 3 — Locate the file in the workspace
  const uris = await vscode.workspace.findFiles(payload.filePath, null, 1);
  if (uris.length === 0) {
    void vscode.window.showErrorMessage(
      `inject_bug: file not found: ${payload.filePath}`,
    );
    return;
  }

  // Step 4 — Apply the line replacement
  const doc = await vscode.workspace.openTextDocument(uris[0]!);
  let lineIndex = -1;
  for (let i = 0; i < doc.lineCount; i++) {
    if (doc.lineAt(i).text.trim() === payload.originalLine.trim()) {
      lineIndex = i;
      break;
    }
  }
  if (lineIndex === -1) {
    void vscode.window.showErrorMessage("inject_bug: original line not found in file");
    return;
  }

  const range = doc.lineAt(lineIndex).range;
  const edit  = new vscode.WorkspaceEdit();
  edit.replace(doc.uri, range, payload.patchedLine);
  await vscode.workspace.applyEdit(edit);

  // Step 5 — Highlight the injected line and notify the student
  const editor = await vscode.window.showTextDocument(doc);
  const decoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor("diffEditor.insertedTextBackground"),
    isWholeLine: true,
  });
  editor.setDecorations(decoration, [new vscode.Range(lineIndex, 0, lineIndex, 0)]);
  setTimeout(() => decoration.dispose(), 8_000);

  void vscode.window.showInformationMessage(
    "🐛 Your tutor injected a bug for Phase 2. Find and fix it!",
  );
}
