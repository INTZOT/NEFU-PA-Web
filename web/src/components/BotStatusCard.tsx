import { getBotStatus } from "@/modules/bot/status";
import { BotQrPanel } from "@/components/BotQrPanel";

/**
 * 机器人状态卡片（管理后台首页，仅超管可见）。
 *
 * 设计意图：超管一进后台就能看到机器人是否在工作。
 * 机器人曾停摆近 4 小时无人察觉 —— 因为状态不可见。
 *
 * ⚠️ 状态有**三种**，不是两种。别把它简化成 connected 布尔值：
 *
 *   1. 正常          连接在、登录态也在
 *   2. 假在线        连接在、但登录态已被服务端作废（LLBot 被踢后就是这样：
 *                   它不断开 WebSocket，只让心跳持续失败）
 *   3. 掉线          连接断开
 *
 * 第 2 种比第 3 种更危险：表面上一切正常，实际收不到任何消息。
 * 这是实际踩过的坑，所以这里显式区分。
 */
export async function BotStatusCard() {
  const status = await getBotStatus();

  // 「可用」= 连接在**且**登录态没死。只看 connected 会掉进假在线的坑。
  const healthy = status.connected && !status.sessionDead;

  const tone = healthy
    ? "border-ok/25 bg-ok-soft"
    : "border-danger/25 bg-danger-soft";
  const textTone = healthy ? "text-ok" : "text-danger";

  return (
    <section className={`space-y-3 rounded-xl border p-4 ${tone}`}>
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${healthy ? "bg-ok" : "bg-danger"}`} />
        <h2 className={`font-semibold ${textTone}`}>
          QQ 机器人：
          {healthy ? "运行中" : status.sessionDead ? "登录已失效" : "未连接"}
        </h2>
      </div>

      {healthy ? (
        <div className="space-y-1">
          <p className="text-sm text-ink-muted">
            机器人已与 QQ 协议端连接，注册、重置密码等功能正常。
          </p>
          {status.recoveryAttemptedAt ? (
            <p className="text-xs text-ink-subtle">
              最近一次掉线由看门狗自动重启恢复（
              {new Date(status.recoveryAttemptedAt).toLocaleString("zh-CN")}）。
            </p>
          ) : null}
        </div>
      ) : !status.reachable ? (
        <p className="text-sm text-ink">
          连不上机器人服务本身。请先在服务器上检查 bot 容器：
          <code className="ml-1 rounded bg-surface px-1.5 py-0.5 text-xs">
            docker compose logs bot
          </code>
        </p>
      ) : status.sessionDead ? (
        <div className="space-y-3">
          <p className="text-sm text-ink">
            <strong>登录态已被 QQ 服务端作废，需要重新扫码。</strong>
          </p>
          <p className="text-xs text-ink-muted">
            注意：这种情况下<strong>连接看起来是正常的</strong>，但机器人实际上
            收不到任何消息（心跳持续失败）。自动重启也恢复不了 ——
            因为本地登录凭据会一并作废，只能人工扫码。
          </p>
          {status.qr ? (
            <BotQrPanel />
          ) : (
            <p className="text-sm text-warn">
              ⚠️ 当前没有可用的登录二维码（协议端可能还没生成新的）。
              请在服务器上重启协议端：
              <code className="ml-1 rounded bg-surface px-1.5 py-0.5 text-xs">
                docker compose --profile {status.activeService ?? "llbot"} restart "
                {status.activeService ?? "llbot"}
              </code>
            </p>
          )}
          <p className="text-xs text-ink-subtle">
            ⚠️ 二维码等同于登录凭据，因此本页仅超级管理员可见。
            扫码成功后此处会自动变回「运行中」。
          </p>
        </div>
      ) : status.qr ? (
        <div className="space-y-3">
          <p className="text-sm text-ink">
            <strong>QQ 登录已失效，需要重新扫码。</strong>
            用手机 QQ（机器人账号）扫描下面的二维码即可恢复，无需登录服务器。
          </p>
          <BotQrPanel />
          {status.recoveryAttemptedAt ? (
            <p className="text-xs text-warn">
              ⚠️ 看门狗已于{" "}
              {new Date(status.recoveryAttemptedAt).toLocaleString("zh-CN")}
              {" "}尝试自动重启，但仍未恢复 —— 说明登录态已真正失效，需要人工扫码。
            </p>
          ) : (
            <p className="text-xs text-ink-subtle">
              自动恢复通常会在 1 分钟内完成；若长时间停在这里，说明需要人工扫码。
            </p>
          )}
          <p className="text-xs text-ink-subtle">
            ⚠️ 二维码等同于登录凭据，因此本页仅超级管理员可见。
            扫码成功后此处会自动变回「运行中」。
          </p>
        </div>
      ) : (
        <div className="space-y-2 text-sm text-ink">
          <p>
            机器人服务在运行，但 QQ 未登录，且**当前没有可用的登录二维码**。
          </p>
          <p className="text-ink-muted">协议端可能已停止尝试。请在服务器上执行：</p>
          <code className="block rounded bg-surface px-2 py-1 text-xs">
            cd ~/nefu-pa-web &amp;&amp; docker compose --profile
            {" "}{status.activeService ?? "llbot"} restart {status.activeService ?? "llbot"}
          </code>
          <p className="text-xs text-ink-subtle">
            重启后会重新生成二维码，刷新本页即可看到。
            （正常重启会自动快速登录，不会掉线。）
          </p>
        </div>
      )}
    </section>
  );
}
