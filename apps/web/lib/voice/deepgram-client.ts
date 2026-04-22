// ---------------------------------------------------------------------------
// Deepgram Nova-3 streaming ASR — server-side WebSocket client
//
// Security:
//   - retain=false enforced via query param (no audio storage on Deepgram)
//   - API key never leaves server environment
//
// Latency target: utterance_end fires within 150ms of natural speech pause
// ---------------------------------------------------------------------------

import WebSocket from "ws";

export interface DeepgramTranscriptEvent {
  text: string;
  isFinal: boolean;
  utteranceEnd: boolean;
  confidence?: number;
}

export interface DeepgramStreamOptions {
  sampleRate?: number;
  language?: string;
  endpointingMs?: number;
  onTranscript: (event: DeepgramTranscriptEvent) => void;
  onError: (err: Error) => void;
  onClose: () => void;
}

export interface DeepgramStream {
  send: (chunk: Buffer | ArrayBuffer) => void;
  close: () => void;
}

// Raw message shapes from Deepgram
interface DeepgramResultMessage {
  type: "Results";
  channel: {
    alternatives: Array<{
      transcript: string;
      confidence: number;
    }>;
  };
  is_final: boolean;
  speech_final: boolean;
}

interface DeepgramUtteranceEndMessage {
  type: "UtteranceEnd";
}

interface DeepgramMetadataMessage {
  type: "Metadata";
  transaction_key?: string;
  request_id?: string;
}

type DeepgramMessage =
  | DeepgramResultMessage
  | DeepgramUtteranceEndMessage
  | DeepgramMetadataMessage
  | { type: string };

export async function openDeepgramStream(
  opts: DeepgramStreamOptions,
): Promise<DeepgramStream> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPGRAM_API_KEY environment variable is not set");
  }

  const {
    sampleRate = 16_000,
    language = "en-US",
    endpointingMs = 1_000,
    onTranscript,
    onError,
    onClose,
  } = opts;

  const params = new URLSearchParams({
    model: "nova-3",
    language,
    sample_rate: String(sampleRate),
    encoding: "linear16",
    channels: "1",
    interim_results: "true",
    utterance_end_ms: String(endpointingMs),
    smart_format: "true",
    // Security: no retention — audio discarded server-side after transcription
    retain: "false",
  });

  const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`;
  const openTs = Date.now();

  const ws = new WebSocket(url, {
    headers: {
      Authorization: `Token ${apiKey}`,
    },
  });

  return new Promise<DeepgramStream>((resolve, reject) => {
    let resolved = false;

    ws.on("open", () => {
      const latencyMs = Date.now() - openTs;
      console.info(`[deepgram] connected in ${latencyMs}ms`);
      resolved = true;
      resolve({
        send(chunk: Buffer | ArrayBuffer) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(chunk);
          }
        },
        close() {
          // Send a zero-byte close signal per Deepgram docs
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(Buffer.alloc(0));
          }
          ws.close();
        },
      });
    });

    ws.on("message", (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString()) as DeepgramMessage;

        if (msg.type === "Results") {
          const result = msg as DeepgramResultMessage;
          const alt = result.channel.alternatives[0];
          if (!alt) return;

          onTranscript({
            text: alt.transcript,
            isFinal: result.is_final,
            utteranceEnd: false,
            confidence: alt.confidence,
          });
        } else if (msg.type === "UtteranceEnd") {
          onTranscript({
            text: "",
            isFinal: true,
            utteranceEnd: true,
          });
        }
        // Metadata and other message types are informational — no handler needed
      } catch (parseErr) {
        console.warn("[deepgram] failed to parse message:", parseErr);
      }
    });

    ws.on("error", (err) => {
      if (!resolved) {
        reject(err);
      } else {
        onError(err);
      }
    });

    ws.on("close", (code, reason) => {
      if (!resolved) {
        reject(new Error(`Deepgram closed before open: ${code} ${reason}`));
      } else {
        onClose();
      }
    });
  });
}
