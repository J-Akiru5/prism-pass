import { expect, type Page, type TestInfo } from "@playwright/test";

function slugify(value: string): string {
  return value
    .replace(/^https?:\/\//, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Navigate to one application surface, assert the frame is visible, assert the
 * layout does not overflow horizontally, and capture a full-page screenshot.
 *
 * The screenshot directory is keyed by Playwright project so desktop and mobile
 * evidence never overwrite each other.
 */
export async function visit(
  page: Page,
  path: string,
  name: string,
  testInfo: TestInfo,
): Promise<void> {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.locator("main").first()).toBeVisible();
  await expect(page.locator("h1, h2").first()).toBeVisible();

  // Client-side data panels render skeleton/loading copy before their fetch
  // resolves. Wait for those labels to clear so screenshots and layout checks
  // reflect the loaded view, not the loading shell.
  await page.waitForFunction(
    () =>
      !/\bLoading\b|\bChecking\b/i.test(document.body.innerText) &&
      document.querySelectorAll(".animate-pulse").length === 0,
    null,
    { timeout: 30_000 },
  );

  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return Math.max(root.scrollWidth, document.body.scrollWidth) - window.innerWidth;
  });
  expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(1);

  const project = testInfo.project.name || "unknown";
  await page.screenshot({
    path: `screenshots/e2e/${project}/${slugify(name)}.png`,
    // A full-page capture places a fixed bottom nav mid-page on mobile; the
    // viewport capture is the honest representation of the phone experience.
    fullPage: project !== "mobile",
  });
}
