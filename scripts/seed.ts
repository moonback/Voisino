/**
 * Données de DÉMONSTRATION (clairement marquées `is_demo`). Ne pas exécuter en production.
 * Usage : npm run db:seed   (ou npm run db:reset -- --yes pour tout réinitialiser)
 *
 * Les vidéos sont générées localement avec FFmpeg (motifs abstraits, aucune personne réelle)
 * puis passent par le vrai pipeline de traitement (transcodage + miniature).
 */
import "dotenv/config";
import { execFile } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { hashPassword } from "better-auth/crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../src/server/db";
import * as s from "../src/server/db/schema";
import { processVideoAsset } from "../src/server/services/media";
import { putFile } from "../src/server/storage";
import { slugify } from "../src/lib/text";

const run = promisify(execFile);
export const DEMO_PASSWORD = "voisino-demo-2026";
const DAY = 86_400_000;
const pick = <T>(arr: T[], i: number) => arr[i % arr.length]!;

const CATEGORIES = [
  ["Bonnes adresses", "utensils"],
  ["Sorties", "party-popper"],
  ["Culture", "palette"],
  ["Sport", "dumbbell"],
  ["Nature", "trees"],
  ["Commerces & marchés", "store"],
  ["Vie de quartier", "users"],
  ["Infos utiles", "info"],
  ["Famille", "baby"],
  ["Patrimoine", "landmark"],
] as const;

const CITIES = [
  { name: "Lyon", region: "Auvergne-Rhône-Alpes", lat: 45.764, lng: 4.8357, zones: ["Croix-Rousse", "Presqu'île", "Vieux Lyon", "Guillotière"] },
  { name: "Bordeaux", region: "Nouvelle-Aquitaine", lat: 44.8378, lng: -0.5792, zones: ["Chartrons", "Saint-Pierre", "La Bastide"] },
  { name: "Nantes", region: "Pays de la Loire", lat: 47.2184, lng: -1.5536, zones: ["Bouffay", "Île de Nantes"] },
  { name: "Marseille", region: "Provence-Alpes-Côte d'Azur", lat: 43.2965, lng: 5.3698, zones: ["Le Panier", "Cours Julien"] },
  { name: "Lille", region: "Hauts-de-France", lat: 50.6292, lng: 3.0573, zones: ["Vieux-Lille", "Wazemmes"] },
  { name: "Strasbourg", region: "Grand Est", lat: 48.5734, lng: 7.7521, zones: ["Petite France", "Krutenau"] },
];

const USERS = [
  { email: "admin@voisino.test", name: "Camille Admin", username: "camille_admin", role: "global_admin", city: "lyon" },
  { email: "moderation@voisino.test", name: "Sami Modération", username: "sami_modo", role: "moderator", city: "lyon" },
  { email: "lyon-admin@voisino.test", name: "Inès Lyon", username: "ines_lyon", role: "local_admin", city: "lyon" },
  { email: "fournil@voisino.test", name: "Hugo Fournil", username: "hugo_fournil", role: "pro", city: "lyon" },
  { email: "lea@voisino.test", name: "Léa Martin", username: "lea_croixrousse", role: "user", city: "lyon" },
  { email: "tom@voisino.test", name: "Tom Bernard", username: "tom_presquile", role: "user", city: "lyon" },
  { email: "nora@voisino.test", name: "Nora Diallo", username: "nora_bdx", role: "user", city: "bordeaux" },
  { email: "yanis@voisino.test", name: "Yanis Petit", username: "yanis_nantes", role: "user", city: "nantes" },
  { email: "julie@voisino.test", name: "Julie Roux", username: "julie_panier", role: "user", city: "marseille" },
  { email: "malik@voisino.test", name: "Malik Lefèvre", username: "malik_wazemmes", role: "user", city: "lille" },
  { email: "nonverifie@voisino.test", name: "Alex Nouveau", username: "alex_nouveau", role: "user", city: "lyon", unverified: true },
] as const;

