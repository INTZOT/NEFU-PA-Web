import { getBotStatus } from "@/modules/bot/status";
import { BotQrPanel } from "@/components/BotQrPanel";

/**
 * 机器人状态卡片（管理后台首页，仅超管可见）。
 *
 * 设计意图：超管一进后台就能看到机器人是否在工作。
 * 机器人曾停摆近 4 小时无人察觉 —— 因为状态不可见。
 *
 * 只在掉线时才显示二维码：正常运行时不占版面。
 */
export async function BotStatusCard() {
  const status = await getBotStatus();

  const tone = status.connected
    ? "border-ok/25 bg-ok-soft"
    : "border-danger/25 bg-danger-soft";
  const textTone = status.connected ? "text-ok" : "text-danger";

  return (
    <section className={`space-y-3 rounded-xl border p-4 ${tone}`}>
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${status.connected ? "bg-ok" : "bg-danger"}`} />
        <h2 className={`font-semibold ${textTone}`}>
          QQ 机器人：{status.connected ? "运行中" : "未连接"}
        </h2>
      </div>

      {status.connected ? (
        <p className="text-sm text-ink-muted">
          机器人已与 QQ 协议端连接，注册、重置密码等功能正常。
        </p>
      ) : !status.reachable ? (
        <p className="text-sm text-ink">
          连不上机器人服务本身。请先在服务器上检查 bot 容器：
          <code className="ml-1 rounded bg-surface px-1.5 py-0.5 text-xs">
            docker compose logs bot
          </code>
        </p>
      ) : status.qr ? (
        <div className="space-y-3">
          <p className="text-sm text-ink">
            <strong>QQ 登录已失效，需要重新扫码。</strong>
            用手机 QQ（机器人账号）扫描下面的二维码即可恢复，无需登录服务器。
          </p>
          <BotQrPanel />
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
          <p className="text-ink-muted">
            NapCat 可能已停止尝试。请在服务器上执行：
          </p>
          <code className="block rounded bg-surface px-2 py-1 text-xs">
            cd ~/nefu-pa-web &amp;&amp; docker compose restart napcat
          </code>
          <p className="text-xs text-ink-subtle">
            重启后 NapCat 会重新生成二维码，刷新本页即可看到。
            （正常重启会自动快速登录，不会掉线。）
          </p>
        </div>
      )}
    </section>
  );
}
