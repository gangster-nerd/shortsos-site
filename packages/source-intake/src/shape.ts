/**
 * Minimal structural reader for untrusted JSON: each accessor records a problem with its path
 * instead of throwing, so one pass reports everything that is wrong with a document.
 */
export type Json = Record<string, unknown>;

export function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class ShapeReader {
  readonly problems: string[] = [];

  private at(path: string, message: string): void {
    this.problems.push(`${path}: ${message}`);
  }

  object(value: unknown, path: string): Json {
    if (isObject(value)) return value;
    this.at(path, "must be an object");
    return {};
  }

  string(parent: Json, key: string, path: string): string {
    const value = parent[key];
    if (typeof value === "string" && value.trim().length > 0) return value;
    this.at(`${path}.${key}`, "must be a non-empty string");
    return "";
  }

  optionalString(parent: Json, key: string, path: string): string | undefined {
    if (parent[key] === undefined) return undefined;
    return this.string(parent, key, path);
  }

  nullableString(parent: Json, key: string, path: string): string | null {
    if (parent[key] === null) return null;
    return this.string(parent, key, path);
  }

  literal<T extends string>(parent: Json, key: string, allowed: readonly T[], path: string): T {
    const value = parent[key];
    if (typeof value === "string" && (allowed as readonly string[]).includes(value)) return value as T;
    this.at(`${path}.${key}`, `must be one of ${allowed.map((a) => JSON.stringify(a)).join(", ")}, got ${JSON.stringify(value)}`);
    return allowed[0]!;
  }

  match(parent: Json, key: string, pattern: RegExp, what: string, path: string): string {
    const value = this.string(parent, key, path);
    if (value && !pattern.test(value)) this.at(`${path}.${key}`, `must be ${what}`);
    return value;
  }

  boolean(parent: Json, key: string, path: string): boolean {
    const value = parent[key];
    if (typeof value === "boolean") return value;
    this.at(`${path}.${key}`, "must be a boolean");
    return false;
  }

  array(parent: Json, key: string, path: string): unknown[] {
    const value = parent[key];
    if (Array.isArray(value)) return value;
    this.at(`${path}.${key}`, "must be an array");
    return [];
  }

  stringArray(parent: Json, key: string, path: string): string[] {
    return this.array(parent, key, path).filter((item, i): item is string => {
      if (typeof item === "string" && item.length > 0) return true;
      this.at(`${path}.${key}[${i}]`, "must be a non-empty string");
      return false;
    });
  }
}
