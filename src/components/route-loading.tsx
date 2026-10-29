import { LoadingBlock, Page } from "./bits";

/** Squelette de chargement commun aux pages (loading.tsx). */
export default function RouteLoading() {
  return (
    <Page wide>
      <div className="mb-6 h-9 w-48 animate-pulse rounded-lg bg-muted" />
      <LoadingBlock />
    </Page>
  );
}
