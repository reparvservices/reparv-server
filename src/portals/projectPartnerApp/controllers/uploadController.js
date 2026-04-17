import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
});

export const generateUploadUrl = async (req, res) => {
  console.log("Generating S3 upload URL for file type:", req.body.fileType);
  try {
    const { fileType } = req.body; // image/jpeg or video/mp4

    const fileExtension = fileType.split("/")[1];
    const key = `uploads/video/${Date.now()}.${fileExtension}`;

    const command = new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
      ContentType: fileType,
    });

    const uploadUrl = await getSignedUrl(s3, command, {
      expiresIn: 300, // 5 minutes
    });

    const fileUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
    console.log("Generated S3 upload URL:", uploadUrl);
    res.json({
      success: true,
      uploadUrl,
      fileUrl,
    });
  } catch (error) {
    console.error("S3 Presign Error:", error);
    res.status(500).json({ success: false });
  }
};
