import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, test } from 'node:test';
import { preflightModel } from './preflight.mjs';

let server;
let baseUrl;

before(async () => {
  server = http.createServer((req, res) => {
    if (req.url !== '/v1/models') {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: [{ id: 'served-model' }, { id: 'other-model' }] }));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
});

after(async () => {
  const closed = new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  server.closeAllConnections();
  await closed;
});

test('preflight accepts a served model id', async () => {
  await preflightModel({ baseUrl, model: 'served-model' });
});

test('preflight reports endpoint URL, wanted model, and served models', async () => {
  await assert.rejects(
    preflightModel({ baseUrl, model: 'missing-model' }),
    /http:\/\/127\.0\.0\.1:\d+\/v1\/models.*missing-model.*served-model.*other-model/,
  );
});
