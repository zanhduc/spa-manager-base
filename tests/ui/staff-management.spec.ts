import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  createLeaveApprovalState,
  createLeaveReturnState,
  createStaffE2eState,
  createTrainingCompleteState,
  loginAndOpenStaffManagement,
} from "./helpers/spaE2eMock";

const STAFF_TABS = [
  {
    id: "catalog",
    landmark: "Thêm nhân viên mới",
  },
  {
    id: "schedule",
    landmark: "Set nhanh:",
  },
  {
    id: "attendance",
    landmark: "Ngày chấm công",
  },
  {
    id: "kpi",
    landmark: "Báo cáo KPI nhân viên",
  },
  {
    id: "checklist",
    landmark: "Checklist đầu / cuối ca",
  },
  {
    id: "payroll",
    landmark: "Bảng lương kỳ",
  },
  {
    id: "violations",
    landmark: "Biên bản vi phạm",
  },
  {
    id: "leave",
    landmark: "Đơn nghỉ phép",
  },
  {
    id: "training",
    landmark: "Đào tạo nhân viên",
  },
] as const;

const QUICK_TAB_IDS = new Set(["catalog", "schedule", "attendance", "kpi"]);

function getStaffMainContent(page: Page) {
  return page.locator("main > div.flex.flex-col.gap-4.lg\\:flex-row.lg\\:items-start > div.min-w-0.flex-1.space-y-4");
}

function getCatalogDesktopTable(content: Locator) {
  return content.locator("div.hidden.rounded-xl.border.border-slate-200.bg-white.md\\:block");
}

function getLeaveDesktopTable(content: Locator) {
  return content.locator("div.hidden.overflow-hidden.rounded-xl.border.border-slate-200.bg-white.md\\:block");
}

async function openStaffTab(page: Page, tabId: string) {
  const sidebarTab = page.locator(`aside [data-testid="staff-tab-${tabId}"]:visible`);
  if ((await sidebarTab.count()) > 0) {
    await sidebarTab.first().click();
    return;
  }
  const quickTab = page.locator(`[data-testid="staff-tab-${tabId}"]:visible`);
  if (QUICK_TAB_IDS.has(tabId) && (await quickTab.count()) > 0) {
    await quickTab.first().click();
    return;
  }
  await page.getByTestId("staff-tab-picker").click();
  await page.locator(`[data-testid="staff-tab-${tabId}"]:visible`).first().click();
}

