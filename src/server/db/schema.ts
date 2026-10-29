import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  geometry,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const point = (name: string) => geometry(name, { type: "point", mode: "xy", srid: 4326 });

// ─── Enums ────────────────────────────────────────────────────────────
export const userRole = pgEnum("user_role", ["user", "pro", "moderator", "local_admin", "global_admin"]);
export const accountStatus = pgEnum("account_status", ["active", "restricted", "suspended"]);
export const visibility = pgEnum("visibility", ["public", "followers", "private"]);
export const videoStatus = pgEnum("video_status", ["processing", "published", "failed", "hidden", "removed"]);
export const assetStatus = pgEnum("asset_status", ["uploaded", "processing", "ready", "failed"]);
export const assetKind = pgEnum("asset_kind", ["video", "image"]);
export const commentStatus = pgEnum("comment_status", ["visible", "hidden", "removed"]);
export const publishStatus = pgEnum("publish_status", ["draft", "published", "archived", "removed"]);
export const businessVerification = pgEnum("business_verification", ["unverified", "pending", "verified", "rejected"]);
export const businessMemberRole = pgEnum("business_member_role", ["owner", "editor"]);
export const requestStatus = pgEnum("request_status", ["pending", "approved", "rejected"]);
export const eventStatus = pgEnum("event_status", ["published", "cancelled", "removed"]);
export const attendanceStatus = pgEnum("attendance_status", ["going", "interested"]);
export const reportTarget = pgEnum("report_target", ["video", "comment", "user", "business", "event", "news"]);
export const reportReason = pgEnum("report_reason", [
  "spam",
  "harassment",
  "hate",
  "violence",
  "sexual",
  "illegal",
  "misinformation",
  "impersonation",
  "privacy",
  "other",
]);
export const reportStatus = pgEnum("report_status", ["open", "resolved", "dismissed"]);
export const moderationActionType = pgEnum("moderation_action_type", [
  "hide",
  "remove",
  "restore",
  "warn",
  "restrict",
  "suspend",
  "reactivate",
  "dismiss",
]);
export const notificationType = pgEnum("notification_type", [
  "follow",
  "like",
  "comment",
  "reply",
  "mention",
  "new_video",
  "video_ready",
  "video_failed",
  "business_claim",
  "moderation",
  "event_reminder",
]);
export const jobStatus = pgEnum("job_status", ["pending", "running", "done", "failed"]);
export const businessPlan = pgEnum("business_plan", ["free", "premium"]);

// ─── Authentification (tables gérées par Better Auth) ───────────────────
export const user = pgTable("user", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: userRole("role").notNull().default("user"),
  status: accountStatus("status").notNull().default("active"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = pgTable(
  "session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// ─── Villes et zones ──────────────────────────────────────────────────
export const cities = pgTable(
  "cities",
  {
    id: id(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    region: text("region"),
    country: text("country").notNull().default("FR"),
    timezone: text("timezone").notNull().default("Europe/Paris"),
    center: point("center").notNull(),
    radiusKm: integer("radius_km").notNull().default(15),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("cities_center_gix").using("gist", t.center)],
);

export const zones = pgTable(
  "zones",
  {
    id: id(),
    cityId: uuid("city_id")
      .notNull()
      .references(() => cities.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    center: point("center"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("zones_city_slug_uq").on(t.cityId, t.slug)],
);

/** Administrateurs locaux : périmètre de gestion par ville. */
export const cityAdmins = pgTable(
  "city_admins",
  {
    cityId: uuid("city_id")
      .notNull()
      .references(() => cities.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.cityId, t.userId] })],
);

// ─── Profils et préférences ───────────────────────────────────────────
export type NotificationPrefs = Partial<Record<(typeof notificationType.enumValues)[number], boolean>>;

export const profiles = pgTable(
  "profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    username: text("username").notNull(),
    bio: text("bio"),
    cityId: uuid("city_id").references(() => cities.id, { onDelete: "set null" }),
    isPrivate: boolean("is_private").notNull().default(false),
    allowComments: boolean("allow_comments").notNull().default(true),
    notificationPrefs: jsonb("notification_prefs").$type<NotificationPrefs>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("profiles_username_uq").on(sql`lower(${t.username})`)],
);

// ─── Taxonomie ────────────────────────────────────────────────────────
export const categories = pgTable("categories", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  icon: text("icon").notNull().default("sparkles"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
});

export const hashtags = pgTable("hashtags", {
  id: id(),
  tag: text("tag").notNull().unique(),
  isBlocked: boolean("is_blocked").notNull().default(false),
  createdAt: createdAt(),
});

export const categoryFollows = pgTable(
  "category_follows",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.categoryId] })],
);

