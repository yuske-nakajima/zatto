export const SESSION_EXCHANGE_FORMAT = "zatto-session";
export const SESSION_EXCHANGE_VERSION = 1;

/** A path entry in a local zatto session exchange document. */
export interface SessionExchangeEntry {
  path: string;
}

/** The JSON document used to exchange an ordered zatto session. */
export interface SessionExchange {
  format: typeof SESSION_EXCHANGE_FORMAT;
  version: typeof SESSION_EXCHANGE_VERSION;
  entries: SessionExchangeEntry[];
}

interface SessionEntryPath {
  absPath: string;
}

/** Indicates that a value does not conform to the session exchange format. */
export class SessionExchangeValidationError extends Error {
  /**
   * Creates a validation error with a user-facing explanation.
   *
   * @param message - Explanation of the invalid exchange document
   */
  constructor(message: string) {
    super(message);
    this.name = "SessionExchangeValidationError";
  }
}

/**
 * Creates an exchange document without persisted session metadata.
 *
 * @param entries - Session entries in display order
 * @returns A versioned exchange document containing only absolute paths
 */
export function createSessionExchange<T extends SessionEntryPath>(
  entries: readonly T[],
): SessionExchange {
  return {
    format: SESSION_EXCHANGE_FORMAT,
    version: SESSION_EXCHANGE_VERSION,
    entries: entries.map((entry) => ({ path: entry.absPath })),
  };
}

/**
 * Parses and validates a session exchange document.
 *
 * @param input - Untrusted JSON-compatible input
 * @returns The validated session exchange document
 * @throws {SessionExchangeValidationError} When the document shape is invalid or unsupported
 */
export function parseSessionExchange(input: unknown): SessionExchange {
  if (!isRecord(input)) {
    throw invalidFormat();
  }
  if (input.format !== SESSION_EXCHANGE_FORMAT) {
    throw invalidFormat();
  }
  if (input.version !== SESSION_EXCHANGE_VERSION) {
    const version =
      typeof input.version === "number" ? String(input.version) : "不明";
    throw new SessionExchangeValidationError(
      `セッション形式の version ${version} には対応していません`,
    );
  }
  if (!hasOnlyKeys(input, ["format", "version", "entries"])) {
    throw invalidFormat();
  }
  if (!Array.isArray(input.entries)) {
    throw invalidFormat();
  }

  const entries = input.entries.map((entry) => {
    if (
      !isRecord(entry) ||
      !hasOnlyKeys(entry, ["path"]) ||
      typeof entry.path !== "string" ||
      entry.path.length === 0
    ) {
      throw invalidFormat();
    }
    return { path: entry.path };
  });
  if (new Set(entries.map((entry) => entry.path)).size !== entries.length) {
    throw new SessionExchangeValidationError(
      "entries に重複した path を指定できません",
    );
  }
  return {
    format: SESSION_EXCHANGE_FORMAT,
    version: SESSION_EXCHANGE_VERSION,
    entries,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === expectedKeys.length &&
    expectedKeys.every((key) => Object.hasOwn(value, key))
  );
}

function invalidFormat(): SessionExchangeValidationError {
  return new SessionExchangeValidationError(
    "JSON は zatto-session version 1 の形式である必要があります",
  );
}
