import sharp from "sharp";
import path from "path";

export const convertImagesToWebp = async (files) => {
  const convertedFiles = {};

  for (const field in files) {
    convertedFiles[field] = [];

    for (const file of files[field]) {
      // Validate memoryStorage file
      if (!file?.buffer || !file.mimetype?.startsWith("image/")) {
        console.warn("Skipping invalid file object:", file);
        continue;
      }

      try {
        const webpBuffer = await sharp(file.buffer)
          .webp({ quality: 70 })
          .toBuffer();

        convertedFiles[field].push({
          buffer: webpBuffer,              // for S3
          mimetype: "image/webp",
          originalname: file.originalname.replace(
            path.extname(file.originalname),
            ".webp"
          ),
        });
      } catch (err) {
        console.error(`Error converting ${file.originalname}:`, err);

        // fallback: upload original
        convertedFiles[field].push({
          buffer: file.buffer,
          mimetype: file.mimetype,
          originalname: file.originalname,
        });
      }
    }
  }

  return convertedFiles;
};
