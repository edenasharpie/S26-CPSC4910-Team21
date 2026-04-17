import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';

export const MAX_PROFILE_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
export const PROFILE_IMAGE_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'profile-images');
export const PROFILE_IMAGE_PUBLIC_PREFIX = '/api/images/u/';

const ALLOWED_PROFILE_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

function ensureUploadDirectory() {
  fs.mkdirSync(PROFILE_IMAGE_UPLOAD_DIR, { recursive: true });
}

function extensionFromMimeType(mimeType) {
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/jpeg') return '.jpg';
  if (mimeType === 'image/webp') return '.webp';
  if (mimeType === 'image/gif') return '.gif';
  return '.img';
}

const profileImageStorage = multer.diskStorage({
  destination(_req, _file, callback) {
    try {
      ensureUploadDirectory();
      callback(null, PROFILE_IMAGE_UPLOAD_DIR);
    } catch (error) {
      callback(error);
    }
  },
  filename(req, file, callback) {
    try {
      const routeIdRaw = req.params?.id ?? req.params?.driverId ?? req.params?.userId;
      const routeId = Number(routeIdRaw);
      const normalizedId = Number.isInteger(routeId) && routeId > 0 ? routeId.toString(36) : '0';
      const randomSuffix = crypto.randomBytes(3).toString('hex');
      const extension = extensionFromMimeType(file.mimetype);
      callback(null, `u${normalizedId}_${randomSuffix}${extension}`);
    } catch (error) {
      callback(error);
    }
  },
});

const uploadProfileImage = multer({
  storage: profileImageStorage,
  limits: {
    fileSize: MAX_PROFILE_IMAGE_SIZE_BYTES,
  },
  fileFilter(_req, file, callback) {
    if (ALLOWED_PROFILE_IMAGE_MIME_TYPES.has(file.mimetype)) {
      callback(null, true);
      return;
    }

    callback(new Error('Profile image must be a PNG, JPG, WEBP, or GIF file.'));
  },
});

export function handleProfileImageUpload(req, res, next) {
  uploadProfileImage.single('profileImage')(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: 'Profile image must be 5MB or smaller.' });
      return;
    }

    res.status(400).json({ error: error.message || 'Invalid profile image upload.' });
  });
}

export function normalizeProfilePictureValue(rawProfilePicture, uploadedFile) {
  if (uploadedFile?.filename) {
    return `${PROFILE_IMAGE_PUBLIC_PREFIX}${uploadedFile.filename}`;
  }

  if (typeof rawProfilePicture !== 'string') {
    return undefined;
  }

  const trimmed = rawProfilePicture.trim();
  return trimmed === '' ? null : trimmed;
}