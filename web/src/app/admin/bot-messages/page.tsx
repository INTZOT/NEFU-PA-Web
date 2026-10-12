import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canEnterAdmin } from "@/lib/roles";
import { BOT_MESSAGES, PLACEHOLDERS } from "@/modules/bot/messages";
import { query } from "@/lib/db";
import { Textarea } from "@/components/ui";
import { Notice } from "@/components/Notice";

/**
 * 机器人回复文案的管理页。
 *
 * 文案存 site_settings（D-34 的键值表），与首页文案同一套机制：
 * 清空某项即回退到代码里的默认值，**不会让机器人说不出话**。
 */
export default async function BotMessagesAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canEnterAdmin(user)) redirect("/me");

  const { ok, error } = await searchParams;

  const rows = await query<{ key: string; value: string }>(
    "SELECT key, value FROM site_settings WHERE key LIKE 'bot.%'",
  );
  const saved = new Map(rows.map((r) => [r.key, r.value]));

  const placeholderList = Object.entries(PLACEHOLDERS)
    .map(([k, v]) => `{${k}} = ${v}`)
    .join("　");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">机器人文案</h1>
        <p className="mt-1 text-sm text-ink-muted">
          修改 QQ 机器人私聊回复的内容。保存后<strong>立即生效，无需重启机器人</strong>。
        </p>
        <p className="mt-2 rounded-lg border border-line bg-surface-muted px-3 py-2 text-xs text-ink-muted">
          可用占位符：{placeholderList}
        </p>
        <p className="mt-2 text-xs text-ink-subtle">
          留空则回退到默认文案。带 <strong>必须</strong> 标记的占位符不能删除 ——
          否则机器人会缺少关键信息（例如邀请码）。
        </p>
      </div>

      <Notice ok={ok} error={error} />

      <form action="/api/admin/bot-messages" method="post" className="space-y-4">
        {BOT_MESSAGES.map((def) => (
          <div key={def.key} className="rounded-xl border border-line bg-surface p-4">
            <label className="block text-sm font-medium text-ink" htmlFor={def.key}>
              {def.label}
            </label>
            <p className="mt-1 text-xs text-ink-muted">{def.hint}</p>

            {def.required.length > 0 ? (
              <p className="mt-1 text-xs text-warn">
                必须包含：
                {def.required.map((r) => `{${r}}`).join("、")}
              </p>
            ) : null}

            <div className="mt-2">
              <Textarea
                id={def.key}
                name={def.key}
                rows={Math.min(8, Math.max(2, def.fallback.split("\n").length + 1))}
                maxLength={def.maxLength}
                defaultValue={saved.get(def.key) ?? def.fallback}
              />
            </div>
          </div>
        ))}

        <button
          type="submit"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong"
        >
          保存
        </button>
      </form>
    </div>
  );
}
