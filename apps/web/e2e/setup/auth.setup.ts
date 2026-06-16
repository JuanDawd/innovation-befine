import { test as setup } from "@playwright/test";
import { loginAs, AUTH_STATE_DIR, CREDS } from "../helpers/auth";
import { mkdir } from "fs/promises";
import path from "path";

setup.describe.configure({ mode: "parallel" });

for (const role of Object.keys(CREDS) as (keyof typeof CREDS)[]) {
  setup(`authenticate ${role}`, async ({ page }) => {
    await mkdir(AUTH_STATE_DIR, { recursive: true });
    await loginAs(page, role);
    await page.context().storageState({ path: path.join(AUTH_STATE_DIR, `${role}.json`) });
  });
}
