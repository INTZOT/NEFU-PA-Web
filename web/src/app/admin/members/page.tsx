import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { isSuperAdmin } from "@/lib/roles";
import { listMembers } from "@/modules/account/admin";
import { Notice } from "@/components/Notice";

const ROLE_LABEL: Record<string, string> = {
  member: "成员",
  admin: "管理员",
  super_admin: "超级管理员",
};

export default async function MembersAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // 设置管理员是超管专属能力（D-16），管理员不能进这一页
  if (!isSuperAdmin(user)) redirect("/admin");

  const { ok, error } = await searchParams;
  const members = await listMembers();

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin" className="text-sm text-neutral-500 hover:text-neutral-900">
          ← 管理后台
        </Link>
        <h1 className="mt-1 text-xl font-bold">成员与权限</h1>
        <p className="mt-1 text-sm text-neutral-500">
          管理员由超级管理员设置。管理员可以发布公告与活动，并在自动流程失效时做人工兜底。
        </p>
      </div>

      <Notice ok={ok} error={error} />

      <ul className="space-y-2">
        {members.map((m) => {
          const isSelf = m.id === user.id;
          const isSuper = m.role === "super_admin";
          // 自己与超管账号都不提供操作按钮（服务端同样会拒，见 account/admin.ts）
          const canAct = !isSelf && !isSuper;

          return (
            <li
              key={m.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-200 bg-white p-4"
            >
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{m.name}</span>
                  <span
                    className={
                      m.role === "super_admin"
                        ? "rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-800"
                        : m.role === "admin"
                          ? "rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-800"
                          : "rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600"
                    }
                  >
                    {ROLE_LABEL[m.role] ?? m.role}
                  </span>
                  {isSelf ? (
                    <span className="text-xs text-neutral-400">（我自己）</span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-neutral-400">
                  {m.studentId} · QQ {m.qqNumber}
                </p>
              </div>

              {canAct ? (
                <form
                  action={`/api/admin/members/${m.id}/role`}
                  method="post"
                  className="flex items-center gap-2"
                >
                  <input type="hidden" name="role" value={m.role === "admin" ? "member" : "admin"} />
                  <button
                    type="submit"
                    className={
                      m.role === "admin"
                        ? "rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:text-neutral-900"
                        : "rounded bg-neutral-900 px-3 py-1.5 text-sm text-white"
                    }
                  >
                    {m.role === "admin" ? "取消管理员" : "设为管理员"}
                  </button>
                </form>
              ) : (
                <span className="text-xs text-neutral-400">
                  {isSuper ? "超管账号不可修改" : "不能修改自己"}
                </span>
              )}

              {canAct ? (
                <details className="w-full">
                  <summary className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-900">
                    人工兜底（改密码 / 换绑）
                  </summary>
                  <div className="mt-3 grid gap-4 border-t border-neutral-100 pt-3 sm:grid-cols-2">
                    <form
                      action={`/api/admin/members/${m.id}/password`}
                      method="post"
                      className="space-y-2"
                    >
                      <p className="text-xs font-medium text-neutral-700">代设临时密码</p>
                      <p className="text-xs text-neutral-500">
                        用于「重置时输错新密码导致锁死」（D-16）。
                      </p>
                      <input
                        name="password"
                        required
                        minLength={6}
                        placeholder="临时密码（至少 6 位）"
                        className="w-full rounded border border-neutral-300 px-3 py-1.5 text-sm"
                      />
                      <button
                        type="submit"
                        className="rounded border border-neutral-300 px-3 py-1.5 text-xs"
                      >
                        设置密码
                      </button>
                    </form>

                    <form
                      action={`/api/admin/members/${m.id}/credentials`}
                      method="post"
                      className="space-y-2"
                    >
                      <p className="text-xs font-medium text-neutral-700">代改凭据</p>
                      <p className="text-xs text-neutral-500">
                        用于「QQ 号被盗/停用」这类死局（D-16）。
                      </p>
                      <input
                        name="qqNumber"
                        defaultValue={m.qqNumber}
                        required
                        pattern="[0-9]{5,12}"
                        placeholder="QQ 号"
                        className="w-full rounded border border-neutral-300 px-3 py-1.5 text-sm"
                      />
                      <input
                        name="studentId"
                        defaultValue={m.studentId}
                        required
                        pattern="[0-9]{10}"
                        placeholder="学号"
                        className="w-full rounded border border-neutral-300 px-3 py-1.5 text-sm"
                      />
                      <button
                        type="submit"
                        className="rounded border border-neutral-300 px-3 py-1.5 text-xs"
                      >
                        保存凭据
                      </button>
                    </form>
                  </div>
                  <p className="mt-2 text-xs text-amber-700">
                    ⚠️ 这两项都是对他人账号的直接改动，会记入操作记录。
                  </p>
                </details>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}