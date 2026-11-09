// Pure presentation rules for the scanner result banner and session selector.
// This module deliberately has no React, DOM, network or Prisma dependency so
// the copy can be tested directly. It never formats a credential: raw scan
// payloads are opaque and must not reach the screen through this path.

export type ScanTone = "success" | "warning" | "info" | "danger" | "muted" | "queued";

/** The success payload fields the scanner renders (structural subset of ScanSuccessData). */
export type ScanDataLike = {
  personName?: string | null;
  duplicate?: boolean | null;
  dedupe?: boolean | null;
  event?: { type?: string | null } | null;
  record?: { status?: string | null } | null;
  geoResult?: string | null;
};

export type ScanOutcomeInput = {
  status: number;
  code?: string | null;
  message?: string | null;
  data?: ScanDataLike | null;
};

export type ScanPresentation = {
  tone: ScanTone;
  title: string;
  message: string;
  /** Only ever set for an accepted / duplicate / deduped scan (D-03). */
  personName?: string;
};

export type SessionLike = {
  title?: string | null;
  status?: string | null;
  startsAt?: string | Date | null;
  endsAt?: string | Date | null;
};

// A credential is `PRISM1:<passPublicId>:<64-hex-secret>`. Anything matching that
// shape is hidden even if a server message were ever to echo it back.
const RAW_CREDENTIAL = /PRISM1:[A-Za-z0-9_-]+:[a-f0-9]{64}/gi;

function safeText(value: string | null | undefined): string | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  return text.replace(RAW_CREDENTIAL, "[credential hidden]").replace(/\s+/g, " ");
}

function displayName(value: string | null | undefined): string | undefined {
  const name = safeText(value);
  return name ? name.slice(0, 120) : undefined;
}

function fallbackTone(status: number): ScanTone {
  if (status === 401 || status === 403) return "danger";
  if (status === 404 || status === 400) return "info";
  if (status === 410) return "warning";
  return "muted";
}

/**
 * Tone for a refusal code. EVENT_CLOSED is an operational block (warning, the
 * attendee did nothing wrong); NOT_ON_ROSTER is a refusal of the person
 * (danger). Every other code keeps the previous status-based behaviour.
 */
export function classifyScanCode(code: string | null | undefined, status = 0): ScanTone {
  switch (code) {
    case "EVENT_CLOSED":
      return "warning";
    case "NOT_ON_ROSTER":
      return "danger";
    default:
      return fallbackTone(status);
  }
}

/**
 * Map an API outcome to the banner copy. Name-free on every failure path,
 * including a refusal that somehow carried a success-shaped payload.
 */
export function mapScanOutcome({ status, code, message, data }: ScanOutcomeInput): ScanPresentation {
  if (status >= 200 && status < 300 && data) {
    const personName = displayName(data.personName);
    const named = personName ? { personName } : {};
    const recordStatus = safeText(data.record?.status) ?? "Recorded";

    if (data.duplicate) {
      return {
        tone: "warning",
        title: "Duplicate scan",
        message: "Already recorded — duplicate scan. Nothing was counted twice.",
        ...named,
      };
    }
    if (data.dedupe) {
      return {
        tone: "success",
        title: "Already recorded",
        message: "The server matched this scan's idempotency key and returned the existing record. Nothing was written twice.",
        ...named,
      };
    }
    return {
      tone: "success",
      title: data.event?.type === "CHECK_IN" ? "Checked in" : "Checked out",
      message: `${recordStatus}. Geo: ${safeText(data.geoResult) ?? "not captured"}.`,
      ...named,
    };
  }

  // Canonical, name-free refusal copy. The roster refusal never hints that a
  // pass may exist elsewhere; closed events say only that scans are not accepted.
  if (code === "EVENT_CLOSED") {
    return {
      tone: "warning",
      title: "Event closed",
      message: "This event is closed. No new scans are accepted.",
    };
  }
  if (code === "NOT_ON_ROSTER") {
    return {
      tone: "danger",
      title: "Not on roster",
      message: "This person is not on the roster for this event.",
    };
  }

  const safeCode = safeText(code);
  const safeMessage = safeText(message);
  return {
    tone: classifyScanCode(safeCode, status),
    title: safeCode ?? `Error ${status}`,
    message: safeMessage ?? (status >= 200 && status < 300 ? "The server did not return a scan result." : "Scan rejected."),
  };
}

export function isSessionClosed(session: Pick<SessionLike, "status"> | null | undefined): boolean {
  return String(session?.status ?? "").toUpperCase() === "CLOSED";
}

/**
 * Dropdown label for a session: lifecycle first so a closed session is never
 * mistaken for a place where a scan will record. Closed sessions stay listed
 * for historical viewing.
 */
export function sessionOptionLabel(session: SessionLike, now: Date = new Date()): string {
  const title = safeText(session.title) ?? "Untitled session";
  if (isSessionClosed(session)) return `Closed · ${title}`;

  const start = session.startsAt ? new Date(session.startsAt).getTime() : Number.NaN;
  const end = session.endsAt ? new Date(session.endsAt).getTime() : Number.NaN;
  const at = now.getTime();

  if (Number.isFinite(end) && at > end) return `Open · past schedule · ${title}`;
  if (Number.isFinite(start) && at < start) return `Upcoming · ${title}`;
  if (Number.isFinite(start) && Number.isFinite(end) && at >= start && at <= end) {
    return `Live · ${title}`;
  }
  return `Open · ${title}`;
}
