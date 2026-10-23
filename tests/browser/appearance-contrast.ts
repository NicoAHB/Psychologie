import type { Page } from '@playwright/test';

/** axe cannot infer a sibling's blurred gradient behind transparent text.
 * Check exposed text against the darkest permitted pastel / brightest navy tint.
 * Opaque panels and controls continue to be covered by axe.
 */
export async function auroraContrastIssues(page: Page, theme: string) {
  return page.evaluate(theme => {
    const base = theme === 'light' ? [210, 210, 210] : [51, 60, 87];
    const luminance = (rgb: number[]) => rgb.map(c => c / 255)
      .map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)
      .reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
    const rgb = (value: string) => (value.match(/[\d.]+/g) || []).map(Number);
    const issues = new Set<string>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (!node.textContent?.trim()) continue;
      const el = node.parentElement;
      // The logotype (including its decorative dot) is exempt under WCAG 1.4.3.
      if (!el || el.closest('script,style,.brand,[aria-hidden="true"],:disabled,[aria-disabled="true"]') || !el.getClientRects().length) continue;
      const style = getComputedStyle(el), foreground = rgb(style.color);
      if (foreground.length < 3 || style.visibility !== 'visible') continue;
      let remaining = 1, ancestor: Element | null = el;
      const background = [0, 0, 0];
      while (ancestor && ancestor.id !== 'root' && ancestor !== document.body) {
        const color = rgb(getComputedStyle(ancestor).backgroundColor);
        const alpha = color.length === 3 ? 1 : color[3] || 0;
        for (let i = 0; i < 3; i++) background[i] += color[i] * alpha * remaining;
        remaining *= 1 - alpha;
        if (remaining < .001) break;
        ancestor = ancestor.parentElement;
      }
      if (remaining <= .5) continue;
      for (let i = 0; i < 3; i++) background[i] += base[i] * remaining;
      const alpha = foreground[3] ?? 1;
      const ink = foreground.slice(0, 3).map((c, i) => c * alpha + background[i] * (1 - alpha));
      const l1 = luminance(ink), l2 = luminance(background);
      const contrast = (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05);
      const large = parseFloat(style.fontSize) >= 24 || parseFloat(style.fontSize) >= 18.66 && parseInt(style.fontWeight) >= 700;
      if (contrast < (large ? 3 : 4.5)) issues.add(`${el.tagName}.${el.className} (${style.color}): ${contrast.toFixed(2)}`);
    }
    return [...issues];
  }, theme);
}
