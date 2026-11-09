import { test as setup, expect } from "@playwright/test";

const authFile = "e2e/.auth/admin.json";

setup("authenticate as the demo platform admin", async ({ page }) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) {
    throw new Error("Set E2E_EMAIL and E2E_PASSWORD before running the authenticated Playwright projects.");
  }

  await page.goto("/login");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: /^sign in/i }).click();

  await expect(page).toHaveURL(/\/(consoles|member)/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: /where to|my pass/i }).first()).toBeVisible();

  await page.context().storageState({ path: authFile });
});
