export class CanaryEchoedError extends Error {
  constructor(canary: string) {
    super(`LLM echoed canary token: ${canary}`);
    this.name = "CanaryEchoedError";
  }
}

export class RefusalViolationError extends Error {
  constructor(public readonly pattern: string) {
    super(`Output filter blocked response matching pattern: ${pattern}`);
    this.name = "RefusalViolationError";
  }
}

export class SchemaParseError extends Error {
  constructor(
    public readonly zodError: unknown,
    public readonly raw: unknown,
  ) {
    super("LLM response failed schema validation");
    this.name = "SchemaParseError";
  }
}

export class RateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super(`Rate limited. Retry after ${retryAfterSeconds}s`);
    this.name = "RateLimitError";
  }
}

export class BudgetExceededError extends Error {
  constructor(public readonly sessionId: string) {
    super(`Budget exceeded for session ${sessionId}`);
    this.name = "BudgetExceededError";
  }
}

export class APIError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(`Anthropic API error ${status}: ${message}`);
    this.name = "APIError";
  }
}

export class ModelOverloadedError extends Error {
  constructor(public readonly model: string) {
    super(`Model overloaded: ${model}`);
    this.name = "ModelOverloadedError";
  }
}
