/**
 * Small fetch wrapper for platform console client components.
 *
 * It unwraps the `{ data, meta }` envelope, throws a typed error for a non-2xx
 * response, and never assumes a body is valid JSON (an HTML error page from a
 * proxy must not crash the console).
 */
export type PlatformApiError = Error & { status?: number; code?: string };

export type PlatformMeta = Record<string, unknown> & {
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  hasNext?: boolean;
  hasPrevious?: boolean;
  selfUserId?: string;
};

export type PlatformEnvelope<T> = { data: T; meta?: PlatformMeta };

export async function platformRequest<T>(path: string, init?: RequestInit): Promise<PlatformEnvelope<T>> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const json = (await response.json().catch(() => null)) as
    | PlatformEnvelope<T>
    | { error?: { code?: string; message?: string } }
    | null;

  if (!response.ok) {
    const error = new Error(
      (json as { error?: { message?: string } } | null)?.error?.message ?? `Request failed (${response.status})`,
    ) as PlatformApiError;
    error.status = response.status;
    error.code = (json as { error?: { code?: string } } | null)?.error?.code;
    throw error;
  }
  if (!json) throw new Error("Empty response from the platform API");
  return json as PlatformEnvelope<T>;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}
