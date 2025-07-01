// server/static.ts
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function serveStatic(app: express.Express) {
  app.use(express.static(resolve(__dirname, '../dist')));
}
