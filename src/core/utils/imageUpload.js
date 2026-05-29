import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { createReadStream, statSync, unlinkSync } from "fs";

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
});

const BUCKET = process.env.AWS_BUCKET_NAME;

// ─── Standard upload — for small files (images < 5MB) ───
export const uploadToS3 = async (file) => {
  const fileName = `uploads/${Date.now()}-${file.originalname}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: fileName,
      Body: file.buffer,
      ContentType: file.mimetype,
    }),
  );

  return `https://${BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
};

// ─── Multipart upload — for large files (PDFs, videos up to 300MB+) ───
// Uses multer diskStorage: file.path is a temp path on disk
// Streams in 10MB chunks — only 10MB in RAM at a time regardless of file size
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB per part (S3 min is 5MB except last)

export const multipartUploadToS3 = async (file) => {
  const fileName = `uploads/${Date.now()}-${file.originalname}`;
  const filePath = file.path;                     // temp disk path from multer diskStorage
  const fileSize = statSync(filePath).size;

  let uploadId = null;

  try {
    // 1. Start multipart upload session
    const { UploadId } = await s3.send(
      new CreateMultipartUploadCommand({
        Bucket: BUCKET,
        Key: fileName,
        ContentType: file.mimetype,
      }),
    );
    uploadId = UploadId;

    // 2. Upload file in 10MB chunks
    const totalParts = Math.ceil(fileSize / CHUNK_SIZE);
    const uploadedParts = [];

    for (let i = 0; i < totalParts; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE - 1, fileSize - 1);

      // Stream only this chunk range — never loads whole file into memory
      const chunkStream = createReadStream(filePath, { start, end });

      const { ETag } = await s3.send(
        new UploadPartCommand({
          Bucket: BUCKET,
          Key: fileName,
          UploadId: uploadId,
          PartNumber: i + 1,            // S3 part numbers are 1-indexed
          Body: chunkStream,
          ContentLength: end - start + 1,
        }),
      );

      uploadedParts.push({ PartNumber: i + 1, ETag });
    }

    // 3. Tell S3 to assemble all parts into the final object
    await s3.send(
      new CompleteMultipartUploadCommand({
        Bucket: BUCKET,
        Key: fileName,
        UploadId: uploadId,
        MultipartUpload: { Parts: uploadedParts },
      }),
    );

    return `https://${BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
  } catch (err) {
    // Abort on failure — incomplete multipart uploads are billed by AWS
    if (uploadId) {
      try {
        await s3.send(
          new AbortMultipartUploadCommand({
            Bucket: BUCKET,
            Key: fileName,
            UploadId: uploadId,
          }),
        );
      } catch (abortErr) {
        console.error("Failed to abort multipart upload:", abortErr.message);
      }
    }
    throw err;
  } finally {
    // Always delete the temp file from disk after upload
    try {
      unlinkSync(filePath);
    } catch (_) {}
  }
};

// ─── Delete from S3 using full URL ───
export const deleteFromS3 = async (fileUrl) => {
  if (!fileUrl) return;

  const bucketUrl = `https://${BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/`;
  const key = fileUrl.replace(bucketUrl, "");

  await s3.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    }),
  );
};