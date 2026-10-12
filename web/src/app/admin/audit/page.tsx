import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { isSuperAdmin } from "@/lib/roles";
import { listRecent, ACTION_LABEL } from "@/modules/audit/service";

function formatTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default async function AuditPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // 操作纪录是超管视角的追溯工具，与「成员与权限」同级
  if (!isSuperAdmin(user)) redirect("/admin");

  const entries = await listRecent(100);

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin" className="text-sm text-neutral-500 hover:text-neutral-900">
          ← 管理后台
        </Link>
        <h1 className="mt-1 text-xl font-bold">操作记录</h1>
        <p className="mt-1 text-sm text-neutral-500">
          记录管理动作。超级管理员账号是共用的，因此这里记录的是「账号」而非具体的人。
        </p>
      </div>

      {entries.length === 0 ? (
        <p className="rounded-lg border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-500">
          还没有操作记录。
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">时间</th>
                <th className="px-4 py-2 font-medium">操作者</th>
                <th className="px-4 py-2 font-medium">动作</th>
                <th className="px-4 py-2 font-medium">对象</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2 whitespace-nowrap text-neutral-500">
                    {formatTime(e.createdAt)}
                  </td>
                  <td className="px-4 py-2">{e.actorName}</td>
                  <td className="px-4 py-2">{ACTION_LABEL[e.action] ?? e.action}</td>
                  <td className="px-4 py-2 text-neutral-600">{e.detail ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