async function expectTabPanel(page: Page, tabId: (typeof STAFF_TABS)[number]["id"]) {
  const content = getStaffMainContent(page);
  if (tabId === "catalog") {
    await expect(content.getByRole("heading", { name: "Thêm nhân viên mới" })).toBeVisible({
      timeout: 15_000,
    });
    return;
  }
  if (tabId === "schedule") {
    await expect(content.getByText("Set nhanh:", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    return;
  }
  if (tabId === "attendance") {
    await expect(content.getByText("Ngày chấm công", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    return;
  }
  if (tabId === "kpi") {
    await expect(content.getByText("Báo cáo KPI nhân viên", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    return;
  }
  if (tabId === "checklist") {
    await expect(content.getByText("Checklist đầu / cuối ca", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    return;
  }
  if (tabId === "payroll") {
    await expect(content.getByText("Bảng lương kỳ", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    return;
  }
  if (tabId === "violations") {
    await expect(content.getByText("Biên bản vi phạm", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    return;
  }
  if (tabId === "leave") {
    await expect(content.getByText("Đơn nghỉ phép", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    return;
  }
  await expect(content.getByText("Đào tạo nhân viên", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("staff management full tabs", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === "mobile-chromium",
      "Staff management E2E chạy trên desktop layout.",
    );
    page.on("dialog", (dialog) => dialog.accept());
  });

  test("loads all 9 tabs with expected panels", async ({ page }) => {
    const state = createStaffE2eState();
    await loginAndOpenStaffManagement(page, state);

    for (const tab of STAFF_TABS) {
      await openStaffTab(page, tab.id);
      await expectTabPanel(page, tab.id);
    }
  });

  test("KPI tab shows customer satisfaction metrics for KTV", async ({ page }) => {
    const state = createStaffE2eState();
    await loginAndOpenStaffManagement(page, state);
    const content = getStaffMainContent(page);

    await openStaffTab(page, "kpi");
    await expect(content.getByText("Báo cáo KPI nhân viên")).toBeVisible();
    await expect(content.getByText("HL TB", { exact: true })).toBeVisible();
    await expect(content.getByText("Tỷ lệ HL", { exact: true })).toBeVisible();
    const kpiRow = content
      .locator("div:visible")
      .filter({ hasText: "NV000001 • Kỹ thuật viên" })
      .filter({ hasText: "500.000 ₫" })
      .first();
    await expect(kpiRow).toContainText("Lan KTV");
    await expect(kpiRow).toContainText("4.5/5");
  });
});

test.describe("staff management HCNS flows", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === "mobile-chromium",
      "Staff management E2E chạy trên desktop layout.",
    );
    page.on("dialog", (dialog) => dialog.accept());
  });

  test("leave approval sets staff to on-leave for today", async ({ page }) => {
    const state = createLeaveApprovalState();
    await loginAndOpenStaffManagement(page, state);
    const content = getStaffMainContent(page);
    const leaveTable = getLeaveDesktopTable(content);

    await openStaffTab(page, "leave");
    const leaveRow = leaveTable
      .getByText("NP000001 • Chờ duyệt", { exact: true })
      .first()
      .locator("xpath=ancestor::div[contains(@class,'grid')][1]");
    await leaveRow.getByRole("button", { name: "Duyệt" }).click();
    await expect
      .poll(() => state.leaves.find((row) => row.maDon === "NP000001")?.trangThai)
      .toBe("DA_DUYET");
    await expect
      .poll(() => state.staffs.find((staff) => staff.maNhanVien === "NV000002")?.trangThai)
      .toBe("Nghỉ phép");
  });

  test("expired approved leave syncs staff back to working on load", async ({ page }) => {
    const state = createLeaveReturnState();
    await loginAndOpenStaffManagement(page, state);
    const content = getStaffMainContent(page);
    const catalogTable = getCatalogDesktopTable(content);

    const minhRow = catalogTable
      .getByText("Minh Lễ tân", { exact: true })
      .first()
      .locator("xpath=ancestor::div[contains(@class,'grid')][1]");
    await expect(minhRow).toContainText("Đang làm việc", { timeout: 15_000 });
    await expect
      .poll(() => state.staffs.find((staff) => staff.maNhanVien === "NV000002")?.trangThai)
      .toBe("Đang làm việc");
  });

  test("training HOAN_THANH moves staff from training to working", async ({ page }) => {
    const state = createTrainingCompleteState();
    await loginAndOpenStaffManagement(page, state);
    const content = getStaffMainContent(page);
    const catalogTable = getCatalogDesktopTable(content);

    await openStaffTab(page, "training");
    const trainingRow = content.locator("div:visible").filter({ hasText: "DT000002" }).first();
    await trainingRow.getByRole("button", { name: "Hoàn thành" }).click();
    await expect(trainingRow).toContainText("DT000002 • Chuyên môn (3–7 ngày) • Hoàn thành", {
      timeout: 15_000,
    });

    await openStaffTab(page, "catalog");
    const hoaRow = catalogTable
      .getByText("Hoa KTV", { exact: true })
      .first()
      .locator("xpath=ancestor::div[contains(@class,'grid')][1]");
    await expect(hoaRow).toContainText("Đang làm việc");
    expect(
      state.staffs.find((staff) => staff.maNhanVien === "NV000004")?.trangThai,
    ).toBe("Đang làm việc");
  });

  test("payroll lock marks period as closed", async ({ page }) => {
    const state = createStaffE2eState();
    await loginAndOpenStaffManagement(page, state);
    const content = getStaffMainContent(page);

    await openStaffTab(page, "payroll");
    await expect(content.getByText("Bảng lương kỳ")).toBeVisible();
    const lockButton = content.getByRole("button", { name: "Chốt kỳ lương" });
    await expect(lockButton).toBeEnabled({
      timeout: 15_000,
    });
    await lockButton.click();
    await page.getByRole("button", { name: "Chốt lương" }).click();
    await expect(
      content.getByText("Kỳ 2026-06-01 → 2026-06-30 đã chốt.", { exact: false }),
    ).toBeVisible({ timeout: 15_000 });
    expect(state.payroll.length).toBeGreaterThan(0);
  });
});
