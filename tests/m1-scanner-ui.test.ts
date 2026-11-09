import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import {
  classifyScanCode,
  isSessionClosed,
  mapScanOutcome,
  sessionOptionLabel,
} from "@/modules/scanner/presentation";

// M1-7 scanner surface: accepted scans (including duplicate and idempotent
// dedupe) carry the attendee name; refusals stay name-free and photo-free. The
// event-closed and roster gates get explicit, safe copy. Session labels keep
// closed sessions visible without presenting them as scannable.

const NAME = "Maria Santos";
const CREDENTIAL = `PRISM1:pp_abc123:${"a".repeat(64)}`;

const acceptedData = (extra = {}) => ({
  personName: NAME,
  event: { type: "CHECK_IN" },
  record: { status: "PRESENT" },
  geoResult: "INSIDE",
  ...extra,
});

describe("accepted scan presentation", () => {
  it("shows the attendee name on a check-in", () => {
    const result = mapScanOutcome({ status: 200, data: acceptedData() });
    expect(result).toMatchObject({ tone: "success", title: "Checked in", personName: NAME });
    expect(result.message).toContain("PRESENT");
    expect(result.message).toContain("INSIDE");
  });

  it("shows the attendee name on a check-out", () => {
    const result = mapScanOutcome({
      status: 200,
      data: acceptedData({ event: { type: "CHECK_OUT" }, record: { status: "COMPLETED" }, geoResult: "NOT_CAPTURED" }),
    });
    expect(result).toMatchObject({ tone: "success", title: "Checked out", personName: NAME });
    expect(result.message).toContain("COMPLETED");
    expect(result.message).toContain("NOT_CAPTURED");
  });

  it("shows the attendee name and says duplicate on a duplicate scan", () => {
    const result = mapScanOutcome({ status: 200, data: acceptedData({ duplicate: true }) });
    expect(result.personName).toBe(NAME);
    expect(result.tone).toBe("warning");
    expect(result.title).toMatch(/duplicate/i);
    expect(result.message).toMatch(/already recorded/i);
    expect(result.message).toMatch(/duplicate/i);
  });

  it("shows the attendee name on an idempotent dedupe", () => {
    const result = mapScanOutcome({
      status: 200,
      data: acceptedData({ dedupe: true, key: "idempotencyKey" }),
    });
    expect(result.personName).toBe(NAME);
    expect(result.tone).toBe("success");
    expect(result.title).toMatch(/already recorded/i);
    expect(result.message).toMatch(/idempotency key/i);
    expect(result.message).toMatch(/nothing was written twice/i);
  });

  it("trims a padded display name and tolerates a missing one", () => {
    const padded = mapScanOutcome({ status: 200, data: acceptedData({ personName: `  ${NAME}  ` }) });
    expect(padded.personName).toBe(NAME);

    const unnamed = mapScanOutcome({ status: 200, data: acceptedData({ personName: null }) });
    expect(unnamed.tone).toBe("success");
    expect(unnamed).not.toHaveProperty("personName");
  });

  it("treats a 2xx without a payload as a status notice, not a success", () => {
    const result = mapScanOutcome({ status: 200, data: null });
    expect(result.tone).toBe("muted");
    expect(result).not.toHaveProperty("personName");
  });
});

describe("refusals stay name-free", () => {
  it("uses the canonical 409 EVENT_CLOSED copy and never leaks the name", () => {
    const result = mapScanOutcome({
      status: 409,
      code: "EVENT_CLOSED",
      message: "This event is closed",
      // Even a malformed success-shaped body must not add a name to a refusal.
      data: acceptedData(),
    });
    expect(result.tone).toBe("warning");
    expect(result.title).toBe("Event closed");
    expect(result.message).toBe("This event is closed. No new scans are accepted.");
    expect(result).not.toHaveProperty("personName");
    expect(JSON.stringify(result)).not.toContain(NAME);
  });

  it("uses the canonical 403 NOT_ON_ROSTER copy without hinting at another org", () => {
    const result = mapScanOutcome({
      status: 403,
      code: "NOT_ON_ROSTER",
      message: "Pass holder is not on this event's roster",
      data: acceptedData(),
    });
    expect(result.tone).toBe("danger");
    expect(result.title).toBe("Not on roster");
    expect(result.message).toBe("This person is not on the roster for this event.");
    expect(result).not.toHaveProperty("personName");
    expect(JSON.stringify(result)).not.toContain(NAME);
    expect(result.message).not.toMatch(/other org|another org|exists|unknown pass|pass holder/i);
  });

  it("keeps other refusal codes name-free and status-compatible", () => {
    const revoked = mapScanOutcome({ status: 403, code: "REVOKED", message: "Pass revoked", data: acceptedData() });
    expect(revoked.tone).toBe("danger");
    expect(revoked).not.toHaveProperty("personName");

    const expired = mapScanOutcome({ status: 410, code: "EXPIRED", message: "Pass expired", data: acceptedData() });
    expect(expired.tone).toBe("warning");
    expect(expired).not.toHaveProperty("personName");

    const malformed = mapScanOutcome({ status: 400, code: "INVALID_INPUT", message: "Unrecognized QR payload", data: acceptedData() });
    expect(malformed.tone).toBe("info");
    expect(malformed).not.toHaveProperty("personName");
  });

  it("never adds personName or photo fields to a failure-shaped result", () => {
    const result = mapScanOutcome({ status: 500, message: "Upstream down", data: acceptedData() });
    expect(result).not.toHaveProperty("personName");
    expect(result).not.toHaveProperty("photo");
    expect(JSON.stringify(result)).not.toMatch(new RegExp(NAME, "i"));
  });
});

