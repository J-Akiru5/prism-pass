import { expect, test, type Page } from "@playwright/test";
import { visit } from "./helpers";

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

const CSP_REPORT_ONLY_NOISE =
  /Content Security Policy directive 'upgrade-insecure-requests' is ignored when delivered in a report-only policy/i;

function meaningfulErrors(errors: string[]): string[] {
  return errors.filter((message) => !CSP_REPORT_ONLY_NOISE.test(message));
}

test.describe("authenticated application surfaces", () => {
  test("organization dashboard and admin pages", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const errors = collectConsoleErrors(page);

    await page.goto("/consoles");
    await expect(page.getByRole("heading", { name: "Where to?" })).toBeVisible();

    const orgHref = await page.locator('a[href^="/org/"]').first().getAttribute("href");
    expect(orgHref, "the signed-in account must belong to at least one organization").toMatch(/^\/org\/[^/]+$/);
    const org = (orgHref ?? "").replace(/\/$/, "");

    await visit(page, "/consoles", "consoles", testInfo);
    await visit(page, org, "org-dashboard", testInfo);
    await visit(page, `${org}/attendance`, "org-attendance", testInfo);
    await visit(page, `${org}/people`, "org-people", testInfo);
    await visit(page, `${org}/passes`, "org-passes", testInfo);
    await visit(page, `${org}/reports`, "org-reports", testInfo);
    await visit(page, `${org}/settings`, "org-settings", testInfo);
    await visit(page, `${org}/certificates`, "org-certificates", testInfo);

    expect(meaningfulErrors(errors)).toEqual([]);
  });

  test("member and scanner surfaces", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const errors = collectConsoleErrors(page);

    await visit(page, "/member", "member", testInfo);
    await visit(page, "/scan", "scanner", testInfo);

    // Camera APIs are permission-gated in headless Chromium. Ignore only those
    // expected failures; every other console/page error remains a failure.
    const unexpected = meaningfulErrors(errors).filter(
      (message) => !/camera|permission|NotAllowed|NotFoundError|Requested device not found/i.test(message),
    );
    expect(unexpected).toEqual([]);
  });

  test("platform console surfaces", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const errors = collectConsoleErrors(page);

    await visit(page, "/platform", "platform-overview", testInfo);
    await visit(page, "/platform/orgs", "platform-orgs", testInfo);
    await visit(page, "/platform/admins", "platform-admins", testInfo);
    await visit(page, "/platform/audit", "platform-audit", testInfo);
    await visit(page, "/platform/health", "platform-health", testInfo);

    expect(meaningfulErrors(errors)).toEqual([]);
  });
});
