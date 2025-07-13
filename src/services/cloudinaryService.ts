import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true, // Use HTTPS
});

// Basic validation for Cloudinary config
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  console.warn('Cloudinary credentials are not fully defined in environment variables. Image uploads will fail.');
  // In a production app, you might want to throw an error and stop the server.
  // process.exit(1);
}

/**
 * Uploads an image (base64 string or file path) to Cloudinary.
 * @param {string} imagePath - The base64 encoded image string (e.g., "data:image/jpeg;base64,...") or a local file path.
 * @param {string} [folder='votex_images'] - The folder name in Cloudinary to upload to.
 * @returns {Promise<cloudinary.UploadApiResponse>} The Cloudinary upload response.
 */
export const uploadImage = async (imagePath: string, folder: string = 'votex_images'): Promise<any> => { 
  try {
    const result = await cloudinary.uploader.upload(imagePath, {
      folder: folder,
      resource_type: 'image', // Ensure it's treated as an image
    });
    console.log('Image uploaded to Cloudinary:', result.secure_url);
    return result;
  } catch (error) {
    console.error('Cloudinary upload error:', (error as Error).message);
    throw new Error(`Failed to upload image to Cloudinary: ${(error as Error).message}`);
  }
};

/**
 * Deletes an image from Cloudinary by its public ID.
 * @param {string} publicId - The public ID of the image to delete.
 * @returns {Promise<cloudinary.DeleteApiResponse>} The Cloudinary deletion response.
 */
export const deleteImage = async (publicId: string): Promise<any> => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    console.log('Image deleted from Cloudinary:', publicId, result);
    return result;
  } catch (error) {
    console.error('Cloudinary deletion error:', (error as Error).message);
    throw new Error(`Failed to delete image from Cloudinary: ${(error as Error).message}`);
  }
};