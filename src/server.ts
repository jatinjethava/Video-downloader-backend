import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import videoRoutes from './routes/videoRoutes';
import errorHandler from './middleware/errorHandler';
import './workers/downloadWorker';


dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';


app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);


const allowedOrigins = FRONTEND_URL.split(',').map((origin) => origin.trim());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        callback(null, true);
      } else {
        callback(null, true); 
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);


app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));


app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));


const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), 
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '150', 10),
  message: {
    success: false,
    error: 'Too many requests from this IP. Please try again after a few minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);


app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    service: 'Video Downloader Backend API (TypeScript)',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});


app.use('/api/video', videoRoutes);


app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});


app.use(errorHandler);


const server = app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`🚀 Video Downloader Backend (TypeScript) is LIVE!`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`🌐 Allowed Frontend: ${FRONTEND_URL}`);
  console.log(`🛡️  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`=========================================`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ [PORT IN USE] Port ${PORT} is already occupied by another process.`);
    console.error(`👉 Solution: Run "npm run kill:ports" to free the port, or change PORT in backend/.env.\n`);
    process.exit(1);
  } else {
    console.error('Server startup error:', err);
    process.exit(1);
  }
});

export default app;
