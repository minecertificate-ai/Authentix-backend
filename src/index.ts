/**
 * AUTHENTIX BACKEND - ENTRY POINT
 *
 * Serverless entry point for Vercel deployment.
 * Imports the Fastify app and exposes it as a serverless function.
 */

import 'dotenv/config';
import { buildApp } from './server/app.js';

// Build app instance (singleton)
const appPromise = buildApp();

// ========================================
// LOCAL DEVELOPMENT SERVER
// ========================================

/**
 * Start server for local development
 */
const start = async () => {
  try {
    const app = await appPromise;
    const port = Number(process.env.PORT) || 3001;
    const host = process.env.HOST || '0.0.0.0';

    await app.listen({ port, host });
    console.log(`🚀 Authentix Backend running on http://${host}:${port}`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

// ========================================
// DETECT EXECUTION CONTEXT
// ========================================

// Check if this is the main module (not imported)
const isMainModule = import.meta.url === `file://${process.argv[1]}` ||
                     process.argv[1]?.endsWith('index.ts') ||
                     process.argv[1]?.endsWith('index.js');

if (isMainModule) {
  start();
}

// ========================================
// SERVERLESS EXPORT (Vercel)
// ========================================

/**
 * Vercel serverless function handler
 * Exports the Fastify app for Vercel's Node.js runtime
 */
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
