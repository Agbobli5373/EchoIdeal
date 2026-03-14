export function requireHeader(
  headers: Record<string, unknown>,
  key: string
): string | null {
  const v = headers[key] ?? headers[key.toLowerCase()];
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length ? trimmed : null;
}

export function truncate(input: string, max: number): string {
  if (input.length <= max) return input;
  return input.slice(0, max);
}

