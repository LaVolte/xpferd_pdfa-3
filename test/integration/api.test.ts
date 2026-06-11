import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../../src/server/app.js';
import { Database } from '../../src/server/database/Database.js';
import { CURRENCY_SYMBOLS, CURRENCY_CODES } from '../../src/shared/constants/codeLists.js';
import path from 'path';
import fs from 'fs';
import http from 'http';

const TEST_DB = path.resolve(process.cwd(), 'test/.test-api.db');
let server: http.Server;
let baseUrl: string;

function sampleBody() {
  return {
    invoiceNumber: 'API-001',
    invoiceDate: '2024-06-20',
    invoiceTypeCode: '380',
    currencyCode: 'EUR',
    dueDate: '2024-07-20',
    buyerReference: '04011000-1234512345-06',
    seller: {
      name: 'API Seller', street: 'Str 1', city: 'Berlin',
      postalCode: '10115', countryCode: 'DE', vatId: 'DE123456789',
      contactName: 'Max Mustermann', contactPhone: '+49 30 12345678', contactEmail: 'seller@example.com',
    },
    buyer: {
      name: 'API Buyer', street: 'Str 2', city: 'Munich',
      postalCode: '80331', countryCode: 'DE', email: 'buyer@example.com',
    },
    paymentMeansCode: '58',
    taxCategoryCode: 'S',
    taxRate: 19,
    kleinunternehmer: false,
    lines: [
      { lineNumber: 1, quantity: 1, unitCode: 'C62', itemName: 'Thing', netPrice: 100, vatCategoryCode: 'S', vatRate: 19, lineNetAmount: 100 },
    ],
  };
}

async function api(method: string, path: string, body?: any): Promise<{ status: number; data: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = res.status === 204 ? null : (
    res.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text
  );
  return { status: res.status, data };
}

