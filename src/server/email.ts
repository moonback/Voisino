import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type Mail = { to: string; subject: string; text: string; html?: string };

export const DEV_MAIL_DIR = path.resolve("storage/dev-mail");

/**
 * Envoie un e-mail. En mode `console` (développement), rien n'est envoyé :
 * le message est enregistré dans storage/dev-mail et visible sur /dev/courrier.
 */
export async function sendMail(mail: Mail) {
  const transport = process.env.EMAIL_TRANSPORT ?? "console";
  if (transport === "smtp") {
    if (!process.env.SMTP_URL) throw new Error("EMAIL_TRANSPORT=smtp mais SMTP_URL est vide");
    const nodemailer = await import("nodemailer");
    await nodemailer.createTransport(process.env.SMTP_URL).sendMail({ from: process.env.EMAIL_FROM, ...mail });
    return;
  }
  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_CONSOLE_EMAIL) {
    throw new Error("Aucun transport e-mail configuré en production (EMAIL_TRANSPORT=smtp)");
  }
  await mkdir(DEV_MAIL_DIR, { recursive: true });
  const file = path.join(DEV_MAIL_DIR, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
  await writeFile(file, JSON.stringify({ ...mail, sentAt: new Date().toISOString() }, null, 2));
  console.info(`[e-mail dev] « ${mail.subject} » → ${mail.to} (voir /dev/courrier)`);
}

export function mailLayout(title: string, body: string, cta?: { label: string; url: string }) {
  const button = cta
    ? `<p><a href="${cta.url}" style="display:inline-block;background:#c2410c;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">${cta.label}</a></p><p style="color:#666;font-size:13px">Ou copiez ce lien : ${cta.url}</p>`
    : "";
  return `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;color:#1c1917"><h1 style="font-size:20px">${title}</h1><p>${body}</p>${button}<p style="color:#888;font-size:12px">Voisino — la vie de votre ville, en vidéo.</p></div>`;
}
