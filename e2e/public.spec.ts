import { expect, test, type Page } from "@playwright/test";
import { visit } from "./helpers";

test.use({ storageState: { cookies: [], origins: [] } });

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

test.describe("public and authentication surfaces", () => {
  test("public marketing, auth, demo and policy pages", async ({ page }, testInfo) => {
    const errors = collectConsoleErrors(page);

    await visit(page, "/", "home", testInfo);
    await visit(page, "/login", "login", testInfo);
    await visit(page, "/demo", "demo", testInfo);
    await visit(page, "/privacy", "privacy", testInfo);
    await visit(page, "/terms", "terms", testInfo);

    expect(meaningfulErrors(errors)).toEqual([]);
  });

  test("unknown certificate token shows a safe not-found page", async ({ page }, testInfo) => {
    const errors = collectConsoleErrors(page);

    const response = await page.goto("/verify/not-a-real-token", { waitUntil: "domcontentloaded" });
    expect([200, 404]).toContain(response?.status());
    await expect(page.locator("body")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /couldn.t verify|certificate/i }).first(),
    ).toBeVisible();

    await page.screenshot({
      path: `screenshots/e2e/${testInfo.project.name || "public"}/verify-unknown.png`,
      fullPage: true,
    });
    expect(meaningfulErrors(errors)).toEqual([]);
  });
});
