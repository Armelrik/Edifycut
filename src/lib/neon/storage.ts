import "server-only";
import { createReadStream, statSync } from "node:fs";
import { DeleteObjectsCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** Bucket privé déclaré dans neon.ts. */
const BUCKET = process.env.NEON_STORAGE_BUCKET || "assets";

const state = globalThis as typeof globalThis & { edifycutS3?: S3Client };

/** Les variables AWS_* sont injectées par `neon env pull` (ou par Neon en production). */
export function storageConfigured() {
  return Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_ENDPOINT_URL_S3 && process.env.AWS_REGION);
}

function client() {
  // Neon exige l’adressage path-style ; identifiants, endpoint et région viennent de l’environnement.
  return (state.edifycutS3 ??= new S3Client({ forcePathStyle: true }));
}

/** Envoie un fichier local en streaming (sans le charger en mémoire). Limite S3 d’un PUT simple : 5 Go. */
export async function uploadFile(key: string, path: string, contentType: string) {
  const size = statSync(path).size;
  await client().send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: createReadStream(path), ContentLength: size, ContentType: contentType }));
  return size;
}

/** URL GET signée, courte durée, qui force le téléchargement sous le nom donné. */
export async function signedDownloadUrl(key: string, filename: string, expiresIn = 600) {
  const safe = filename.replace(/[^\w.-]/g, "_");
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: BUCKET, Key: key, ResponseContentDisposition: `attachment; filename="${safe}"` }), { expiresIn });
}

export async function deletePrefix(prefix: string) {
  let token: string | undefined;
  do {
    const page = await client().send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken: token }));
    const objects = (page.Contents || []).flatMap(item => item.Key ? [{ Key: item.Key }] : []);
    if (objects.length) await client().send(new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: objects, Quiet: true } }));
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
}

export async function deleteKey(key: string) {
  await client().send(new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: [{ Key: key }], Quiet: true } }));
}
