/** Converts legacy Word on the application's local origin; never uses the cloud API router. */
export async function convertLocalWordToPdf(
  file: File,
  signal?: AbortSignal,
): Promise<File> {
  const origin = new URL(document.baseURI);
  if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(origin.hostname))
    throw new Error("LEGACY_WORD_UNAVAILABLE");
  const body = new FormData();
  body.append("fileInput", file);
  const response = await fetch(new URL("api/v1/convert/file/pdf", origin), {
    method: "POST",
    body,
    signal,
  });
  if (
    !response.ok ||
    !(response.headers.get("content-type") ?? "").includes("pdf")
  )
    throw new Error("LEGACY_WORD_UNAVAILABLE");
  return new File(
    [await response.blob()],
    file.name.replace(/\.doc$/i, ".pdf"),
    { type: "application/pdf" },
  );
}
