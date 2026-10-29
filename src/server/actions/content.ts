"use server";

import type { z } from "zod";
import { businessSchema, claimSchema, eventSchema, newsSchema } from "@/lib/validation";
import { runAction } from "../run";
import { requireContributor, requireViewer } from "../session";
import * as content from "../services/content";

export const saveNews = async (input: z.input<typeof newsSchema>, id?: string) =>
  runAction(async () => content.saveNews(await requireContributor(), input, id));

export const createBusiness = async (input: z.input<typeof businessSchema>) =>
  runAction(async () => content.createBusiness(await requireContributor(), input));

export const updateBusiness = async (businessId: string, input: z.input<typeof businessSchema>) =>
  runAction(async () => content.updateBusiness(await requireViewer(), businessId, input));

export const claimBusiness = async (input: z.input<typeof claimSchema>) =>
  runAction(async () => {
    await content.requestClaim(await requireContributor(), input);
    return null;
  });

export const saveEvent = async (input: z.input<typeof eventSchema>, id?: string) =>
  runAction(async () => content.saveEvent(await requireContributor(), input, id));

export const cancelEvent = async (eventId: string) => runAction(async () => content.cancelEvent(await requireViewer(), eventId));
