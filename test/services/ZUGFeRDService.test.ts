/**
 * ZUGFeRDService tests — verify that the generated hybrid PDF contains:
 *
 *  1. An embedded file named "factur-x.xml"
 *  2. AFRelationship = Alternative on the file spec
 *  3. /AF array in the document catalog pointing at the embedded file
 *  4. XMP metadata stream with ZUGFeRD XRECHNUNG conformance declaration
 *  5. The embedded XML is byte-for-byte the original XRechnung XML
 *  6. /OutputIntents in catalog with sRGB ICC v4 profile (Gap 3)
 *
 * Also validates the XRechnung XML structure (well-formed, required elements).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import { Database } from '../../src/server/database/Database.js';
import { PDF, PdfArray, PdfDict, PdfRef, PdfStream } from '@libpdf/core';
import { ZUGFeRDService } from '../../src/server/services/ZUGFeRDService.js';
import { XRechnungXmlService } from '../../src/server/services/XRechnungXmlService.js';
import { PdfRenderService } from '../../src/server/services/PdfRenderService.js';
import type { InvoiceDto, PdfTemplateDto } from '../../src/shared/types';

const TEST_DB = path.resolve(process.cwd(), `test/.test-zugferd-${Date.now()}.db`);

beforeAll(() => {
  Database.resetInstance();
  Database.getInstance(TEST_DB);
});

afterAll(() => {
  Database.resetInstance();
  try { fs.unlinkSync(TEST_DB); } catch {}
  try { fs.unlinkSync(TEST_DB + '-wal'); } catch {}
  try { fs.unlinkSync(TEST_DB + '-shm'); } catch {}
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const INVOICE: InvoiceDto = {
  id: 1,
  invoiceNumber: 'ZUG-2024-0001',
  invoiceDate: '2024-06-01',
  invoiceTypeCode: '380',
  currencyCode: 'EUR',
  dueDate: '2024-07-01',
  buyerReference: 'REF-4711',
  paymentMeansCode: '58',
  iban: 'DE89370400440532013000',
  bic: 'COBADEFFXXX',
  paymentTerms: '30 Tage netto',
  taxCategoryCode: 'S',
  taxRate: 19,
  kleinunternehmer: false,
  totalNetAmount: 1000,
  totalTaxAmount: 190,
  totalGrossAmount: 1190,
  seller: {
    name: 'Testfirma GmbH',
    street: 'Musterstraße 1',
    postalCode: '10115',
    city: 'Berlin',
    countryCode: 'DE',
    vatId: 'DE123456789',
  },
  buyer: {
    name: 'Käufer AG',
    street: 'Käuferweg 5',
    postalCode: '80331',
    city: 'München',
    countryCode: 'DE',
  },
  lines: [
    {
      lineNumber: 1,
      itemName: 'Beratungsleistung',
      quantity: 10,
      unitCode: 'HUR',
      netPrice: 100,
      vatCategoryCode: 'S',
      vatRate: 19,
      lineNetAmount: 1000,
    },
  ],
};

const MINIMAL_TEMPLATE: PdfTemplateDto = {
  name: 'Test',
  pageSize: 'a4',
  orientation: 'portrait',
  blocks: [
    {
      id: '1',
      type: 'invoice-number',
      x: 60, y: 60, width: 250, height: 20, fontSize: 10,
    },
  ],
};

// ---------------------------------------------------------------------------
// Setup — generate base PDF and XML once
// ---------------------------------------------------------------------------

let zugferdBytes: Uint8Array;
let xmlString: string;
let pdf: PDF;

beforeAll(async () => {
  const renderer = new PdfRenderService();
  const xmlSvc = new XRechnungXmlService();
  const zugferdSvc = new ZUGFeRDService();

  const pdfBytes = await renderer.render(MINIMAL_TEMPLATE, INVOICE);
  xmlString = xmlSvc.generate(INVOICE);
  zugferdBytes = await zugferdSvc.embed(pdfBytes, xmlString);

  pdf = await PDF.load(zugferdBytes);
});

// ---------------------------------------------------------------------------
// 1. Embedded file is present
// ---------------------------------------------------------------------------

describe('ZUGFeRD — embedded XML file', () => {
  it('pdf.hasAttachment("factur-x.xml") returns true', () => {
    expect(pdf.hasAttachment('factur-x.xml')).toBe(true);
  });

  it('attachment content equals the original XRechnung XML', () => {
    const bytes = pdf.getAttachment('factur-x.xml');
    expect(bytes, 'attachment must not be null').not.toBeNull();
    const decoded = new TextDecoder().decode(bytes!);
    expect(decoded).toBe(xmlString);
  });

  it('MIME type is text/xml', () => {
    const info = pdf.getAttachments().get('factur-x.xml');
    expect(info?.mimeType).toContain('text/xml');
  });
});

// ---------------------------------------------------------------------------
// 2. AFRelationship = Alternative on FileSpec
// ---------------------------------------------------------------------------

describe('ZUGFeRD — AFRelationship on FileSpec', () => {
  it('FileSpec dict has /AFRelationship = /Alternative', () => {
    const ctx = pdf.context;
    const tree = ctx.catalog.getEmbeddedFilesTree();
    expect(tree, 'EmbeddedFiles tree must exist').not.toBeNull();

    // NameTree.get() resolves indirect references — returns a PdfDict, not PdfRef
    const fileSpec = tree!.get('factur-x.xml');
    expect(fileSpec, 'factur-x.xml must be in the name tree').not.toBeNull();
    expect(fileSpec instanceof PdfDict, 'FileSpec should be a PdfDict').toBe(true);

    const rel = (fileSpec as PdfDict).getName('AFRelationship');
    expect(rel, '/AFRelationship must be present').not.toBeUndefined();
    expect(rel!.value).toBe('Alternative');
  });
});

// ---------------------------------------------------------------------------
// 3. /AF array in document catalog
// ---------------------------------------------------------------------------

describe('ZUGFeRD — /AF array in catalog', () => {
  it('catalog has /AF entry', () => {
    const catalog = pdf.getCatalog();
    expect(catalog.has('AF'), '/AF must be in catalog').toBe(true);
  });

  it('/AF is an array with one entry', () => {
    const catalog = pdf.getCatalog();
    const af = catalog.getArray('AF');
    expect(af instanceof PdfArray, '/AF should be a PdfArray').toBe(true);
    expect(af!.length).toBeGreaterThanOrEqual(1);
  });

  it('/AF entry resolves to the factur-x.xml FileSpec', () => {
    const ctx = pdf.context;
    const catalog = pdf.getCatalog();
    const af = catalog.getArray('AF')!;
    const firstRef = af.at(0);
    expect(firstRef instanceof PdfRef, 'AF[0] should be a PdfRef').toBe(true);

    const fileSpec = ctx.resolve(firstRef as PdfRef);
    expect(fileSpec instanceof PdfDict, 'AF[0] should resolve to a PdfDict').toBe(true);

    // The FileSpec should have F = "factur-x.xml"
    const fname = (fileSpec as PdfDict).getString('UF') ?? (fileSpec as PdfDict).getString('F');
    expect(fname?.asString()).toBe('factur-x.xml');
  });
});

// ---------------------------------------------------------------------------
// 4. XMP metadata stream
// ---------------------------------------------------------------------------

describe('ZUGFeRD — XMP metadata in catalog', () => {
  let xmpText: string;

  beforeAll(() => {
    const catalog = pdf.getCatalog();
    const metaObj = catalog.get('Metadata', (ref) => pdf.context.resolve(ref as PdfRef));
    expect(metaObj, '/Metadata must be in catalog').not.toBeUndefined();

    // The metadata is a PdfStream; get its data
    const stream = metaObj as import('@libpdf/core').PdfStream;
    const data = stream.getDecodedData();
    xmpText = new TextDecoder().decode(data);
  });

  it('contains ZUGFeRD namespace declaration', () => {
    expect(xmpText).toContain('urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#');
  });

  it('declares XRECHNUNG conformance level', () => {
    expect(xmpText).toContain('<fx:ConformanceLevel>XRECHNUNG</fx:ConformanceLevel>');
  });

  it('declares ZUGFeRD version 2.3.1', () => {
    expect(xmpText).toContain('<fx:Version>2.3.1</fx:Version>');
  });

  it('declares document file name factur-x.xml', () => {
    expect(xmpText).toContain('<fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>');
  });

  it('declares document type INVOICE', () => {
    expect(xmpText).toContain('<fx:DocumentType>INVOICE</fx:DocumentType>');
  });

  it('declares PDF/A-3b conformance', () => {
    expect(xmpText).toContain('<pdfaid:part>3</pdfaid:part>');
    expect(xmpText).toContain('<pdfaid:conformance>B</pdfaid:conformance>');
  });

  it('contains Dublin Core namespace with dc:format (Gap 1)', () => {
    expect(xmpText).toContain('http://purl.org/dc/elements/1.1/');
    expect(xmpText).toContain('<dc:format>application/pdf</dc:format>');
  });

  it('contains XMP Basic namespace with CreatorTool and timestamps (Gap 1)', () => {
    expect(xmpText).toContain('http://ns.adobe.com/xap/1.0/');
    expect(xmpText).toContain('<xmp:CreatorTool>xpferd</xmp:CreatorTool>');
    expect(xmpText).toContain('<xmp:CreateDate>');
    expect(xmpText).toContain('<xmp:ModifyDate>');
  });

  it('contains PDF basic namespace with Producer (Gap 1)', () => {
    expect(xmpText).toContain('http://ns.adobe.com/pdf/1.3/');
    expect(xmpText).toContain('<pdf:Producer>');
  });
});

// ---------------------------------------------------------------------------
// 5. OutputIntent — sRGB ICC profile (Gap 3)
// ---------------------------------------------------------------------------

describe('ZUGFeRD — OutputIntent in catalog (Gap 3)', () => {
  it('catalog has /OutputIntents entry', () => {
    const catalog = pdf.getCatalog();
    expect(catalog.has('OutputIntents'), '/OutputIntents must be in catalog').toBe(true);
  });

  it('/OutputIntents is an array with one entry', () => {
    const catalog = pdf.getCatalog();
    const oi = catalog.getArray('OutputIntents');
    expect(oi instanceof PdfArray, '/OutputIntents should be a PdfArray').toBe(true);
    expect(oi!.length).toBe(1);
  });

  it('OutputIntent dict has S=/GTS_PDFA1 and correct identifier', () => {
    const catalog = pdf.getCatalog();
    const oiArray = catalog.getArray('OutputIntents')!;
    const firstEntry = oiArray.at(0);
    expect(firstEntry instanceof PdfRef, 'OutputIntents[0] should be a PdfRef').toBe(true);

    const dict = pdf.context.resolve(firstEntry as PdfRef);
    expect(dict instanceof PdfDict, 'OutputIntents[0] must resolve to a PdfDict').toBe(true);

    const s = (dict as PdfDict).getName('S');
    expect(s?.value).toBe('GTS_PDFA1');

    const oci = (dict as PdfDict).getString('OutputConditionIdentifier');
    expect(oci?.asString()).toBe('sRGB IEC61966-2.1');
  });

  it('DestOutputProfile resolves to a PdfStream (ICC profile bytes present)', () => {
    const catalog = pdf.getCatalog();
    const oiArray = catalog.getArray('OutputIntents')!;
    const intentDict = pdf.context.resolve(oiArray.at(0) as PdfRef) as PdfDict;

    const profileRef = intentDict.get('DestOutputProfile');
    expect(profileRef instanceof PdfRef, 'DestOutputProfile must be a PdfRef').toBe(true);

    const profileStream = pdf.context.resolve(profileRef as PdfRef);
    expect(profileStream instanceof PdfStream, 'DestOutputProfile must resolve to a PdfStream').toBe(true);

    // Verify the stream contains data (480-byte sRGB ICC v4 profile)
    const data = (profileStream as PdfStream).getDecodedData();
    expect(data.length).toBe(480);
  });
});

// ---------------------------------------------------------------------------
// 7. XRechnung XML structure validation
// ---------------------------------------------------------------------------

describe('XRechnung XML — structure and required elements', () => {
  it('is well-formed CII XML', () => {
    expect(xmlString).toContain('<?xml');
    expect(xmlString).toContain('rsm:CrossIndustryInvoice');
  });

  it('contains XRechnung 2.3 customization ID (BT-24)', () => {
    expect(xmlString).toContain('urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_2.3');
  });

  it('is well-formed CII (CrossIndustryInvoice root)', () => {
    expect(xmlString).toContain('rsm:CrossIndustryInvoice');
    expect(xmlString).toContain('xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"');
  });

  it('contains invoice number', () => {
    expect(xmlString).toContain('ZUG-2024-0001');
  });

  it('contains invoice date in CII format (YYYYMMDD, no dashes)', () => {
    expect(xmlString).toContain('20240601');
  });

  it('contains seller name', () => {
    expect(xmlString).toContain('Testfirma GmbH');
  });

  it('contains buyer name', () => {
    expect(xmlString).toContain('Käufer AG');
  });

  it('contains seller VAT ID (DE123456789)', () => {
    expect(xmlString).toContain('DE123456789');
  });

  it('contains tax rate 19%', () => {
    expect(xmlString).toContain('19');
  });

  it('contains line item name', () => {
    expect(xmlString).toContain('Beratungsleistung');
  });

  it('contains gross amount 1190', () => {
    expect(xmlString).toContain('1190');
  });

  it('uses CII namespaces and has no UBL elements', () => {
    expect(xmlString).toContain('xmlns:ram=');
    expect(xmlString).toContain('xmlns:udt=');
    expect(xmlString).not.toContain('xmlns:ubl=');
    expect(xmlString).not.toContain('xmlns:cbc=');
  });
});

// ---------------------------------------------------------------------------
// 8. Kleinunternehmer (§19 UStG) — VAT-exempt variant
// ---------------------------------------------------------------------------

describe('XRechnung XML — Kleinunternehmer variant', () => {
  it('generates tax-exempt XML when kleinunternehmer=true', () => {
    const xmlSvc = new XRechnungXmlService();
    const kleinInvoice: InvoiceDto = {
      ...INVOICE,
      kleinunternehmer: true,
      taxCategoryCode: 'E',
      taxRate: 0,
      totalTaxAmount: 0,
      totalGrossAmount: 1000,
      lines: [
        { ...INVOICE.lines[0], vatCategoryCode: 'E', vatRate: 0 },
      ],
    };
    const xml = xmlSvc.generate(kleinInvoice);
    expect(xml).toContain('§19');
    expect(xml).toContain('ExemptionReasonCode');
  });
});
