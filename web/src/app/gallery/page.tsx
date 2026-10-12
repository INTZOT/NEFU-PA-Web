import { listAll } from "@/modules/photo/service";
import { EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "社团相册" };

export default async function GalleryPage() {
  const photos = await listAll();

  return (
    <div className="space-y-6">
      <PageHeader
        title="社团相册"
        description={photos.length > 0 ? `共 ${photos.length} 张照片` : undefined}
      />

      {photos.length === 0 ? (
        <EmptyState title="还没有照片" description="活动照片会陆续放上来。" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((p) => (
            <figure
              key={p.id}
              className="overflow-hidden rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(16,32,48,0.04)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/photos/${p.filename}`}
                alt={p.caption ?? "社团照片"}
                width={p.width ?? undefined}
                height={p.height ?? undefined}
                loading="lazy"
                className="aspect-[4/3] w-full bg-surface-muted object-cover"
              />
              {p.caption ? (
                <figcaption className="px-3 py-2.5 text-sm text-ink-muted">
                  {p.caption}
                </figcaption>
              ) : null}
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
