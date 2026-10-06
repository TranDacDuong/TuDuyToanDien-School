const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const pages = ['account', 'attendance', 'course_practice', 'dashboard', 'courses',
  'income', 'home', 'game', 'notifications', 'friend_requests', 'messages',
  'facebook_posting', 'index', 'exam', 'public_exam', 'class', 'profile', 'tuition',
  'post', 'personal_schedule', 'pdf_exam', 'search', 'resources', 'trial_requests',
  'tasks', 'question', 'sourcedata', 'teacher_schedule', 'push_debug'];

// Presentation-only coverage: no live data writes or login/session dependencies.
for (const width of [1280, 390]) {
  test(`shared design and responsive shells at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/*', route => {
      const request = route.request();
      if (request.resourceType() === 'document' && request.url().startsWith('http://127.0.0.1:4178/')) {
        const name = new URL(request.url()).pathname.slice(1);
        const html = fs.readFileSync(path.join(__dirname, '..', name), 'utf8')
          .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, tag => tag.includes('src="mindup-ui.js') ? tag : '');
        return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
      }
      if (request.resourceType() === 'script' && !request.url().includes('/mindup-ui.js')) return route.abort();
      if (!request.url().startsWith('http://127.0.0.1:4178/')) return route.abort();
      return route.continue();
    });
    for (const name of pages) {
      const response = await page.goto(`http://127.0.0.1:4178/${name}.html`);
      expect(response.status(), name).toBe(200);
      await expect(page.locator('body')).toHaveClass(new RegExp(`mindup-page-${name}`));
      const layout = await page.evaluate(() => ({
        background: getComputedStyle(document.body).backgroundColor,
        width: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
        navy: getComputedStyle(document.documentElement).getPropertyValue('--navy').trim(),
        particles: document.querySelectorAll('.mindup-petal-layer').length
      }));
      expect(layout.background, name).toBe('rgb(245, 247, 250)');
      expect(layout.navy, name).toBe('#142d50');
      if (layout.content > layout.width + 1) console.log(name, await page.evaluate(() =>
        [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1)
          .slice(0, 8).map(el => ({ tag: el.tagName, class: el.className, right: el.getBoundingClientRect().right }))));
      expect.soft(layout.content, `${name}: horizontal overflow`).toBeLessThanOrEqual(layout.width + 1);
      expect(layout.particles).toBe(0);
      if (['home', 'tuition', 'class', 'messages', 'sourcedata', 'dashboard', 'index'].includes(name)) {
        await page.screenshot({ path: `test-results/design-${name}-${width}.png` });
      }
    }
  });
}

test('reduced motion and existing visibility rules remain respected', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('http://127.0.0.1:4178/mindup-ui.css');
  await page.setContent('<link rel="stylesheet" href="http://127.0.0.1:4178/theme.css"><link rel="stylesheet" href="http://127.0.0.1:4178/mindup-ui.css"><div class="modal-card hidden">Hidden</div><button class="btn" disabled>Disabled</button>');
  await expect(page.locator('.hidden')).toBeHidden();
  await expect(page.locator('button')).toBeDisabled();
});
