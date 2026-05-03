import { expect, test } from "@playwright/test";

test("变量命令冒烟：支持变量新增与 getvar 宏渲染", async ({ page }) => {
  await page.goto("/");

  const composer = page.getByPlaceholder("Type your inquiry here...");
  const submitBtn = page.getByRole("button", { name: "Submit" });

  await expect(composer).toBeVisible();
  await expect(submitBtn).toBeVisible();

  // 1) 无效命令提示
  await composer.fill("/setvar");
  await expect(
    page.getByText("变量命令缺少变量名，例如: /setvar mood happy"),
  ).toBeVisible();

  // 2) 发送合法变量命令
  const variableName = `smoke_e2e_${Date.now()}`;
  await composer.fill(`/setvar ${variableName} 12`);
  await submitBtn.click();

  // 变量列表应出现该变量（room scope）
  await expect(page.getByText(variableName)).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByText(`已设置变量 ${variableName}`),
  ).toBeVisible({ timeout: 15_000 });

  // 3) 通过 getvar 宏确认读取变量
  await composer.fill(`当前值 {{getvar::${variableName}}}`);
  await submitBtn.click();

  await expect(page.getByText("当前值 12")).toBeVisible({ timeout: 15_000 });
});
