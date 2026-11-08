/** Shared display formatting for the platform console. No business logic. */

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function relativeAge(iso: string | null): string {
  if (!iso) return "never";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "never";
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function resultTone(result: string): "success" | "danger" | "warning" | "muted" {
  if (["ok", "accepted", "approved", "adjusted"].includes(result)) return "success";
  if (["denied", "rejected", "revoked", "invalid_batch", "not_found"].includes(result)) return "danger";
  if (["pending", "flagged", "valid_duplicate"].includes(result)) return "warning";
  return "muted";
}

export function orgStatusLabel(status: string): string {
  if (status === "PENDING_DELETION") return "Pending deletion";
  if (status === "SUSPENDED") return "Suspended";
  if (status === "ACTIVE") return "Active";
  return status;
}

export function orgStatusTone(status: string): "success" | "danger" | "warning" {
  if (status === "ACTIVE") return "success";
  if (status === "SUSPENDED") return "danger";
  return "warning";
}
