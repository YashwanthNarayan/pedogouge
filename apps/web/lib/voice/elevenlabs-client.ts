// ---------------------------------------------------------------------------
// ElevenLabs Flash Streaming TTS Client
//
// Opens a streaming WebSocket to ElevenLabs and pushes text chunks from
// Claude's sentence buffer. Audio chunks are returned as Uint8Array via
// onChunk callback for forwarding to the browser's MediaSource.
//
// Plan references: T2-11, Appendix E (voice pipeline)
// ---------------------------------------------------------------------------

import WebSocket from "ws";

export interface ElevenLabsStreamOptions {
  voiceId: string;
  modelId?: string;
  outputFormat?: string;
  onChunk: (audio: Uint8Array) => void;
  onError: (err: Error) => void;
  onClose: () => void;
}

export interface ElevenLabsStream {
  writeText: (text: string, isFinal: boolean) => void;
  close: () => void;
}

const DEFAULT_MODEL = "eleven_flash_v2_5";
const DEFAULT_FORMAT = "mp3_44100_128";

export async function openElevenLabsStream(
  opts: ElevenLabsStreamOptions
): Promise<ElevenLabsStream> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set");

  const {
    voiceId,
    modelId = DEFAULT_MODEL,
    outputFormat = DEFAULT_FORMAT,
    onChunk,
    onError,
    onClose,
  } = opts;

  const url = `wss://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream-input?model_id=${modelId}&output_format=${outputFormat}`;

  const ws = new WebSocket(url);

  return new Promise((resolve, reject) => {
    let opened = false;

    ws.on("open", () => {
      opened = true;

      // Send initial configuration
      ws.send(
        JSON.stringify({
          xi_api_key: apiKey,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        })
      );

      resolve({
        writeText(text: string, isFinal: boolean) {
          if (ws.readyState !== WebSocket.OPEN) return;

          if (isFinal) {
            // Flush signal: send remaining text then empty string to flush
            if (text.length > 0) {
              ws.send(JSON.stringify({ text, try_trigger_generation: true }));
            }
            ws.send(JSON.stringify({ text: "", flush: true }));
          } else {
            ws.send(JSON.stringify({ text, try_trigger_generation: true }));
          }
        },

        close() {
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close();
          }
        },
      });
    });

    ws.on("message", (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.audio) {
          // Base64-encoded audio chunk
          const binary = Buffer.from(msg.audio, "base64");
          onChunk(new Uint8Array(binary));
        }

        if (msg.error) {
          onError(new Error(`ElevenLabs error: ${msg.error}`));
        }
      } catch {
        // Non-JSON binary frame (shouldn't happen with ws JSON protocol, but handle gracefully)
        if (data instanceof Buffer) {
          onChunk(new Uint8Array(data));
        }
      }
    });

    ws.on("error", (err: Error) => {
      if (!opened) {
        reject(err);
      } else {
        onError(err);
      }
    });

    ws.on("close", () => {
      if (!opened) {
        reject(new Error("ElevenLabs closed before open"));
      } else {
        onClose();
      }
    });
  });
}
