import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db";
import { account, session, user, verification } from "./db/schema";
import { mailLayout, sendMail } from "./email";
import { createProfileFor, purgeUserMedia } from "./services/profiles";
import { getSetting } from "./services/settings";
import { APIError } from "better-auth/api";

export const auth = betterAuth({
  appName: "Voisino",
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.APP_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema: { user, session, account, verification } }),
  advanced: { database: { generateId: "uuid" } },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: "Réinitialiser votre mot de passe Voisino",
        text: `Pour choisir un nouveau mot de passe, ouvrez ce lien (valable 1 heure) : ${url}`,
        html: mailLayout(
          "Nouveau mot de passe",
          "Vous avez demandé à réinitialiser votre mot de passe. Ce lien est valable 1 heure. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.",
          { label: "Choisir un mot de passe", url },
        ),
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: "Confirmez votre adresse e-mail Voisino",
        text: `Bienvenue sur Voisino ! Confirmez votre adresse : ${url}`,
        html: mailLayout(
          "Bienvenue sur Voisino",
          "Confirmez votre adresse e-mail pour pouvoir publier des vidéos et des commentaires.",
          { label: "Confirmer mon adresse", url },
        ),
      });
    },
  },
  user: {
    additionalFields: {
      role: { type: "string", input: false, defaultValue: "user" },
      status: { type: "string", input: false, defaultValue: "active" },
      isDemo: { type: "boolean", input: false, defaultValue: false },
    },
    deleteUser: {
      enabled: true,
      beforeDelete: async (u) => {
        await purgeUserMedia(u.id);
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: process.env.NODE_ENV === "production" || process.env.AUTH_RATE_LIMIT === "true",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 3600, max: 10 },
      "/request-password-reset": { window: 3600, max: 5 },
      "/send-verification-email": { window: 3600, max: 5 },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (u) => {
          if (!(await getSetting("signup_open"))) {
            throw new APIError("FORBIDDEN", { message: "Les inscriptions sont temporairement fermées.", code: "SIGNUP_CLOSED" });
          }
          return { data: u };
        },
        after: async (u) => {
          await createProfileFor(u.id, u.name, u.email);
        },
      },
    },
  },
  plugins: [nextCookies()],
});
