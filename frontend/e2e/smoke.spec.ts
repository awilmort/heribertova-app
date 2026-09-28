import { expect, test, type Page } from '@playwright/test';

/** Collects CSP violations reported to the console while a page loads. */
function trackCspViolations(page: Page): string[] {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && /Content Security Policy/i.test(message.text())) {
      violations.push(message.text());
    }
  });
  return violations;
}

test('login page renders with a strict CSP and no violations', async ({ page }) => {
  const violations = trackCspViolations(page);
  const response = await page.goto('/login');

  const csp = response?.headers()['content-security-policy'] ?? '';
  expect(csp).toContain("script-src 'self' 'nonce-");
  expect(csp).toContain("frame-ancestors 'none'");

  await expect(page.getByRole('heading', { level: 1, name: 'Iniciar sesión' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Heriberto Santana · Higüey' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(violations).toEqual([]);
});

test('the root path redirects to /inicio', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/inicio$/);
});

test('app shell renders the home page without CSP violations', async ({ page }) => {
  const violations = trackCspViolations(page);
  await page.goto('/inicio');
  await expect(page.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Estado del sistema' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(violations).toEqual([]);
});

test('unknown pages show the Spanish not-found page', async ({ page }) => {
  const response = await page.goto('/no-existe');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
});

test.describe('mobile (360px)', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) > 400, 'mobile layout only');

  test('navigation lives in a drawer opened from the top bar', async ({ page }) => {
    await page.goto('/inicio');
    await expect(page.getByTestId('sidebar')).toBeHidden();

    await page.getByRole('button', { name: 'Abrir menú' }).click();
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByRole('link', { name: 'Inicio' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await drawer.getByRole('link', { name: 'Inicio' }).click();
    await expect(drawer).toBeHidden();
  });

  test('the page does not scroll horizontally', async ({ page }) => {
    await page.goto('/inicio');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('desktop', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) <= 400, 'desktop layout only');

  test('navigation lives in a persistent sidebar', async ({ page }) => {
    await page.goto('/inicio');
    const sidebar = page.getByTestId('sidebar');
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Inicio' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByRole('button', { name: 'Abrir menú' })).toBeHidden();
  });

  test('the user menu opens with the profile link', async ({ page }) => {
    await page.goto('/inicio');
    await page.getByRole('button', { name: 'Menú de usuario' }).click();
    await expect(page.getByRole('menuitem', { name: 'Mi perfil' })).toBeVisible();
  });
});
