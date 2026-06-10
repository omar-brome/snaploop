import multer from 'multer';
import { ApiError } from './error';

// Files land in memory and are processed by sharp / written by the storage
// service — nothing raw ever hits disk directly from the request.
const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const VIDEO_MIME = ['video/mp4', 'video/webm', 'video/quicktime'];

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB hard cap (videos)
    files: 10,
  },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_MIME.includes(file.mimetype) || VIDEO_MIME.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ApiError(415, `Unsupported media type: ${file.mimetype}`, 'UNSUPPORTED_MEDIA'));
    }
  },
});

export function isVideoMime(mimetype: string): boolean {
  return VIDEO_MIME.includes(mimetype);
}
