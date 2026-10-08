import { Router, Request, Response, NextFunction } from 'express';
import videoController from '../controllers/videoController';

const router = Router();


router.post('/info', (req: Request, res: Response, next: NextFunction) => {
  videoController.getVideoInfo(req, res, next);
});

router.get('/info', (req: Request, res: Response, next: NextFunction) => {
  videoController.getVideoInfo(req, res, next);
});


router.get('/download', (req: Request, res: Response, next: NextFunction) => {
  videoController.downloadVideo(req, res, next);
});


router.post('/queue-download', (req: Request, res: Response, next: NextFunction) => {
  videoController.queueDownload(req, res, next);
});

router.get('/status/:jobId', (req: Request, res: Response) => {
  videoController.getJobStatus(req, res);
});

router.get('/file/:jobId', (req: Request, res: Response) => {
  videoController.getJobFile(req, res);
});


router.get('/platforms', (req: Request, res: Response) => {
  videoController.getSupportedPlatforms(req, res);
});

export default router;
