import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { AppError, type ActionFailure, type ActionResult } from "./errors";

function toFailure(e: unknown): ActionFailure {
  if (e instanceof AppError) return { ok: false, code: e.code, error: e.message };
  if (e instanceof ZodError) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of e.issues) (fieldErrors[issue.path.join(".") || "_"] ??= []).push(issue.message);
    return { ok: false, code: "VALIDATION", error: e.issues[0]?.message ?? "Données invalides", fieldErrors };
  }
  console.error("[voisino] erreur inattendue", e);
  return { ok: false, code: "INTERNAL", error: "Une erreur inattendue est survenue. Réessayez dans un instant." };
}

/** Exécute une Server Action et convertit les erreurs en résultat sérialisable. */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    unstable_rethrow(e); // laisse passer redirect()/notFound()
    return toFailure(e);
  }
}

/** Équivalent pour les Route Handlers : réponse JSON avec le bon code HTTP. */
export async function runRoute(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    unstable_rethrow(e);
    const status = e instanceof AppError ? e.status : e instanceof ZodError ? 422 : 500;
    return Response.json(toFailure(e), { status });
  }
}