/** Motifs vidéo FFmpeg (lavfi) — abstraits, libres de droits. */
const PATTERNS = [
  "gradients=s=720x1280:c0=0xc2410c:c1=0x0f766e:c2=0xfbbf24:speed=0.015:r=30",
  "life=s=720x1280:mold=10:r=30:ratio=0.1:death_color=#1c1917:life_color=#fb923c",
  "mandelbrot=s=720x1280:r=30",
  "gradients=s=720x1280:c0=0x1e3a8a:c1=0xf472b6:c2=0x2dd4bf:speed=0.02:r=30",
  "cellauto=s=720x1280:rule=30:r=30",
  "gradients=s=1280x720:c0=0x14532d:c1=0xfde68a:speed=0.01:r=30",
  "testsrc2=s=720x1280:r=30",
];

async function demoClip(dir: string, i: number) {
  const file = path.join(dir, `clip-${i}.mp4`);
  const withAudio = i % 3 !== 0;
  const args = ["-y", "-v", "error", "-f", "lavfi", "-i", pick(PATTERNS, i), "-t", String(5 + (i % 4))];
  if (withAudio) args.push("-f", "lavfi", "-i", `sine=frequency=${220 + (i % 5) * 110}:sample_rate=44100`, "-t", String(5 + (i % 4)), "-af", "volume=0.08");
  args.push("-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", ...(withAudio ? ["-c:a", "aac", "-shortest"] : []), file);
  await run(process.env.FFMPEG_PATH || "ffmpeg", args);
  return file;
}

