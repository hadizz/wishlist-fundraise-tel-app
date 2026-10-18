import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../env";

const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: true, // MinIO; harmless on R2
  credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
});

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

/** Presigned PUT for a client-side upload. Key is server-chosen, never client-chosen. */
export async function presignImageUpload(ownerId: string, contentType: ImageType, contentLength: number) {
  const ext = contentType.split("/")[1];
  const key = `u/${ownerId}/${crypto.randomUUID()}.${ext}`;
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      ContentType: contentType,
      ContentLength: contentLength,
    }),
    { expiresIn: 300 },
  );
  return { uploadUrl, publicUrl: `${env.S3_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}` };
}

export function isOwnUpload(url: string, ownerId: string): boolean {
  return url.startsWith(`${env.S3_PUBLIC_BASE_URL.replace(/\/$/, "")}/u/${ownerId}/`);
}
