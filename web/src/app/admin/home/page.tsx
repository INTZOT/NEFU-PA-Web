import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canEnterAdmin } from "@/lib/roles";
import { listAll } from "@/modules/setting/service";
import { Input, PageHeader, Textarea } from "@/components/ui";
import { Notice } from "@/components/Notice";

export default async function HomeCopyAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canEnterAdmin(user)) redirect("/me");

  const { ok, error } = await searchParams;
  const settings = await listAll();

  return (
    <div className="space-y-6">
      <PageHeader
        title="首页文案"
        description="这里是首页顶部（Hero）显示的文字。留空则回退到默认文案，不会变成空白。"
        backHref="/admin"
        backLabel="管理后台"
      />

      <Notice ok={ok} error={error} />

      <form action="/api/admin/settings" method="post" className="space-y-4">
        {settings.map((s) => {
          const def = s.key === "home.hero.subtitle";
          return (
            <div key={s.key} className="rounded-xl border border-line bg-surface p-4">
              <label className="block text-sm font-medium text-ink" htmlFor={s.key}>
                {s.label}
              </label>

              <div className="mt-2">
                {def ? (
                  <Textarea
                    id={s.key}
                    name={s.key}
                    rows={3}
                    maxLength={200}
                    defaultValue={s.value}
                  />
                ) : (
                  <Input id={s.key} name={s.key} maxLength={40} defaultValue={s.value} />
                )}
              </div>

              <p className="mt-2 text-xs text-ink-subtle">
                默认文案：{s.fallback}
              </p>
            </div>
          );
        })}

        <button
          type="submit"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong"
        >
          保存
        </button>
      </form>

      <p className="text-xs text-ink-subtle">
        提示：Hero 右侧的按钮随登录状态变化（未登录显示注册/登录，已登录显示约球/个人主页），
        因此其文字不在这里配置。
      </p>
    </div>
  );
}
