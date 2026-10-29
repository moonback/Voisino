"use server";

import type { z } from "zod";
import type { NotificationPrefs } from "../db/schema";
import { privacySchema, profileSchema } from "@/lib/validation";
import { runAction } from "../run";
import { requireViewer } from "../session";
import * as notifications from "../services/notifications";
import * as profiles from "../services/profiles";
import { createAppeal } from "../services/moderation";

export const updateProfile = async (input: z.input<typeof profileSchema>) =>
  runAction(async () => profiles.updateProfile(await requireViewer(), input));

export const updatePrivacy = async (input: z.input<typeof privacySchema>) =>
  runAction(async () => profiles.updatePrivacy(await requireViewer(), input));

export const updateNotificationPrefs = async (prefs: NotificationPrefs) =>
  runAction(async () => profiles.updateNotificationPrefs(await requireViewer(), prefs));

export const markNotificationRead = async (id: string) =>
  runAction(async () => notifications.markRead((await requireViewer()).id, id));

export const markAllNotificationsRead = async () => runAction(async () => notifications.markAllRead((await requireViewer()).id));

export const appealDecision = async (actionId: string, message: string) =>
  runAction(async () => {
    await createAppeal(await requireViewer(), actionId, message);
    return null;
  });