// ─── Médias ───────────────────────────────────────────────────────────
export type AssetVariants = { video?: string; poster?: string };

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: id(),
    ownerId: uuid("owner_id").references(() => user.id, { onDelete: "set null" }),
    kind: assetKind("kind").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    durationSec: integer("duration_sec"),
    status: assetStatus("status").notNull().default("uploaded"),
    variants: jsonb("variants").$type<AssetVariants>().notNull().default({}),
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("media_owner_idx").on(t.ownerId)],
);

// ─── Commerces ────────────────────────────────────────────────────────
export type OpeningHours = Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", string>>;

export const businesses = pgTable(
  "businesses",
  {
    id: id(),
    cityId: uuid("city_id")
      .notNull()
      .references(() => cities.id),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    logoUrl: text("logo_url"),
    coverUrl: text("cover_url"),
    address: text("address"),
    location: point("location"),
    phone: text("phone"),
    email: text("email"),
    website: text("website"),
    links: jsonb("links").$type<{ label: string; url: string }[]>().notNull().default([]),
    hours: jsonb("hours").$type<OpeningHours>().notNull().default({}),
    verification: businessVerification("verification").notNull().default("unverified"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    plan: businessPlan("plan").notNull().default("free"),
    isHidden: boolean("is_hidden").notNull().default(false),
    isDemo: boolean("is_demo").notNull().default(false),
    createdById: uuid("created_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("businesses_city_idx").on(t.cityId),
    index("businesses_location_gix").using("gist", t.location),
    check("verified_has_date", sql`${t.verification} <> 'verified' OR ${t.verifiedAt} IS NOT NULL`),
  ],
);

export const businessMembers = pgTable(
  "business_members",
  {
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: businessMemberRole("role").notNull().default("editor"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.businessId, t.userId] }), index("business_members_user_idx").on(t.userId)],
);

export const businessClaims = pgTable(
  "business_claims",
  {
    id: id(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    message: text("message").notNull(),
    proof: text("proof").notNull(),
    status: requestStatus("status").notNull().default("pending"),
    reviewedById: uuid("reviewed_by_id").references(() => user.id, { onDelete: "set null" }),
    reviewNote: text("review_note"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("business_claims_pending_uq").on(t.businessId, t.userId).where(sql`${t.status} = 'pending'`),
  ],
);

export const businessFollows = pgTable(
  "business_follows",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.businessId] })],
);

// ─── Lieux à découvrir ────────────────────────────────────────────────
export const places = pgTable(
  "places",
  {
    id: id(),
    cityId: uuid("city_id")
      .notNull()
      .references(() => cities.id),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    address: text("address"),
    coverUrl: text("cover_url"),
    location: point("location"),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("places_city_idx").on(t.cityId), index("places_location_gix").using("gist", t.location)],
);

// ─── Événements ───────────────────────────────────────────────────────
export const events = pgTable(
  "events",
  {
    id: id(),
    cityId: uuid("city_id")
      .notNull()
      .references(() => cities.id),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    organizerId: uuid("organizer_id").references(() => user.id, { onDelete: "set null" }),
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "set null" }),
    placeId: uuid("place_id").references(() => places.id, { onDelete: "set null" }),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    coverUrl: text("cover_url"),
    venueName: text("venue_name"),
    address: text("address"),
    location: point("location"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    conditions: text("conditions"),
    externalUrl: text("external_url"),
    capacity: integer("capacity"),
    status: eventStatus("status").notNull().default("published"),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("events_city_starts_idx").on(t.cityId, t.startsAt),
    check("events_dates_order", sql`${t.endsAt} >= ${t.startsAt}`),
  ],
);

