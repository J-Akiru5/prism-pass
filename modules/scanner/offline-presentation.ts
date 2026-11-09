// Pure presentation rules for the offline scanner (M2).
//
// These helpers turn the on-device verifier's verdict and the cached bundle
// metadata into banner copy, selectable session rows and the compact status
// block. No React, DOM, network, WebCrypto or Dexie dependency: the page owns
// side effects, and the rules are testable directly.
//
// Safety rules encoded here:
// - A refusal never carries a display name (D-03). `personName` exists only on
//   the VALID presentation, and every non-VALID branch is built without it.
// - Only a VALID verdict may be queued (`shouldQueueOfflineVerdict`). Missing,
//   unsupported or tampered bundles and every refusal are never queued.
// - Age and drift wording comes from `modules/offline/clock.ts`; the level name
//   ("Fresh", "Stale", "Blocked", ...) is rendered as text, not colour alone.

import {
  ageLabel,
  ageLevel,
  driftLabel,
  driftLevel,
  type AgeLevel,
  type DriftLevel,
} from "@/modules/offline/clock";
import type { OfflineVerdict } from "@/modules/offline/verify-offline";
import { sessionOptionLabel, type ScanTone, type SessionLike } from "./presentation";

/** Visible level names; the status block renders these instead of relying on colour. */
export const AGE_LEVEL_TEXT: Record<AgeLevel, string> = {
  fresh: "Fresh",
  aging: "Aging",
  stale: "Stale",
  expired: "Expired",
};

export const DRIFT_LEVEL_TEXT: Record<DriftLevel, string> = {
  ok: "OK",
  warn: "Warning",
  danger: "Danger",
  blocked: "Blocked",
};

export type OfflineVerdictPresentation = {
  tone: ScanTone;
  title: string;
  message: string;
  /** Only ever set for VALID: the attendee is the one person an accepted scan may name. */
  personName?: string;
};

export type OfflineVerdictContext = {
  /** Data age used in the provisional copy (VALID carries its own monotonic age). */
  bundleAgeMs: number;
  /** `serverTime - device midpoint`; null/undefined when drift could not be measured. */
  driftMs?: number | null;
  /** Human session label; omitted from every refusal branch. */
  sessionLabel?: string | null;
};

function safeText(value: string | null | undefined): string | undefined {
  const text = value?.replace(/\s+/g, " ").trim();
  return text ? text : undefined;
}

// A credential is `PRISM1:<passPublicId>:<64-hex-secret>`. A roster display name
// should never look like one, but if it somehow does it is dropped rather than
// rendered as a "name".
const RAW_CREDENTIAL = /PRISM1:[A-Za-z0-9_-]+:[a-f0-9]{64}/i;

function displayName(value: string | null | undefined): string | undefined {
  const name = safeText(value);
  if (!name || RAW_CREDENTIAL.test(name)) return undefined;
  return name.slice(0, 120);
}

function refusal(tone: ScanTone, title: string, message: string): OfflineVerdictPresentation {
  // Built explicitly without personName so a future refactor cannot leak one.
  return { tone, title, message };
}

/**
 * Map an offline verdict to the scanner banner.
 *
 * `VALID` is provisional by definition: the device only verified against the
 * downloaded snapshot, so the copy says the scan is not recorded until sync and
 * includes the age of that snapshot. Every other verdict is a refusal or an
 * unavailable-bundle notice and is name-free.
 */
