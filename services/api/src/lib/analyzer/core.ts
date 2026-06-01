export class AnalyzerBridgeError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

type ZodIssueLike = {
  path?: Array<string | number>;
  message?: string;
};

function isZodErrorLike(
  value: unknown,
): value is Error & { issues: ZodIssueLike[] } {
  if (!(value instanceof Error) || value.name !== "ZodError") {
    return false;
  }

  const issues = (value as { issues?: unknown }).issues;
  return Array.isArray(issues);
}

export function getAnalyzerUrl() {
  return process.env.VAEXCORE_PULSE_ANALYZER_URL ?? "http://127.0.0.1:9010";
}

function getAnalyzerTimeoutMs() {
  const rawValue = Number(process.env.VAEXCORE_PULSE_ANALYZER_TIMEOUT_MS);
  return Number.isFinite(rawValue) && rawValue > 0 ? rawValue : 15_000;
}

export function parseWithSchema<T>(schemaName: string, parser: () => T): T {
  try {
    return parser();
  } catch (error) {
    if (isZodErrorLike(error)) {
      const firstIssue = error.issues[0];
      const issuePathParts = firstIssue?.path ?? [];
      const issuePath = issuePathParts.length
        ? issuePathParts.join(".")
        : schemaName;
      throw new AnalyzerBridgeError(
        `Analyzer returned an invalid ${schemaName} payload at ${issuePath}: ${firstIssue?.message ?? "schema mismatch"}`,
        502,
      );
    }

    throw error;
  }
}

export async function fetchAnalyzer(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const timeoutMs = getAnalyzerTimeoutMs();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(`${getAnalyzerUrl()}${path}`, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new AnalyzerBridgeError(
        `Analyzer request timed out after ${Math.ceil(timeoutMs / 1000)}s`,
        504,
      );
    }

    throw new AnalyzerBridgeError(
      error instanceof Error
        ? `Unable to reach analyzer at ${getAnalyzerUrl()}: ${error.message}`
        : `Unable to reach analyzer at ${getAnalyzerUrl()}`,
      502,
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
