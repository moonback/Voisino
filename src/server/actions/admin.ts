"use server";

import type { z } from "zod";
import { citySchema } from "@/lib/validation";
import { runAction } from "../run";
import type { Role } from "../permissions";
import { requireViewer } from "../session";
import * as admin from "../services/admin";
import { addZone, saveCity } from "../services/cities";
import { reviewClaim, setBusinessVerification } from "../services/content";
import { decideAppeal, moderate, type ModerationAction, type TargetType } from "../services/moderation";
import type { SettingKey } from "../services/settings";

export const moderateContent = async (input: { targetType: TargetType; targetId: string; action: ModerationAction; reason: string; reportId?: string }) =>
  runAction(async () => moderate(await requireViewer(), input));

export const decideAppealAction = async (appealId: string, accept: boolean) =>
  runAction(async () => decideAppeal(await requireViewer(), appealId, accept));

export const reviewClaimAction = async (claimId: string, approve: boolean, note: string) =>
  runAction(async () => reviewClaim(await requireViewer(), claimId, approve, note));

export const setVerification = async (businessId: string, verification: "verified" | "rejected" | "unverified") =>
  runAction(async () => setBusinessVerification(await requireViewer(), businessId, verification));

export const setRole = async (userId: string, role: Role, cityIds: string[]) =>
  runAction(async () => admin.setUserRole(await requireViewer(), userId, role, cityIds));

export const saveCityAction = async (input: z.input<typeof citySchema>, id?: string) =>
  runAction(async () => saveCity(await requireViewer(), input, id));

export const addZoneAction = async (cityId: string, name: string) => runAction(async () => addZone(await requireViewer(), cityId, name));

export const saveCategory = async (input: { id?: string; name: string; icon: string; sortOrder: number; isActive: boolean }) =>
  runAction(async () => admin.saveCategory(await requireViewer(), input));

export const blockHashtag = async (id: string, blocked: boolean) =>
  runAction(async () => admin.setHashtagBlocked(await requireViewer(), id, blocked));

export const updateSetting = async (key: SettingKey, value: string) =>
  runAction(async () => admin.updateSetting(await requireViewer(), key, value));
