import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { app } from '../app';
import pkg from '../../package.json';

describe('REST API', () => {
  it('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /api/version returns package version', async () => {
    const res = await request(app).get('/api/version');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('version', pkg.version);
  });
});
