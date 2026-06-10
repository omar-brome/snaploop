import { Router } from 'express';
import { Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { upload, isVideoMime } from '../middleware/upload';
import { uploadLimiter } from '../middleware/rateLimit';
import { asyncHandler, ApiError } from '../middleware/error';
import { ok } from '../utils/response';
import * as storage from '../services/storage.service';

const router = Router();

// Media enters the system exclusively through this endpoint. The client
// uploads files first, gets back URLs + dimensions, then references those
// URLs when creating posts/stories/reels — feature endpoints stay JSON-only.
//
// POST /api/upload            (multipart "files", up to 10)
// POST /api/upload?kind=avatar (single square-cropped image)
router.post(
  '/',
  requireAuth,
  uploadLimiter,
  upload.array('files', 10),
  asyncHandler(async (req: Request, res: Response) => {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) throw new ApiError(400, 'No files uploaded', 'NO_FILES');

    const kind = req.query.kind as string | undefined;

    const results = await Promise.all(
      files.map(async (file) => {
        if (isVideoMime(file.mimetype)) {
          const { url } = await storage.saveVideo(file.buffer, file.mimetype);
          return { url, mediaType: 'VIDEO' as const, width: null, height: null };
        }
        const stored =
          kind === 'avatar' ? await storage.saveAvatar(file.buffer) : await storage.saveImage(file.buffer);
        return {
          url: stored.url,
          mediaType: 'IMAGE' as const,
          width: stored.width,
          height: stored.height,
        };
      })
    );

    return ok(res, { media: results });
  })
);

export default router;