export function mapOfflineVerdict(
  verdict: OfflineVerdict,
  context: OfflineVerdictContext,
): OfflineVerdictPresentation {
  if (verdict.verdict === "VALID") {
    const ageMs = Number.isFinite(context.bundleAgeMs) ? context.bundleAgeMs : verdict.bundleAgeMs;
    const parts = [
      "Verified on device — provisional. Not recorded until sync.",
      ageLabel(ageMs),
    ];
    if (
      typeof context.driftMs === "number" &&
      Number.isFinite(context.driftMs) &&
      driftLevel(context.driftMs) !== "ok"
    ) {
      parts.push(driftLabel(context.driftMs));
    }
    if (verdict.stale) {
      parts.push(
        "The snapshot is past its freshness limit; the server may reject or flag this scan when it syncs.",
      );
    }
    const session = safeText(context.sessionLabel);
    if (session) parts.push(`Session: ${session}.`);

    const personName = displayName(verdict.displayName);
    return {
      tone: "queued",
      title: verdict.stale
        ? "Queued offline — provisional (stale data)"
        : "Queued offline — provisional",
      message: parts.join(" "),
      ...(personName ? { personName } : {}),
    };
  }

  switch (verdict.verdict) {
    case "EXPIRED":
      return refusal(
        "warning",
        "Pass expired",
        "This pass has expired. It was not recorded and was not queued.",
      );
    case "REVOKED":
      return refusal(
        "danger",
        "Pass revoked",
        "This pass was revoked in the downloaded bundle. It was not recorded and was not queued.",
      );
    case "NOT_LISTED":
      // One canonical copy for every reason: the verdict must not reveal whether
      // the pass exists elsewhere or was revoked after the snapshot.
      return refusal(
        "danger",
        "Not on roster",
        "This pass is not on the roster for this event. It was not recorded and was not queued.",
      );
    case "INACTIVE_PERSON":
      return refusal(
        "danger",
        "Pass inactive",
        "This pass is not active in the downloaded bundle. It was not recorded and was not queued.",
      );
    case "INVALID_CREDENTIAL":
      return refusal(
        "danger",
        "Credential does not match",
        "This scan code does not match the roster entry. It was not recorded and was not queued.",
      );
    case "INVALID_FORMAT":
      return refusal(
        "info",
        "Unreadable scan code",
        "This code is not a Prism pass. Nothing was recorded and nothing was queued.",
      );
    case "BUNDLE_MISSING":
      return refusal(
        "warning",
        "No offline bundle",
        "Download this event while online before scanning offline. Nothing was queued.",
      );
    case "BUNDLE_UNSUPPORTED":
      return refusal(
        "warning",
        "Offline bundle not usable",
        "The cached bundle is missing, unsigned, or for another organization or session. " +
          "Download this event while online before scanning offline. Nothing was queued.",
      );
    case "BUNDLE_TAMPERED":
      return refusal(
        "danger",
        "Offline bundle failed verification",
        "The downloaded bundle could not be verified on this device. Nothing was queued. " +
          "Download it again while online.",
      );
    default: {
      // Exhaustiveness guard: a new verdict must be handled explicitly.
      const never: never = verdict;
      return refusal("muted", "Unrecognized verdict", `The device returned an unknown result (${String(never)}). Nothing was queued.`);
    }
  }
}

/** Only a VALID offline verdict may be enqueued. Everything else stops at the banner. */
export function shouldQueueOfflineVerdict(verdict: OfflineVerdict): boolean {
  return verdict.verdict === "VALID";
}

export type SessionOptionInput = {
  id: string;
  title?: string | null;
  type?: string | null;
  startsAt?: string | Date | null;
  endsAt?: string | Date | null;
  status?: string | null;
  closedAt?: string | Date | null;
  timezone?: string | null;
  policyId?: string | null;
  rosterEnforced?: boolean | null;
  walkInAllowed?: boolean | null;
};

export type MergedSessionOption = {
  id: string;
  title: string;
  type: string;
  startsAt: string;
  endsAt: string;
  status: "OPEN" | "CLOSED";
  /** True when the cached bundle contains this session. */
  offline: boolean;
  /** True when the live session list supplied or refreshed this row. */
  live: boolean;
  /** Lifecycle-first label shared with the online selector. */
  label: string;
};

function isoText(value: string | Date | null | undefined): string {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  }
  return typeof value === "string" ? value.trim() : "";
}

function normalizedStatus(value: string | null | undefined): "OPEN" | "CLOSED" {
  return String(value ?? "").trim().toUpperCase() === "CLOSED" ? "CLOSED" : "OPEN";
}

function normalizeSession(
  input: SessionOptionInput,
  flags: { offline: boolean; live: boolean },
  now: Date,
): MergedSessionOption | null {
  const id = typeof input.id === "string" ? input.id.trim() : "";
  if (!id) return null;
  const option: MergedSessionOption = {
    id,
    title: safeText(input.title) ?? "Untitled session",
    type: safeText(input.type) ?? "EVENT",
    startsAt: isoText(input.startsAt),
    endsAt: isoText(input.endsAt),
    status: normalizedStatus(input.status),
    offline: flags.offline,
    live: flags.live,
    label: "",
  };
  option.label = sessionOptionLabel(option as SessionLike, now);
  return option;
}