export const eventAttendees = pgTable(
  "event_attendees",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: attendanceStatus("status").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.userId] })],
);

// ─── Vidéos ───────────────────────────────────────────────────────────
export const videos = pgTable(
  "videos",
  {
    id: id(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    cityId: uuid("city_id")
      .notNull()
      .references(() => cities.id),
    zoneId: uuid("zone_id").references(() => zones.id, { onDelete: "set null" }),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => mediaAssets.id),
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "set null" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    placeId: uuid("place_id").references(() => places.id, { onDelete: "set null" }),
    caption: text("caption").notNull().default(""),
    visibility: visibility("visibility").notNull().default("public"),
    status: videoStatus("status").notNull().default("processing"),
    allowComments: boolean("allow_comments").notNull().default(true),
    /** Position approximative (arrondie ~100 m), uniquement si l'auteur l'a choisie. */
    location: point("location"),
    /** Contenu sponsorisé : doit toujours être affiché comme tel. */
    sponsoredByBusinessId: uuid("sponsored_by_business_id").references(() => businesses.id, {
      onDelete: "set null",
    }),
    likeCount: integer("like_count").notNull().default(0),
    commentCount: integer("comment_count").notNull().default(0),
    viewCount: integer("view_count").notNull().default(0),
    shareCount: integer("share_count").notNull().default(0),
    isDemo: boolean("is_demo").notNull().default(false),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("videos_city_published_idx").on(t.cityId, t.publishedAt),
    index("videos_author_idx").on(t.authorId, t.createdAt),
    index("videos_business_idx").on(t.businessId),
    index("videos_caption_fts").using("gin", sql`to_tsvector('french', ${t.caption})`),
  ],
);

export const videoHashtags = pgTable(
  "video_hashtags",
  {
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    hashtagId: uuid("hashtag_id")
      .notNull()
      .references(() => hashtags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.videoId, t.hashtagId] }), index("video_hashtags_tag_idx").on(t.hashtagId)],
);

/** Exposition d'un utilisateur à une vidéo — signal anti-répétition du flux. */
export const videoViews = pgTable(
  "video_views",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    count: integer("count").notNull().default(1),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.videoId] })],
);

// ─── Interactions sociales ────────────────────────────────────────────
export const follows = pgTable(
  "follows",
  {
    followerId: uuid("follower_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    followingId: uuid("following_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Compte privé : l'abonnement reste en attente jusqu'à acceptation. */
    accepted: boolean("accepted").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followingId] }),
    index("follows_following_idx").on(t.followingId),
    check("follows_not_self", sql`${t.followerId} <> ${t.followingId}`),
  ],
);

export const blocks = pgTable(
  "blocks",
  {
    blockerId: uuid("blocker_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    blockedId: uuid("blocked_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.blockerId, t.blockedId] }),
    index("blocks_blocked_idx").on(t.blockedId),
    check("blocks_not_self", sql`${t.blockerId} <> ${t.blockedId}`),
  ],
);

export const likes = pgTable(
  "likes",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.videoId] }), index("likes_video_idx").on(t.videoId)],
);

export const comments = pgTable(
  "comments",
  {
    id: id(),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    body: text("body").notNull(),
    status: commentStatus("status").notNull().default("visible"),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("comments_video_idx").on(t.videoId, t.createdAt),
    index("comments_parent_idx").on(t.parentId),
    check("comments_body_len", sql`char_length(${t.body}) BETWEEN 1 AND 1000`),
  ],
);

