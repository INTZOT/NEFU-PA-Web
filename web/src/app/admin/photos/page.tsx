import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canEnterAdmin } from "@/lib/roles";
import { listAll } from "@/modules/photo/service";
import { PhotoUploader } from "@/components/PhotoUploader";
import { Badge, Button, Card, EmptyState, Input, PageHeader } from "@/components/ui";
import { Notice } from "@/components/Notice";

export default async function PhotoAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canEnterAdmin(user)) redirect("/me");

  const { ok, error } = await searchParams;
  const photos = await listAll();
  const featuredCount = photos.filter((p) => p.isFeatured).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="社团照片"
        description={`共 ${photos.length} 张，其中 ${featuredCount} 张上了首页精选。上传时自动压缩，无需自己处理。`}
        backHref="/admin"
        backLabel="管理后台"
      />

      <Notice ok={ok} error={error} />

      <Card className="p-5">
        <h2 className="font-semibold text-ink">上传照片</h2>
        <div className="mt-3">
          <PhotoUploader action="/api/admin/photos" />
        </div>
      </Card>

      {photos.length === 0 ? (
        <EmptyState
          title="还没有照片"
          description="上传第一张吧。带说明的照片展示价值更高。"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {photos.map((p) => (
            <Card key={p.id} className="overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/photos/${p.filename}`}
                alt={p.caption ?? "社团照片"}
                width={p.width ?? undefined}
                height={p.height ?? undefined}
                className="aspect-[4/3] w-full bg-surface-muted object-cover"
              />
              <div className="space-y-3 p-4">
                <div className="flex items-center gap-2">
                  {p.isFeatured ? <Badge tone="accent">首页精选</Badge> : null}
                  <span className="text-xs text-ink-subtle">
                    {new Date(p.createdAt).toLocaleDateString("zh-CN")}
                  </span>
                </div>

                {/* 改说明 */}
                <form action={`/api/admin/photos/${p.id}`} method="post" className="flex gap-2">
                  <input type="hidden" name="action" value="caption" />
                  <Input
                    name="caption"
                    defaultValue={p.caption ?? ""}
                    maxLength={80}
                    placeholder="添加说明"
                    className="!py-1.5 !text-xs"
                  />
                  <Button type="submit" variant="secondary" size="sm">
                    保存
                  </Button>
                </form>

                <div className="flex items-center gap-2">
                  <form action={`/api/admin/photos/${p.id}`} method="post">
                    <input type="hidden" name="action" value="toggle-featured" />
                    <Button type="submit" variant="secondary" size="sm">
                      {p.isFeatured ? "取消精选" : "设为精选"}
                    </Button>
                  </form>
                  <form action={`/api/admin/photos/${p.id}`} method="post">
                    <input type="hidden" name="action" value="delete" />
                    <Button type="submit" variant="ghost" size="sm" className="!text-danger">
                      删除
                    </Button>
                  </form>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