export async function seed() {
  const [existing] = await db.select({ n: sql<number>`count(*)::int` }).from(s.cities);
  if (existing!.n > 0) {
    console.log("La base contient déjà des données : utilisez `npm run db:reset -- --yes` pour repartir de zéro.");
    return;
  }
  console.log("→ Catégories, villes, zones");
  const cats = await db
    .insert(s.categories)
    .values(CATEGORIES.map(([name, icon], i) => ({ name, icon, slug: slugify(name), sortOrder: i })))
    .returning();
  const cat = (slug: string) => cats.find((c) => c.slug === slug)!.id;

  const cityRows = await db
    .insert(s.cities)
    .values(CITIES.map((c) => ({ name: c.name, slug: slugify(c.name), region: c.region, center: { x: c.lng, y: c.lat }, description: `Ville de démonstration : ${c.name}.` })))
    .returning();
  const city = (slug: string) => cityRows.find((c) => c.slug === slug)!;
  const zoneRows = await db
    .insert(s.zones)
    .values(CITIES.flatMap((c) => c.zones.map((z) => ({ cityId: city(slugify(c.name)).id, name: z, slug: slugify(z) }))))
    .returning();
  const zone = (name: string) => zoneRows.find((z) => z.name === name)!.id;

  console.log("→ Comptes de démonstration (mot de passe commun documenté dans le README)");
  const hash = await hashPassword(DEMO_PASSWORD);
  const users: Record<string, string> = {};
  for (const u of USERS) {
    const [row] = await db
      .insert(s.user)
      .values({ email: u.email, name: u.name, emailVerified: !("unverified" in u), role: u.role, isDemo: true })
      .returning({ id: s.user.id });
    await db.insert(s.account).values({ userId: row!.id, accountId: row!.id, providerId: "credential", password: hash });
    await db.insert(s.profiles).values({
      userId: row!.id,
      username: u.username,
      cityId: city(u.city).id,
      bio: u.role === "pro" ? "Artisan boulanger à la Croix-Rousse depuis 2012 (compte de démonstration)." : "Compte de démonstration Voisino.",
      isPrivate: u.username === "malik_wazemmes",
    });
    users[u.username] = row!.id;
  }
  await db.insert(s.cityAdmins).values({ cityId: city("lyon").id, userId: users.ines_lyon! });

  console.log("→ Commerces, lieux, événements, actualités");
  const biz = await db
    .insert(s.businesses)
    .values([
      { name: "Le Fournil de la Croix-Rousse", cityId: city("lyon").id, categoryId: cat("commerces-marches"), address: "Montée de la Grande-Côte, Lyon", location: { x: 4.8325, y: 45.7712 }, description: "Pains au levain, viennoiseries maison. Fiche de démonstration.", phone: "04 00 00 00 00", website: "https://example.com", hours: { tue: "7h – 19h", wed: "7h – 19h", thu: "7h – 19h", fri: "7h – 19h", sat: "7h – 13h" }, verification: "verified" as const, verifiedAt: new Date(), plan: "premium" as const },
      { name: "Café des Pentes", cityId: city("lyon").id, categoryId: cat("bonnes-adresses"), address: "Pentes de la Croix-Rousse, Lyon", location: { x: 4.8338, y: 45.7695 }, description: "Café de quartier, brunch le dimanche. Fiche non revendiquée (démonstration)." },
      { name: "Librairie du Vieux Lyon", cityId: city("lyon").id, categoryId: cat("culture"), address: "Rue Saint-Jean, Lyon", location: { x: 4.8274, y: 45.7622 }, description: "Librairie indépendante (démonstration)." },
      { name: "Cave des Chartrons", cityId: city("bordeaux").id, categoryId: cat("commerces-marches"), address: "Quai des Chartrons, Bordeaux", description: "Caviste de quartier (démonstration)." },
      { name: "Atelier Vélo Bouffay", cityId: city("nantes").id, categoryId: cat("vie-de-quartier"), address: "Quartier Bouffay, Nantes", description: "Atelier participatif de réparation (démonstration)." },
      { name: "Poissonnerie du Vallon", cityId: city("marseille").id, categoryId: cat("commerces-marches"), address: "Vallon des Auffes, Marseille", description: "Pêche locale (démonstration)." },
      { name: "Estaminet de Wazemmes", cityId: city("lille").id, categoryId: cat("bonnes-adresses"), address: "Wazemmes, Lille", description: "Cuisine flamande (démonstration)." },
    ].map((b) => ({ ...b, slug: slugify(b.name), isDemo: true })))
    .returning();
  const b = (name: string) => biz.find((x) => x.name === name)!;
  await db.insert(s.businessMembers).values({ businessId: b("Le Fournil de la Croix-Rousse").id, userId: users.hugo_fournil!, role: "owner" });
  await db.insert(s.businessClaims).values({ businessId: b("Café des Pentes").id, userId: users.tom_presquile!, message: "Je suis le gérant du café depuis 2021 et souhaite gérer la fiche.", proof: "SIRET 000 000 000 00000 (démonstration)" });

  const placeRows = await db
    .insert(s.places)
    .values([
      { name: "Jardin des Chartreux", cityId: city("lyon").id, categoryId: cat("nature"), description: "Belvédère sur la Saône." },
      { name: "Traboules du Vieux Lyon", cityId: city("lyon").id, categoryId: cat("patrimoine"), description: "Passages historiques entre les immeubles." },
      { name: "Miroir d'eau", cityId: city("bordeaux").id, categoryId: cat("patrimoine"), description: "Grand bassin face à la place de la Bourse." },
      { name: "Vallon des Auffes", cityId: city("marseille").id, categoryId: cat("patrimoine"), description: "Petit port traditionnel." },
      { name: "Citadelle de Lille", cityId: city("lille").id, categoryId: cat("nature"), description: "Parc et remparts." },
    ].map((p) => ({ ...p, slug: slugify(p.name), isDemo: true })))
    .returning();
  const place = (name: string) => placeRows.find((p) => p.name === name)!.id;

  const at = (days: number, hour: number) => {
    const d = new Date(Date.now() + days * DAY);
    d.setUTCHours(hour - 1, 0, 0, 0); // ≈ heure de Paris
    return d;
  };
  const eventRows = await db
    .insert(s.events)
    .values([
      { title: "Marché des créateurs de la Croix-Rousse", cityId: city("lyon").id, categoryId: cat("commerces-marches"), organizerId: users.lea_croixrousse!, venueName: "Boulevard de la Croix-Rousse", startsAt: at(3, 9), endsAt: at(3, 18), description: "Artisans et créateurs locaux. Entrée libre. (Événement de démonstration)", conditions: "Entrée libre" },
      { title: "Concert dans la cour", cityId: city("lyon").id, categoryId: cat("culture"), organizerId: users.hugo_fournil!, businessId: b("Le Fournil de la Croix-Rousse").id, venueName: "Cour du Fournil", startsAt: at(10, 19), endsAt: at(10, 22), description: "Trio jazz acoustique. Places limitées. (Démonstration)", capacity: 3, conditions: "Inscription conseillée" },
      { title: "Nettoyage des berges", cityId: city("lyon").id, categoryId: cat("vie-de-quartier"), organizerId: users.tom_presquile!, venueName: "Quai Saint-Antoine", startsAt: at(-5, 10), endsAt: at(-5, 12), description: "Action citoyenne passée. (Démonstration)" },
      { title: "Balade botanique", cityId: city("bordeaux").id, categoryId: cat("nature"), organizerId: users.nora_bdx!, venueName: "Jardin public", startsAt: at(6, 14), endsAt: at(6, 16), description: "Découverte des arbres remarquables. (Démonstration)" },
      { title: "Atelier réparation vélo", cityId: city("nantes").id, categoryId: cat("vie-de-quartier"), organizerId: users.yanis_nantes!, businessId: b("Atelier Vélo Bouffay").id, startsAt: at(2, 17), endsAt: at(2, 20), description: "Apprenez à régler vos freins. (Démonstration)" },
      { title: "Fête du Panier", cityId: city("marseille").id, categoryId: cat("sorties"), organizerId: users.julie_panier!, startsAt: at(12, 16), endsAt: at(12, 23), description: "Musique et cuisine de rue. (Démonstration)" },
    ].map((e) => ({ ...e, slug: slugify(e.title), isDemo: true })))
    .returning();
  const ev = (title: string) => eventRows.find((e) => e.title === title)!.id;

  await db.insert(s.newsArticles).values(
    [
      { title: "Travaux sur la ligne de bus C13 cette semaine", summary: "Déviation entre la Croix-Rousse et Hôtel de Ville du lundi au vendredi.", body: "Contenu de démonstration : un exemple de brève d'information pratique publiée par l'administration locale de Voisino.\n\nLes horaires peuvent varier ; consultez l'exploitant pour les informations officielles.", cityId: city("lyon").id, categoryId: cat("infos-utiles"), authorId: users.ines_lyon!, isBrief: true },
      { title: "Le Fournil fête ses dix ans", summary: "Portes ouvertes et dégustation samedi matin.", body: "Article de démonstration publié par un commerce vérifié.", cityId: city("lyon").id, categoryId: cat("commerces-marches"), authorId: users.hugo_fournil!, businessId: b("Le Fournil de la Croix-Rousse").id },
      { title: "Un nouveau jardin partagé aux Pentes", summary: "Inscriptions ouvertes pour les parcelles du printemps.", body: "Article de démonstration.", cityId: city("lyon").id, categoryId: cat("vie-de-quartier"), authorId: users.ines_lyon! },
      { title: "Les quais des Chartrons piétons le dimanche", summary: "Expérimentation tout l'automne.", body: "Article de démonstration.", cityId: city("bordeaux").id, categoryId: cat("infos-utiles"), authorId: users.camille_admin! },
      { title: "Bouffay : la fête de quartier revient", summary: "Programme complet en ligne.", body: "Article de démonstration.", cityId: city("nantes").id, categoryId: cat("sorties"), authorId: users.camille_admin! },
    ].map((n, i) => ({ ...n, slug: slugify(n.title), sourceName: "Rédaction Voisino (démonstration)", status: "published" as const, publishedAt: new Date(Date.now() - i * DAY), isDemo: true })),
  );

  console.log("→ Vidéos (génération FFmpeg + traitement réel), cela peut prendre une minute…");
  const VIDEOS = [
    { by: "lea_croixrousse", city: "lyon", zone: "Croix-Rousse", cat: "commerces-marches", caption: "Le marché du boulevard ce matin ☀️ #marché #croixrousse", business: "Le Fournil de la Croix-Rousse" },
    { by: "hugo_fournil", city: "lyon", zone: "Croix-Rousse", cat: "bonnes-adresses", caption: "Sortie du four : pain au levain de 6 h 😋 #boulangerie #levain", business: "Le Fournil de la Croix-Rousse", sponsored: true },
    { by: "tom_presquile", city: "lyon", zone: "Vieux Lyon", cat: "patrimoine", caption: "Petite traboule méconnue, on adore #patrimoine #vieuxlyon", place: "Traboules du Vieux Lyon" },
    { by: "lea_croixrousse", city: "lyon", zone: "Croix-Rousse", cat: "nature", caption: "Coucher de soleil depuis le Jardin des Chartreux #nature #lyon", place: "Jardin des Chartreux" },
    { by: "ines_lyon", city: "lyon", zone: "Presqu'île", cat: "infos-utiles", caption: "Rappel : collecte des encombrants jeudi #infosutiles" },
    { by: "tom_presquile", city: "lyon", zone: "Presqu'île", cat: "sorties", caption: "Qui vient au concert ? @hugo_fournil #concert #sorties", event: "Concert dans la cour" },
    { by: "camille_admin", city: "lyon", zone: "Guillotière", cat: "vie-de-quartier", caption: "Bienvenue sur Voisino Lyon ! Vidéo de démonstration #bienvenue" },
    { by: "nora_bdx", city: "bordeaux", zone: "Chartrons", cat: "patrimoine", caption: "Le miroir d'eau ce soir #bordeaux #patrimoine", place: "Miroir d'eau" },
    { by: "nora_bdx", city: "bordeaux", zone: "Chartrons", cat: "commerces-marches", caption: "Dégustation chez le caviste du quartier #chartrons", business: "Cave des Chartrons" },
    { by: "yanis_nantes", city: "nantes", zone: "Bouffay", cat: "vie-de-quartier", caption: "Atelier vélo : on répare ensemble #velo #nantes", business: "Atelier Vélo Bouffay", event: "Atelier réparation vélo" },
    { by: "yanis_nantes", city: "nantes", zone: "Île de Nantes", cat: "sorties", caption: "Balade sur l'île #nantes" },
    { by: "julie_panier", city: "marseille", zone: "Le Panier", cat: "patrimoine", caption: "Le Vallon des Auffes au petit matin #marseille", place: "Vallon des Auffes" },
    { by: "julie_panier", city: "marseille", zone: "Cours Julien", cat: "culture", caption: "Fresques du Cours Julien #streetart #culture" },
    { by: "malik_wazemmes", city: "lille", zone: "Wazemmes", cat: "commerces-marches", caption: "Marché de Wazemmes, le dimanche #lille #marché" },
    { by: "malik_wazemmes", city: "lille", zone: "Vieux-Lille", cat: "nature", caption: "Footing à la Citadelle #sport #lille", place: "Citadelle de Lille" },
    { by: "camille_admin", city: "strasbourg", zone: "Petite France", cat: "patrimoine", caption: "Strasbourg rejoint Voisino ! (démonstration) #strasbourg" },
  ];
  const dir = await mkdtemp(path.join(os.tmpdir(), "voisino-seed-"));
  const videoIds: string[] = [];
  try {
    for (const [i, v] of VIDEOS.entries()) {
      const file = await demoClip(dir, i);
      const assetId = crypto.randomUUID();
      const key = `videos/${assetId}/original.mp4`;
      await putFile(key, file, "video/mp4");
      await db.insert(s.mediaAssets).values({ id: assetId, ownerId: users[v.by]!, kind: "video", storageKey: key, mimeType: "video/mp4", sizeBytes: (await stat(file)).size, status: "uploaded" });
      const tags = [...v.caption.matchAll(/#([\p{L}\p{N}_]+)/gu)].map((m) => m[1]!.toLowerCase());
      const [row] = await db
        .insert(s.videos)
        .values({
          authorId: users[v.by]!,
          assetId,
          cityId: city(v.city).id,
          zoneId: zone(v.zone),
          categoryId: cat(v.cat),
          caption: v.caption,
          businessId: v.business ? b(v.business).id : null,
          eventId: v.event ? ev(v.event) : null,
          placeId: v.place ? place(v.place) : null,
          sponsoredByBusinessId: v.sponsored ? b(v.business!).id : null,
          isDemo: true,
        })
        .returning({ id: s.videos.id });
      if (tags.length) {
        await db.insert(s.hashtags).values(tags.map((tag) => ({ tag }))).onConflictDoNothing();
        const hs = await db.select().from(s.hashtags).where(sql`${s.hashtags.tag} in ${tags}`);
        await db.insert(s.videoHashtags).values(hs.map((h) => ({ videoId: row!.id, hashtagId: h.id })));
      }
      await processVideoAsset(row!.id);
      // Dates de publication étalées pour un flux réaliste.
      await db.update(s.videos).set({ publishedAt: new Date(Date.now() - i * 5 * 3_600_000) }).where(eq(s.videos.id, row!.id));
      videoIds.push(row!.id);
      process.stdout.write(`  vidéo ${i + 1}/${VIDEOS.length}\r`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  console.log("");

  console.log("→ Interactions, notifications, signalements");
  const u = (name: string) => users[name]!;
  const follows = [
    ["lea_croixrousse", "hugo_fournil"],
    ["tom_presquile", "lea_croixrousse"],
    ["lea_croixrousse", "tom_presquile"],
    ["nora_bdx", "lea_croixrousse"],
    ["camille_admin", "lea_croixrousse"],
    ["yanis_nantes", "julie_panier"],
  ];
  await db.insert(s.follows).values(follows.map(([a, b2]) => ({ followerId: u(a!), followingId: u(b2!) })));
  await db.insert(s.follows).values({ followerId: u("julie_panier"), followingId: u("malik_wazemmes"), accepted: false });
  const likePairs = videoIds.flatMap((vid, i) => Object.values(users).filter((_, j) => (i + j) % 3 === 0).map((userId) => ({ userId, videoId: vid })));
  await db.insert(s.likes).values(likePairs).onConflictDoNothing();
  await db.execute(sql`update videos set like_count = (select count(*) from likes where likes.video_id = videos.id)`);
  await db.execute(sql`update videos set view_count = like_count * 7 + 12`);

  const [c1] = await db.insert(s.comments).values({ videoId: videoIds[1]!, authorId: u("lea_croixrousse"), body: "Le meilleur pain du quartier, sans hésiter !" }).returning();
  await db.insert(s.comments).values([
    { videoId: videoIds[1]!, authorId: u("hugo_fournil"), parentId: c1!.id, body: "Merci Léa, à samedi !" },
    { videoId: videoIds[0]!, authorId: u("tom_presquile"), body: "Il y avait du monde ce matin 👌 @lea_croixrousse" },
    { videoId: videoIds[2]!, authorId: u("lea_croixrousse"), body: "Je ne la connaissais pas, merci du partage." },
    { videoId: videoIds[2]!, authorId: u("alex_nouveau"), body: "Contenu publicitaire douteux, cliquez ici !!!" },
  ]);
  await db.execute(sql`update videos set comment_count = (select count(*) from comments where comments.video_id = videos.id and status = 'visible')`);
  await db.insert(s.bookmarks).values([
    { userId: u("lea_croixrousse"), videoId: videoIds[2]! },
    { userId: u("lea_croixrousse"), eventId: ev("Concert dans la cour") },
  ]);
  await db.insert(s.eventAttendees).values([
    { eventId: ev("Concert dans la cour"), userId: u("lea_croixrousse"), status: "going" },
    { eventId: ev("Concert dans la cour"), userId: u("tom_presquile"), status: "going" },
    { eventId: ev("Marché des créateurs de la Croix-Rousse"), userId: u("tom_presquile"), status: "interested" },
  ]);
  await db.insert(s.notifications).values([
    { userId: u("lea_croixrousse"), actorId: u("tom_presquile"), type: "follow" },
    { userId: u("lea_croixrousse"), actorId: u("tom_presquile"), type: "mention", videoId: videoIds[0]! },
    { userId: u("hugo_fournil"), actorId: u("lea_croixrousse"), type: "comment", videoId: videoIds[1]! },
    { userId: u("hugo_fournil"), actorId: u("tom_presquile"), type: "mention", videoId: videoIds[5]! },
  ]);
  const [spam] = await db.select({ id: s.comments.id }).from(s.comments).where(eq(s.comments.authorId, u("alex_nouveau")));
  await db.insert(s.reports).values([
    { reporterId: u("lea_croixrousse"), targetType: "comment", targetId: spam!.id, reason: "spam", cityId: city("lyon").id, details: "Lien publicitaire." },
    { reporterId: u("tom_presquile"), targetType: "comment", targetId: spam!.id, reason: "spam", cityId: city("lyon").id },
    { reporterId: u("nora_bdx"), targetType: "video", targetId: videoIds[6]!, reason: "misinformation", cityId: city("lyon").id, details: "Signalement de démonstration." },
    { reporterId: u("lea_croixrousse"), targetType: "business", targetId: b("Café des Pentes").id, reason: "impersonation", cityId: city("lyon").id, details: "Fiche non officielle ? (démonstration)" },
  ]);

  console.log(`✓ Données de démonstration créées. Mot de passe des comptes de démonstration : ${DEMO_PASSWORD}`);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/seed.ts")) {
  seed()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