describe("refusal tone classification", () => {
  it("maps the M1 event gates", () => {
    expect(classifyScanCode("EVENT_CLOSED")).toBe("warning");
    expect(classifyScanCode("NOT_ON_ROSTER")).toBe("danger");
  });

  it("keeps the previous status-based fallback for other codes", () => {
    expect(classifyScanCode("SOMETHING_NEW", 403)).toBe("danger");
    expect(classifyScanCode("SOMETHING_NEW", 400)).toBe("info");
    expect(classifyScanCode("SOMETHING_NEW", 410)).toBe("warning");
    expect(classifyScanCode("SOMETHING_NEW", 500)).toBe("muted");
    expect(classifyScanCode(undefined, 404)).toBe("info");
    // Pre-M1 codes keep the status-based tone they had before this change.
    expect(classifyScanCode("GEO_OUTSIDE", 422)).toBe("muted");
    expect(classifyScanCode("REVOKED", 403)).toBe("danger");
    expect(classifyScanCode("EXPIRED", 410)).toBe("warning");
  });
});

describe("session selector labels", () => {
  const now = new Date("2026-11-09T10:00:00.000Z");
  const base = { title: "Year-end party", startsAt: "2026-11-09T09:00:00.000Z", endsAt: "2026-11-09T11:00:00.000Z" };

  it("labels a closed session Closed even inside its scheduled window", () => {
    expect(sessionOptionLabel({ ...base, status: "CLOSED" }, now)).toBe("Closed · Year-end party");
    expect(isSessionClosed({ status: "CLOSED" })).toBe(true);
  });

  it("labels an open session past its schedule", () => {
    expect(
      sessionOptionLabel(
        { ...base, status: "OPEN", startsAt: "2026-11-09T06:00:00.000Z", endsAt: "2026-11-09T08:00:00.000Z" },
        now,
      ),
    ).toBe("Open · past schedule · Year-end party");
  });

  it("labels a live session", () => {
    expect(sessionOptionLabel({ ...base, status: "OPEN" }, now)).toBe("Live · Year-end party");
  });

  it("labels an upcoming session", () => {
    expect(
      sessionOptionLabel(
        { ...base, status: "OPEN", startsAt: "2026-11-09T12:00:00.000Z", endsAt: "2026-11-09T14:00:00.000Z" },
        now,
      ),
    ).toBe("Upcoming · Year-end party");
  });

  it("stays open and legible when dates are missing or unparseable", () => {
    expect(sessionOptionLabel({ title: "Ad hoc", status: "OPEN" }, now)).toBe("Open · Ad hoc");
    expect(
      sessionOptionLabel({ title: "Ad hoc", status: "OPEN", startsAt: "not-a-date", endsAt: null }, now),
    ).toBe("Open · Ad hoc");
  });

  it("treats missing sessions and statuses as not closed", () => {
    expect(isSessionClosed(null)).toBe(false);
    expect(isSessionClosed({})).toBe(false);
    expect(isSessionClosed({ status: "OPEN" })).toBe(false);
    expect(isSessionClosed({ status: "closed" })).toBe(true);
  });
});

describe("no raw credential in copy", () => {
  it("redacts a credential-shaped string even if a server message echoes it", () => {
    const result = mapScanOutcome({
      status: 400,
      code: "INVALID_INPUT",
      message: `Could not parse ${CREDENTIAL}`,
    });
    expect(JSON.stringify(result)).not.toContain(CREDENTIAL);
    expect(result.message).not.toMatch(/PRISM1:/);
    expect(result.message).toContain("[credential hidden]");
  });

  it("never emits a credential from any normal accepted or refused outcome", () => {
    const outcomes = [
      mapScanOutcome({ status: 200, data: acceptedData() }),
      mapScanOutcome({ status: 200, data: acceptedData({ duplicate: true }) }),
      mapScanOutcome({ status: 403, code: "NOT_ON_ROSTER" }),
      mapScanOutcome({ status: 409, code: "EVENT_CLOSED" }),
    ];
    for (const outcome of outcomes) {
      expect(JSON.stringify(outcome)).not.toMatch(/PRISM1:/);
    }
  });
});

describe("scanner page wiring", () => {
  const page = readFileSync("app/(scanner)/scan/page.tsx", "utf8");
  const banner = readFileSync("components/scan-result.tsx", "utf8");
  const queuePanel = readFileSync("components/offline-queue-panel.tsx", "utf8");

  it("renders the name through the shared result banner", () => {
    expect(page).toContain("personName={result.personName}");
    expect(banner).toContain("personName");
  });

  it("maps outcomes through the pure helper instead of a local classifier", () => {
    expect(page).toContain("mapScanOutcome({ status: s.status, data: sj.data })");
    expect(page).toContain("mapScanOutcome({ status: s.status, code: sj?.error?.code");
    expect(page).not.toContain("function classify(");
  });

  it("labels sessions with the lifecycle helper and blocks closed ones client-side", () => {
    expect(page).toContain("sessionOptionLabel(s)");
    expect(page).toContain("const sessionClosed = isSessionClosed(activeSession)");
    expect(page).toContain("if (sessionClosed)");
    expect(page).toContain("disabled={busy || sessionClosed}");
    expect(page).toContain("EVENT_CLOSED_OUTCOME.message");
  });

  it("keeps the offline queue rejection surface name-free", () => {
    expect(page).toContain("Rejected scans are not recorded; retry or clear them in the queue panel.");
    expect(queuePanel).not.toMatch(/personName|displayName|photo/i);
  });
});
