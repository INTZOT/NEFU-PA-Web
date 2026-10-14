/**
 * 同站请求校验（防 CSRF）。
 *
 * 为什么需要：写接口都是 POST + `sameSite=lax`，跨站 POST **不会**带 cookie，
 * 所以「已登录态」的写操作本来就挡住了。但**登录接口本身**是例外 ——
 * 它不需要 cookie 就能成功，成功后 Set-Cookie 会被浏览器接受。
 * 于是攻击者可以做一个自动提交的跨站表单，把访客**登入攻击者的账号**：
 *   访客随后在这个站里填的东西（报名、个人简介、换绑）全落到攻击者账号上。
 * 危害不算高，但这是「站点行为可被第三方页面操控」，应当挡掉。
 *
 * 判据用 Sec-Fetch-Site（现代浏览器都会带）+ Origin 兜底：
 *   * `same-origin` / `none` → 放行（none 是地址栏直接访问或非浏览器客户端）
 *   * `cross-site` / `same-site` → 拒绝
 * 两者都取不到时**放行** —— 老浏览器或命令行工具（如 curl）不带这些头，
 * 把它们一律拒掉会误伤（项目里就有用 curl 做验证的习惯）。
 */
export function isSameSiteRequest(request: Request): boolean {
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite) {
    return secFetchSite === "same-origin" || secFetchSite === "none";
  }

  const origin = request.headers.get("origin");
  if (!origin) return true;

  const host = request.headers.get("host");
  if (!host) return true;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
