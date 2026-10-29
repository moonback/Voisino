
export type ErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "RATE_LIMITED";

const HTTP: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  RATE_LIMITED: 429,
};

/** Erreur métier dont le message peut être montré à l'utilisateur. */
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
  get status() {
    return HTTP[this.code];
  }
}

export type ActionFailure = {
  ok: false;
  code: ErrorCode | "INTERNAL";
  error: string;
  fieldErrors?: Record<string, string[]>;
};
export type ActionResult<T = null> = { ok: true; data: T } | ActionFailure;
