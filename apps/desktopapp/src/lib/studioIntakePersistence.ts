import type {
  StudioIntakePersistence,
  StudioIntakePersistenceBucket,
} from "./studioTypes";

export function createEmptyStudioIntakePersistence(): StudioIntakePersistence {
  return {
    schemaVersion: 1,
    consumed: {},
    exported: {},
    dismissed: {},
  };
}

export function parseStudioIntakePersistence(
  raw: string | null,
): StudioIntakePersistence {
  if (!raw) {
    return createEmptyStudioIntakePersistence();
  }
  try {
    const parsed = JSON.parse(raw) as Partial<StudioIntakePersistence>;
    if (parsed.schemaVersion !== 1) {
      return createEmptyStudioIntakePersistence();
    }
    return {
      schemaVersion: 1,
      consumed: sanitizeTimestampRecord(parsed.consumed),
      exported: sanitizeTimestampRecord(parsed.exported),
      dismissed: sanitizeTimestampRecord(parsed.dismissed),
    };
  } catch {
    return createEmptyStudioIntakePersistence();
  }
}

export function serializeStudioIntakePersistence(
  persistence: StudioIntakePersistence,
): string {
  return JSON.stringify(persistence);
}

export function studioIntakePersistenceSets(
  persistence: StudioIntakePersistence,
): {
  consumedKeys: Set<string>;
  exportedKeys: Set<string>;
  dismissedKeys: Set<string>;
} {
  return {
    consumedKeys: new Set(Object.keys(persistence.consumed)),
    exportedKeys: new Set(Object.keys(persistence.exported)),
    dismissedKeys: new Set(Object.keys(persistence.dismissed)),
  };
}

export function markStudioIntakePersistence(
  persistence: StudioIntakePersistence,
  bucket: StudioIntakePersistenceBucket,
  key: string,
  timestamp = new Date().toISOString(),
): StudioIntakePersistence {
  return {
    ...persistence,
    [bucket]: {
      ...persistence[bucket],
      [key]: timestamp,
    },
  };
}

export function restoreStudioIntakePersistence(
  persistence: StudioIntakePersistence,
  key: string,
): StudioIntakePersistence {
  const dismissed = { ...persistence.dismissed };
  delete dismissed[key];
  return {
    ...persistence,
    dismissed,
  };
}

function sanitizeTimestampRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, string] =>
        typeof entry[0] === "string" && typeof entry[1] === "string",
    ),
  );
}
