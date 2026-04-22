// ---------------------------------------------------------------------------
// SentenceBuffer — splits streaming Claude text into sentence-sized chunks
// for ElevenLabs TTS latency optimization.
//
// Flush complete sentences as they arrive so ElevenLabs can begin synthesis
// before Claude finishes the full response. The remaining partial fragment is
// held until more text arrives or flush() is called at turn end.
// ---------------------------------------------------------------------------

export class SentenceBuffer {
  private buf = "";

  // Returns any complete sentences found in the accumulated buffer.
  push(chunk: string): string[] {
    this.buf += chunk;
    const out: string[] = [];

    // Match sentence-ending punctuation followed by whitespace or end-of-string.
    // Handles: period, exclamation, question mark, optionally followed by quotes/parens.
    const regex = /([^.!?]*[.!?]["'"'\)]*(?:\s|$))/g;
    let m: RegExpExecArray | null;
    let lastIndex = 0;

    while ((m = regex.exec(this.buf)) !== null) {
      const sentence = m[1]!.trim();
      if (sentence.length > 0) {
        out.push(sentence);
      }
      lastIndex = m.index + m[1]!.length;
    }

    this.buf = this.buf.slice(lastIndex);
    return out;
  }

  // Return and clear any remaining partial text (called at turn end).
  flush(): string {
    const rest = this.buf.trim();
    this.buf = "";
    return rest;
  }

  // Check if there's buffered text waiting.
  get pending(): string {
    return this.buf;
  }
}
