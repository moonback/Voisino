/** Téléversement brut avec progression (XMLHttpRequest : fetch ne fournit pas la progression d'envoi). */
export function uploadFile(file: File, kind: "video" | "image", onProgress: (ratio: number) => void) {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<{ assetId: string; status: string }>((resolve, reject) => {
    xhr.open("POST", `/api/uploads?kind=${kind}`);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      const body = (() => {
        try {
          return JSON.parse(xhr.responseText);
        } catch {
          return null;
        }
      })();
      if (xhr.status >= 200 && xhr.status < 300 && body?.assetId) resolve(body);
      else reject(new Error(body?.error ?? "Le téléversement a échoué."));
    };
    xhr.onerror = () => reject(new Error("Connexion interrompue pendant le téléversement."));
    xhr.onabort = () => reject(new Error("Téléversement annulé."));
    xhr.send(file);
  });
  return { promise, abort: () => xhr.abort() };
}