/**
 * Merge the live session list with the sessions carried by the cached bundle.
 *
 * Cached rows come first so a disconnected reload still offers every session the
 * download covered. A session present in both lists is deduped by id and takes
 * the live title/schedule/status (fresher, server-authoritative) while keeping
 * its cached position. Live-only sessions are appended.
 */
export function mergeSessionOptions(
  live: readonly SessionOptionInput[] = [],
  cached: readonly SessionOptionInput[] = [],
  now: Date = new Date(),
): MergedSessionOption[] {
  const merged = new Map<string, MergedSessionOption>();

  for (const input of cached) {
    const option = normalizeSession(input, { offline: true, live: false }, now);
    if (option) merged.set(option.id, option);
  }

  for (const input of live) {
    const existing = merged.get(typeof input.id === "string" ? input.id.trim() : "");
    if (existing) {
      // Map preserves the cached insertion position while the live values win.
      const refreshed = normalizeSession(
        {
          ...input,
          title: input.title ?? existing.title,
          type: input.type ?? existing.type,
          startsAt: input.startsAt ?? existing.startsAt,
          endsAt: input.endsAt ?? existing.endsAt,
          status: input.status ?? existing.status,
        },
        { offline: existing.offline, live: true },
        now,
      );
      if (refreshed) merged.set(refreshed.id, refreshed);
      continue;
    }
    const option = normalizeSession(input, { offline: false, live: true }, now);
    if (option) merged.set(option.id, option);
  }

  return [...merged.values()];
}

export type LastSyncTone = "ok" | "warn" | "danger" | "muted";

export type BundleStatusInput = {
  /** Data age in milliseconds; NaN is presented as expired. */
  ageMs: number;
  /** `serverTime - device midpoint`; null/undefined means unmeasurable. */
  driftMs?: number | null;
  /** When the last sync attempt finished (epoch ms or ISO text). */
  lastSyncAt?: number | string | null;
  /** Visible outcome text from the last sync attempt, if any. */
  lastSyncOutcome?: string | null;
  /** Injectable clock for deterministic tests. */
  nowMs?: number;
};

export type BundleStatusLabels = {
  ageLevel: AgeLevel;
  ageText: string;
  driftLevel: DriftLevel;
  driftText: string;
  lastSyncText: string;
  lastSyncTone: LastSyncTone;
};

function parseTimestamp(value: number | string | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function relativeLabel(deltaMs: number): string {
  if (!Number.isFinite(deltaMs) || deltaMs < 60_000) return "just now";
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function classifyLastSync(outcome: string | null | undefined): LastSyncTone {
  const text = safeText(outcome)?.toLowerCase() ?? "";
  if (!text) return "muted";
  if (/fail|error|could not|unavailable|revoked|fatal|blocked/.test(text)) return "danger";
  // A sync summary always contains "0 rejected"/"N rejected"; only a non-zero
  // count means the outcome itself is a warning.
  const rejected = /(\d+)\s+rejected/.exec(text);
  if (rejected) return Number(rejected[1]) > 0 ? "warn" : "ok";
  if (/reject|retry|offline|waiting|invalid|missing/.test(text)) return "warn";
  return "ok";
}

/**
 * Structured labels for the compact offline status block. The age and drift
 * wording is the shared `clock.ts` policy, so the banner and this block cannot
 * disagree about what "stale" or "blocked" means.
 */
export function bundleStatusText(input: BundleStatusInput): BundleStatusLabels {
  const age = ageLevel(input.ageMs);
  const drift = driftLevel(
    typeof input.driftMs === "number" ? input.driftMs : Number.NaN,
  );

  const at = parseTimestamp(input.lastSyncAt);
  const outcome = safeText(input.lastSyncOutcome);
  const lastSyncText =
    at === null
      ? "No sync has run on this device yet."
      : outcome
        ? `Last sync ${relativeLabel((input.nowMs ?? Date.now()) - at)}: ${outcome}`
        : `Last sync ${relativeLabel((input.nowMs ?? Date.now()) - at)}.`;

  return {
    ageLevel: age,
    ageText: ageLabel(input.ageMs),
    driftLevel: drift,
    driftText: driftLabel(typeof input.driftMs === "number" ? input.driftMs : Number.NaN),
    lastSyncText,
    lastSyncTone: at === null ? "muted" : classifyLastSync(outcome),
  };
}
