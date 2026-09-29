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

const ME_RESPONSE = {
  user: { id: 'e2e-user', username: '00112345673' },
  person: {
    id: 'e2e-person',
    fullName: 'Usuario de prueba',
    nickname: null,
    recintoKey: 'recinto-e2e--sector-e2e',
    recintoName: 'Recinto de prueba',
    colegioId: 1,
    sector: 'Sector de prueba',
  },
  role: 'team_leader',
  permissions: [],
  landing: '/panel',
  usingDefaultPassword: false,
};

/**
 * These smoke tests render pages without the API running (see playwright.config.ts). `proxy.ts`
 * (plan 3.4) gates every `(app)` page behind a session cookie, so an "authenticated" page needs a
 * cookie that satisfies that coarse check plus a stubbed `GET /api/me` (the real API isn't there to
 * answer it) rather than an actual login.
 */
async function signInAs(page: Page) {
  const baseURL = test.info().project.use.baseURL ?? 'http://localhost:3100';
  await page.context().addCookies([
    {
      name: '__Host-sid',
      value: 'e2e-fake-session-token',
      url: baseURL,
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    },
  ]);
  await page.route('**/api/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ME_RESPONSE),
    }),
  );
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

test('the root path redirects an unauthenticated visitor to /login', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login\?next=/);
});

test('the root path redirects a signed-in visitor to /inicio', async ({ page }) => {
  await signInAs(page);
  await page.goto('/');
  await expect(page).toHaveURL(/\/inicio$/);
});

test('app shell renders the home page without CSP violations', async ({ page }) => {
  const violations = trackCspViolations(page);
  await signInAs(page);
  await page.goto('/inicio');
  await expect(page.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Estado del sistema' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(violations).toEqual([]);
});

test('unknown pages show the Spanish not-found page', async ({ page }) => {
  await signInAs(page);
  const response = await page.goto('/no-existe');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
});

test.describe('mobile (360px)', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) > 400, 'mobile layout only');
  test.beforeEach(async ({ page }) => {
    await signInAs(page);
  });

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
  test.beforeEach(async ({ page }) => {
    await signInAs(page);
  });

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
