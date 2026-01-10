/**
 * AUTHENTIX BACKEND
 *
 * Fastify server entry point.
 */

import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { errorHandler } from './lib/errors/handler.js';

// Load environment variables
import 'dotenv/config';

// Initialize Fastify app
async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport: process.env.NODE_ENV === 'development' ? {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      } : undefined,
    },
    requestIdLogLabel: 'requestId',
    genReqId: () => {
      return randomUUID();
    },
  });

  // Register CORS
  // Allow requests from localhost (frontend runs locally) and configured FRONTEND_URL
  const allowedOrigins = [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
  ];

  await app.register(import('@fastify/cors'), {
    origin: (origin, cb) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return cb(null, true);
      
      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        return cb(null, true);
      }
      
      // Default: allow if in allowed list or if FRONTEND_URL matches
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      if (origin.startsWith(frontendUrl) || allowedOrigins.some(url => origin.startsWith(url))) {
        return cb(null, true);
      }
      
      // Reject other origins
      return cb(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
  });

  // Register multipart for file uploads
  await app.register(import('@fastify/multipart'), {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB
    },
  });

  // Add raw body parser for webhooks (needed for signature verification)
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    try {
      (req as { rawBody?: string }).rawBody = body as string;
      done(null, JSON.parse(body as string));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // Register error handler
  app.setErrorHandler(errorHandler);

  // Root route - Welcome message
  app.get('/', async (_request, reply) => {
    reply.type('application/json');
    return {
      service: 'Authentix Backend API',
      version: '1.0.0',
      status: 'running',
      timestamp: new Date().toISOString(),
      endpoints: {
        health: '/health',
        api: '/api/v1',
        documentation: 'See API_DOCUMENTATION.md for details',
      },
      message: 'Welcome to Authentix Backend API. Use /api/v1 for API endpoints.',
    };
  });

  // Health check
  app.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    };
  });

  // Register API routes
  await app.register(async function (app) {
    // V1 API routes
    await app.register(async function (app) {
      const { registerV1Routes } = await import('./api/v1/index.js');
      await registerV1Routes(app);
    }, { prefix: '/api/v1' });
  });

  return app;
}

// Build app instance
const appPromise = buildApp();

// Start server (for local development)
const start = async () => {
  try {
    const app = await appPromise;
    const port = Number(process.env.PORT) || 3000;
    const host = process.env.HOST || '0.0.0.0';

    await app.listen({ port, host });
    console.log(`🚀 Authentix Backend running on http://${host}:${port}`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

// Handle Vercel serverless
// Check if this is the main module (not imported)
const isMainModule = import.meta.url === `file://${process.argv[1]}` || 
                     process.argv[1]?.endsWith('index.ts') ||
                     process.argv[1]?.endsWith('index.js');

if (isMainModule) {
  start();
}

// Export for Vercel serverless functions
// Vercel's @vercel/node expects a handler that receives Node.js http objects
export default async (req: any, res: any) => {
  try {
    const app = await appPromise;
    await app.ready();
    
    // Fastify's server can handle Node.js http.IncomingMessage and http.ServerResponse
    // Vercel provides these as req and res
    app.server.emit('request', req, res);
  } catch (error) {
    console.error('Vercel handler error:', error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }));
  }
};
