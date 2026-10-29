import { sql } from "drizzle-orm";
import { videos } from "../db/schema";

const NOBODY = "00000000-0000-0000-0000-000000000000";

/**
 * Condition SQL : la vidéo est visible par ce lecteur (null = anonyme).
 * Publiée, non supprimée, auteur non suspendu, visibilité respectée, aucun blocage.
 */
export function videoVisibleTo(viewerId: string | null) {
  const v = viewerId ?? NOBODY;
  return sql`(${videos.status} = 'published' and ${videos.deletedAt} is null
    and not exists (select 1 from "user" u where u.id = ${videos.authorId} and u.status = 'suspended')
    and (
      ${videos.authorId} = ${v}
      or (${videos.visibility} = 'public' and not exists (select 1 from profiles p where p.user_id = ${videos.authorId} and p.is_private))
      or (${videos.visibility} <> 'private' and exists (select 1 from follows f where f.follower_id = ${v} and f.following_id = ${videos.authorId} and f.accepted))
    )
    and not exists (select 1 from blocks b where (b.blocker_id = ${v} and b.blocked_id = ${videos.authorId})
                                           or (b.blocker_id = ${videos.authorId} and b.blocked_id = ${v})))`;
}

/** Les deux utilisateurs se sont-ils bloqués (dans un sens ou l'autre) ? */
export function blockedBetween(a: string, b: string) {
  return sql`exists (select 1 from blocks where (blocker_id = ${a} and blocked_id = ${b}) or (blocker_id = ${b} and blocked_id = ${a}))`;
}
