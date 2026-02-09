import sharp from "sharp";
import path from "path";

export const convertSingleImageToWebp = async (file) => {
  // Validate file
  if (!file?.buffer || !file.mimetype?.startsWith("image/")) {
    console.warn("Invalid image file:", file);
    return null;
  }

  try {
    const webpBuffer = await sharp(file.buffer)
      .webp({ quality: 70 })
      .toBuffer();

    return {
      buffer: webpBuffer,  // for S3 upload
      mimetype: "image/webp",
      originalname: file.originalname.replace(
        path.extname(file.originalname),
        ".webp"
      ),
    };
  } catch (err) {
    console.error(`Error converting ${file.originalname}:`, err);

    // Fallback: return original image
    return {
      buffer: file.buffer,
      mimetype: file.mimetype,
      originalname: file.originalname,
    };
  }
};