// ─── Actualités locales ───────────────────────────────────────────────
export const newsArticles = pgTable(
  "news_articles",
  {
    id: id(),
    cityId: uuid("city_id")
      .notNull()
      .references(() => cities.id),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    authorId: uuid("author_id").references(() => user.id, { onDelete: "set null" }),
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "set null" }),
    sourceName: text("source_name"),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    body: text("body").notNull(),
    coverUrl: text("cover_url"),
    isBrief: boolean("is_brief").notNull().default(false),
    status: publishStatus("status").notNull().default("draft"),
    isDemo: boolean("is_demo").notNull().default(false),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("news_city_published_idx").on(t.cityId, t.publishedAt),
    index("news_fts").using("gin", sql`to_tsvector('french', ${t.title} || ' ' || ${t.summary})`),
  ],
);

/** Favoris privés : exactement une cible par ligne. */
export const bookmarks = pgTable(
  "bookmarks",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    videoId: uuid("video_id").references(() => videos.id, { onDelete: "cascade" }),
    newsId: uuid("news_id").references(() => newsArticles.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("bookmarks_video_uq").on(t.userId, t.videoId).where(sql`${t.videoId} IS NOT NULL`),
    uniqueIndex("bookmarks_news_uq").on(t.userId, t.newsId).where(sql`${t.newsId} IS NOT NULL`),
    uniqueIndex("bookmarks_event_uq").on(t.userId, t.eventId).where(sql`${t.eventId} IS NOT NULL`),
    check("bookmarks_one_target", sql`num_nonnulls(${t.videoId}, ${t.newsId}, ${t.eventId}) = 1`),
  ],
);

// ─── Notifications ────────────────────────────────────────────────────
export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => user.id, { onDelete: "cascade" }),
    type: notificationType("type").notNull(),
    videoId: uuid("video_id").references(() => videos.id, { onDelete: "cascade" }),
    commentId: uuid("comment_id").references(() => comments.id, { onDelete: "cascade" }),
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }),
    message: text("message"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt)],
);

// ─── Modération ───────────────────────────────────────────────────────
export const reports = pgTable(
  "reports",
  {
    id: id(),
    reporterId: uuid("reporter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    targetType: reportTarget("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    cityId: uuid("city_id").references(() => cities.id, { onDelete: "set null" }),
    reason: reportReason("reason").notNull(),
    details: text("details"),
    status: reportStatus("status").notNull().default("open"),
    resolvedById: uuid("resolved_by_id").references(() => user.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("reports_once_per_target_uq")
      .on(t.reporterId, t.targetType, t.targetId)
      .where(sql`${t.status} = 'open'`),
    index("reports_queue_idx").on(t.status, t.createdAt),
    index("reports_target_idx").on(t.targetType, t.targetId),
  ],
);

export const moderationActions = pgTable(
  "moderation_actions",
  {
    id: id(),
    moderatorId: uuid("moderator_id").references(() => user.id, { onDelete: "set null" }),
    targetType: reportTarget("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    /** Utilisateur concerné par la décision (auteur du contenu), pour la contestation. */
    subjectUserId: uuid("subject_user_id").references(() => user.id, { onDelete: "set null" }),
    action: moderationActionType("action").notNull(),
    reason: text("reason").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("moderation_target_idx").on(t.targetType, t.targetId)],
);

export const appeals = pgTable(
  "appeals",
  {
    id: id(),
    actionId: uuid("action_id")
      .notNull()
      .references(() => moderationActions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    message: text("message").notNull(),
    status: requestStatus("status").notNull().default("pending"),
    decidedById: uuid("decided_by_id").references(() => user.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("appeals_one_per_action_uq").on(t.actionId, t.userId)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    actorId: uuid("actor_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("audit_created_idx").on(t.createdAt)],
);

// ─── Plateforme ───────────────────────────────────────────────────────
export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: updatedAt(),
});

/** File de tâches asynchrones (traitement vidéo…), consommée avec SKIP LOCKED. */
export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, string>>().notNull(),
    status: jobStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("jobs_pending_idx").on(t.status, t.runAt)],
);