describe('API Integration', () => {
  beforeAll(async () => {
    Database.resetInstance();
    Database.getInstance(TEST_DB);
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://localhost:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    Database.resetInstance();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    if (fs.existsSync(TEST_DB + '-wal')) fs.unlinkSync(TEST_DB + '-wal');
    if (fs.existsSync(TEST_DB + '-shm')) fs.unlinkSync(TEST_DB + '-shm');
  });

  it('GET /api/v1/invoices returns empty array', async () => {
    const { status, data } = await api('GET', '/api/v1/invoices');
    expect(status).toBe(200);
    expect(data).toEqual([]);
  });

  it('POST /api/v1/invoices creates an invoice', async () => {
    const { status, data } = await api('POST', '/api/v1/invoices', sampleBody());
    expect(status).toBe(201);
    expect(data.id).toBeDefined();
    expect(data.invoiceNumber).toBe('API-001');
    expect(data.totalNetAmount).toBe(100);
    expect(data.totalTaxAmount).toBe(19);
    expect(data.totalGrossAmount).toBe(119);
  });

  it('GET /api/v1/invoices/:id returns the invoice', async () => {
    const { data: list } = await api('GET', '/api/v1/invoices');
    const { status, data } = await api('GET', `/api/v1/invoices/${list[0].id}`);
    expect(status).toBe(200);
    expect(data.lines).toHaveLength(1);
  });

  it('GET /api/v1/invoices/:id/export returns XML', async () => {
    const { data: list } = await api('GET', '/api/v1/invoices');
    const res = await fetch(`${baseUrl}/api/v1/invoices/${list[0].id}/export`);
    expect(res.status).toBe(200);
    const xml = await res.text();
    expect(xml).toContain('rsm:CrossIndustryInvoice');
    expect(xml).toContain('API-001');
  });

  it('DELETE /api/v1/invoices/:id removes the invoice', async () => {
    const { data: list } = await api('GET', '/api/v1/invoices');
    const { status } = await api('DELETE', `/api/v1/invoices/${list[0].id}`);
    expect(status).toBe(204);
    const { data: listAfter } = await api('GET', '/api/v1/invoices');
    expect(listAfter).toHaveLength(0);
  });

  it('POST returns 400 for invalid data', async () => {
    const { status } = await api('POST', '/api/v1/invoices', { bad: true });
    expect(status).toBe(400);
  });

  it('GET returns 404 for missing invoice', async () => {
    const { status } = await api('GET', '/api/v1/invoices/99999');
    expect(status).toBe(404);
  });

  describe('Invoice Template CRUD', () => {
    const templateBase = '/api/v1/templates/invoice-templates';
    const sampleData = JSON.stringify({ invoiceNumber: 'TPL-001', seller: { name: 'Vorlage GmbH' } });

    it('GET /invoice-templates returns empty array initially', async () => {
      const { status, data } = await api('GET', templateBase);
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
    });

    it('POST /invoice-templates creates a template', async () => {
      const { status, data } = await api('POST', templateBase, {
        name: 'Testvorlage',
        data: sampleData,
      });
      expect(status).toBe(201);
      expect(data.id).toBeTypeOf('number');
      expect(data.name).toBe('Testvorlage');
      expect(data.data).toBe(sampleData);
    });

    it('GET /invoice-templates/:id returns the created template', async () => {
      const { data: list } = await api('GET', templateBase);
      expect(list.length).toBeGreaterThan(0);
      const id = list[list.length - 1].id;

      const { status, data } = await api('GET', `${templateBase}/${id}`);
      expect(status).toBe(200);
      expect(data.id).toBe(id);
      expect(data.name).toBe('Testvorlage');
      expect(data.data).toBe(sampleData);
    });

    it('PUT /invoice-templates/:id updates name and data', async () => {
      const { data: list } = await api('GET', templateBase);
      const id = list[list.length - 1].id;
      const updatedData = JSON.stringify({ invoiceNumber: 'TPL-002', seller: { name: 'Neue GmbH' } });

      const { status, data } = await api('PUT', `${templateBase}/${id}`, {
        name: 'Geänderte Vorlage',
        data: updatedData,
      });
      expect(status).toBe(200);
      expect(data.id).toBe(id);
      expect(data.name).toBe('Geänderte Vorlage');
      expect(data.data).toBe(updatedData);
    });

    it('GET /invoice-templates/:id after PUT reflects updated values', async () => {
      const { data: list } = await api('GET', templateBase);
      const id = list[list.length - 1].id;

      const { status, data } = await api('GET', `${templateBase}/${id}`);
      expect(status).toBe(200);
      expect(data.name).toBe('Geänderte Vorlage');
    });

    it('POST /invoice-templates returns 400 for missing name', async () => {
      const { status } = await api('POST', templateBase, { data: sampleData });
      expect(status).toBe(400);
    });

    it('POST /invoice-templates returns 400 for missing data', async () => {
      const { status } = await api('POST', templateBase, { name: 'Nur Name' });
      expect(status).toBe(400);
    });

    it('GET /invoice-templates/:id returns 404 for unknown id', async () => {
      const { status } = await api('GET', `${templateBase}/99999`);
      expect(status).toBe(404);
    });

    it('PUT /invoice-templates/:id returns 404 for unknown id', async () => {
      const { status } = await api('PUT', `${templateBase}/99999`, {
        name: 'Nicht vorhanden',
        data: sampleData,
      });
      expect(status).toBe(404);
    });

    it('DELETE /invoice-templates/:id removes the template', async () => {
      const { data: list } = await api('GET', templateBase);
      const id = list[list.length - 1].id;

      const { status } = await api('DELETE', `${templateBase}/${id}`);
      expect(status).toBe(204);

      const { status: getStatus } = await api('GET', `${templateBase}/${id}`);
      expect(getStatus).toBe(404);
    });
  });
});

describe('Currency symbols', () => {
  it('EUR maps to €', () => {
    expect(CURRENCY_SYMBOLS['EUR']).toBe('€');
  });
  it('USD maps to $', () => {
    expect(CURRENCY_SYMBOLS['USD']).toBe('$');
  });
  it('GBP maps to £', () => {
    expect(CURRENCY_SYMBOLS['GBP']).toBe('£');
  });
  it('CHF maps to CHF (no official symbol)', () => {
    expect(CURRENCY_SYMBOLS['CHF']).toBe('CHF');
  });
  it('all CURRENCY_CODES have a symbol entry', () => {
    for (const code of Object.keys(CURRENCY_CODES)) {
      expect(CURRENCY_SYMBOLS[code], `${code} missing symbol`).toBeDefined();
    }
  });
  it('no unknown symbols (every symbol entry has a matching code)', () => {
    for (const code of Object.keys(CURRENCY_SYMBOLS)) {
      expect(CURRENCY_CODES[code], `${code} has symbol but no CURRENCY_CODE entry`).toBeDefined();
    }
  });
});
