/**
 * 注册进站凭据（handoff）的 cookie 名。
 *
 * 为什么单独放一个模块，而不是在 route.ts 里 export：
 *   Next.js 会为每个 route.ts 生成类型守卫，**只允许导出** HTTP 方法
 *   （GET/POST/...）与 `config` 等少数几个名字。多导出一个常量会让构建
 *   报「does not match the required types of a Next.js Route」。
 *   两个路由要共用一个名字，就必须共用一个非 route 模块。
 */
export const HANDOFF_COOKIE = "nefu_reg_handoff";
/** 与待确认 TTL 对齐（10 分钟），留一点余量。 */
export const HANDOFF_MAX_AGE = 15 * 60;

/** 重置发起凭据的 cookie 名（D-45 方案 B）。 */
export const INITIATOR_COOKIE = "nefu_reset_initiator";
