import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app-setup';
import { PrismaService } from '../src/prisma/prisma.service';

const PROBLEM_CONTENT_TYPE = 'application/problem+json';
const PROBLEM_BASE = 'https://items-api.local/problems';

const VALID_ITEM = {
  name: 'Mechanical Keyboard',
  sku: 'KBD-87-BLK',
  quantity: 12,
  price: 249.99,
};

/**
 * `POST /items` through the real HTTP stack.
 *
 * These are contract tests, not implementation tests. Every assertion below traces to a line in
 * docs/api-contract.md, and the Django suite asserts the same things — which is the point of
 * having written the contract first. If one stack passes and the other does not, the contract has
 * been broken rather than merely a refactor gone wrong.
 */
describe('Items API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    // The same call `main.ts` makes. Without it the suite would run against an app with no
    // ValidationPipe and no exception filter — which is to say against none of the behaviour
    // these tests exist to pin down.
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // A clean table per test, so nothing depends on execution order. `DELETE` rather than
    // `TRUNCATE`, which SQLite does not have.
    await prisma.$executeRawUnsafe('DELETE FROM items');
  });

  function post(body: unknown) {
    return request(app.getHttpServer()).post('/items').send(body);
  }

  function seed(overrides: Partial<typeof VALID_ITEM> = {}) {
    return post({ ...VALID_ITEM, ...overrides });
  }

  describe('GET /items', () => {
    it('answers 200 with an empty array, never 404', async () => {
      const response = await request(app.getHttpServer()).get('/items');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('returns items ordered by id ascending', async () => {
      await seed({ sku: 'AAA-1' });
      await seed({ sku: 'BBB-2' });
      await seed({ sku: 'CCC-3' });

      const response = await request(app.getHttpServer()).get('/items');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(3);
      const ids = (response.body as { id: number }[]).map((item) => item.id);
      expect(ids).toEqual([...ids].sort((a, b) => a - b));
      expect((response.body as { sku: string }[]).map((item) => item.sku)).toEqual([
        'AAA-1',
        'BBB-2',
        'CCC-3',
      ]);
    });

    it('returns a bare array with no envelope', async () => {
      await seed();

      const response = await request(app.getHttpServer()).get('/items');

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('the shape of an item', () => {
    it('sends price as a JSON number, not a string', async () => {
      // Prisma hands back a Decimal object, which would serialise as a string. The contract says
      // JSON number, so `toItemResponse` converts it deliberately — and this is the assertion
      // that keeps it deliberate.
      const response = await seed({ price: 189.5 });

      expect(typeof response.body.price).toBe('number');
      expect(response.body.price).toBe(189.5);
    });

    it('preserves two decimal places of precision', async () => {
      const response = await seed({ price: 1234.56 });

      expect(response.body.price).toBe(1234.56);
    });

    it('sends createdAt as an ISO-8601 UTC instant ending in Z', async () => {
      const response = await seed();

      expect(response.body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
      expect(Number.isNaN(Date.parse(response.body.createdAt))).toBe(false);
    });

    it('assigns the id and createdAt on the server', async () => {
      const response = await seed();

      expect(typeof response.body.id).toBe('number');
      expect(response.body.id).toBeGreaterThan(0);
      expect(response.body.createdAt).toBeDefined();
    });
  });

  describe('GET /items/{id}', () => {
    it('returns the item', async () => {
      const created = await seed();

      const response = await request(app.getHttpServer()).get(`/items/${created.body.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(created.body);
    });

    it('answers 404 problem+json for an id that does not exist', async () => {
      const response = await request(app.getHttpServer()).get('/items/999999');

      expect(response.status).toBe(404);
      expect(response.headers['content-type']).toContain(PROBLEM_CONTENT_TYPE);
      expect(response.body).toMatchObject({
        type: `${PROBLEM_BASE}/not-found`,
        title: 'Item not found',
        status: 404,
        instance: '/items/999999',
      });
    });

    it('answers 404 — not 400 — for a non-numeric id', async () => {
      // The contract's reasoning: from the client's point of view `/items/abc` simply identifies
      // nothing. Nest's ParseIntPipe would answer 400 here, so the controller parses by hand.
      // Django gets this free from its <int:pk> converter.
      const response = await request(app.getHttpServer()).get('/items/abc');

      expect(response.status).toBe(404);
      expect(response.body.type).toBe(`${PROBLEM_BASE}/not-found`);
    });

    it('answers 404 for a negative id', async () => {
      const response = await request(app.getHttpServer()).get('/items/-1');

      expect(response.status).toBe(404);
      expect(response.body.type).toBe(`${PROBLEM_BASE}/not-found`);
    });
  });

  describe('POST /items', () => {
    it('answers 201 with a Location header and the full created item', async () => {
      const response = await post(VALID_ITEM);

      expect(response.status).toBe(201);
      expect(response.headers.location).toBe(`/items/${response.body.id}`);
      expect(response.body).toMatchObject(VALID_ITEM);
    });

    it('persists the item so a subsequent GET returns it', async () => {
      const created = await post(VALID_ITEM);

      const list = await request(app.getHttpServer()).get('/items');

      expect(list.body).toHaveLength(1);
      expect(list.body[0].id).toBe(created.body.id);
    });

    it('trims name before validating and storing it', async () => {
      const response = await post({ ...VALID_ITEM, name: '  Mechanical Keyboard  ' });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('Mechanical Keyboard');
    });

    it('ignores unknown fields instead of rejecting them', async () => {
      // The contract's explicit choice, and the reason a client-supplied id cannot override the
      // server-assigned one. `whitelist: true` on the ValidationPipe is what enforces it.
      const response = await post({ ...VALID_ITEM, id: 99, hacked: true });

      expect(response.status).toBe(201);
      expect(response.body.id).not.toBe(99);
      expect(response.body).not.toHaveProperty('hacked');
    });
  });

  describe('POST /items — validation', () => {
    it('answers 400 problem+json with a message per missing field', async () => {
      const response = await post({});

      expect(response.status).toBe(400);
      expect(response.headers['content-type']).toContain(PROBLEM_CONTENT_TYPE);
      expect(response.body).toMatchObject({
        type: `${PROBLEM_BASE}/validation-error`,
        title: 'Validation failed',
        status: 400,
        instance: '/items',
      });
      // The keys are contractual; the strings are each framework's own.
      expect(Object.keys(response.body.errors).sort()).toEqual([
        'name',
        'price',
        'quantity',
        'sku',
      ]);
    });

    it('keys the errors map by camelCase field name', async () => {
      const response = await post({ ...VALID_ITEM, sku: 'lower-case' });

      expect(response.body.errors).toHaveProperty('sku');
      expect(Array.isArray(response.body.errors.sku)).toBe(true);
      expect(response.body.errors.sku.length).toBeGreaterThan(0);
    });

    it.each([
      ['a name shorter than 2 characters after trimming', { name: '  a  ' }],
      ['a name longer than 100 characters', { name: 'x'.repeat(101) }],
      ['a lowercase sku', { sku: 'kbd-87-blk' }],
      ['a sku shorter than 3 characters', { sku: 'AB' }],
      ['a sku longer than 20 characters', { sku: 'A'.repeat(21) }],
      ['a sku with disallowed characters', { sku: 'KBD_87' }],
      ['a fractional quantity', { quantity: 1.5 }],
      ['a negative quantity', { quantity: -1 }],
      ['a zero price', { price: 0 }],
      ['a negative price', { price: -1 }],
      ['a price with three decimal places', { price: 1.005 }],
      ['a price beyond DECIMAL(10,2)', { price: 100_000_000 }],
    ])('answers 400 for %s', async (_case, override) => {
      const response = await post({ ...VALID_ITEM, ...override });

      expect(response.status).toBe(400);
      expect(response.body.type).toBe(`${PROBLEM_BASE}/validation-error`);
    });

    it('accepts a quantity of zero, which the contract allows', async () => {
      const response = await post({ ...VALID_ITEM, quantity: 0 });

      expect(response.status).toBe(201);
      expect(response.body.quantity).toBe(0);
    });

    it('omits the errors member on a non-400 problem', async () => {
      // The contract says `errors` is present on 400 only.
      const response = await request(app.getHttpServer()).get('/items/999999');

      expect(response.body).not.toHaveProperty('errors');
    });
  });

  describe('POST /items — duplicate sku', () => {
    it('answers 409 problem+json', async () => {
      await post(VALID_ITEM);

      const response = await post({ ...VALID_ITEM, name: 'A Different Name' });

      expect(response.status).toBe(409);
      expect(response.headers['content-type']).toContain(PROBLEM_CONTENT_TYPE);
      expect(response.body).toMatchObject({
        type: `${PROBLEM_BASE}/duplicate-sku`,
        title: 'SKU already exists',
        status: 409,
        instance: '/items',
      });
      expect(response.body.detail).toContain(VALID_ITEM.sku);
    });

    it('does not create a second row', async () => {
      await post(VALID_ITEM);
      await post(VALID_ITEM);

      const list = await request(app.getHttpServer()).get('/items');

      expect(list.body).toHaveLength(1);
    });
  });

  describe('routes outside the contract', () => {
    it('renders an unmatched path as problem+json rather than a framework error', async () => {
      const response = await request(app.getHttpServer()).get('/not-a-route');

      expect(response.status).toBe(404);
      expect(response.headers['content-type']).toContain(PROBLEM_CONTENT_TYPE);
      expect(response.body.status).toBe(404);
    });

    it('renders an unsupported method as problem+json', async () => {
      // DELETE is deliberately out of scope. What matters is that it fails inside the contract's
      // error shape rather than as an Express default.
      const response = await request(app.getHttpServer()).delete('/items/1');

      expect(response.headers['content-type']).toContain(PROBLEM_CONTENT_TYPE);
      expect(response.body).toHaveProperty('type');
      expect(response.body).toHaveProperty('title');
      expect(response.body).toHaveProperty('status');
    });
  });
});
