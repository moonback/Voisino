import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Cover, DemoBadge, Page } from "@/components/bits";
import { ReportButton, SaveButton, ShareButton } from "@/components/content-actions";
import { getViewer } from "@/server/session";
import { getNews } from "@/server/services/content";
import { isBookmarked } from "@/server/services/social";

export async function generateMetadata({ params }: PageProps<"/actualites/[slug]">): Promise<Metadata> {
  const n = await getNews((await params).slug, null);
  return n ? { title: n.article.title, description: n.article.summary } : { title: "Actualité introuvable" };
}

export default async function NewsPage({ params }: PageProps<"/actualites/[slug]">) {
  const { slug } = await params;
  const viewer = await getViewer();
  const n = await getNews(slug, viewer);
  if (!n) notFound();
  const a = n.article;
  const saved = viewer ? await isBookmarked(viewer.id, { newsId: a.id }) : false;
  const date = a.publishedAt ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(a.publishedAt) : "Brouillon";

  return (
    <Page>
      <article>
        <p className="flex items-center gap-2 text-sm font-semibold text-primary">
          <Link href={`/actualites?ville=${n.citySlug}`}>{n.cityName}</Link> · {a.isBrief ? "Brève" : (n.categoryName ?? "Actualité")} <DemoBadge show={a.isDemo} />
        </p>
        <h1 className="mt-2 text-4xl leading-tight font-extrabold">{a.title}</h1>
        <p className="mt-3 text-xl text-muted-foreground">{a.summary}</p>
        <p className="mt-4 text-sm text-muted-foreground">
          {a.sourceName ?? n.authorName ?? "Voisino"}
          {n.businessSlug && (
            <>
              {" "}
              pour{" "}
              <Link href={`/commerces/${n.businessSlug}`} className="font-semibold underline">
                {n.businessName}
              </Link>
            </>
          )}{" "}
          · <time dateTime={a.publishedAt?.toISOString()}>{date}</time>
          {a.status !== "published" && <span className="ml-2 rounded bg-secondary px-2 py-0.5 font-semibold">{a.status === "draft" ? "Brouillon" : "Retirée"}</span>}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <SaveButton target={{ newsId: a.id }} initial={saved} signedIn={Boolean(viewer)} />
          <ShareButton path={`/actualites/${a.slug}`} title={a.title} />
          <ReportButton targetType="news" targetId={a.id} signedIn={Boolean(viewer)} />
        </div>
        {a.coverUrl && <Cover src={a.coverUrl} title={a.title} kind="news" className="mt-8" />}
        <div className="mt-8 space-y-4 text-lg leading-relaxed">
          {a.body.split(/\n{2,}/).map((p, i) => (
            <p key={i} className="whitespace-pre-wrap">
              {p}
            </p>
          ))}
        </div>
      </article>
      {n.related.length > 0 && (
        <aside className="mt-12 border-t pt-6" aria-labelledby="related">
          <h2 id="related" className="text-lg font-bold">
            À lire aussi à {n.cityName}
          </h2>
          <ul className="mt-3 grid gap-2">
            {n.related.map((r) => (
              <li key={r.slug}>
                <Link href={`/actualites/${r.slug}`} className="font-medium hover:underline">
                  {r.title}
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </Page>
  );
}
