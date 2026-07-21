import { test, expect } from "@playwright/test";
test("unauthenticated users are redirected from dashboard", async ({ page }) => { await page.goto("/dashboard"); await expect(page).toHaveURL(/\/auth\/sign-in/); });
