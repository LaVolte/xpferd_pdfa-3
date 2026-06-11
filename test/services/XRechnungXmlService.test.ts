import { describe, it, expect } from 'vitest';
import { XRechnungXmlService } from '../../src/server/services/XRechnungXmlService.js';
import type { InvoiceDto } from '../../src/shared/types';

function sampleInvoice(): InvoiceDto {
  return {
    id: 1,
    invoiceNumber: 'XML-001',
    invoiceDate: '2024-06-20',
    invoiceTypeCode: '380',
    currencyCode: 'EUR',
    dueDate: '2024-07-20',
    deliveryDate: '2024-06-20',
    seller: {
      name: 'XML Seller GmbH', street: 'Str 1', city: 'Berlin',
      postalCode: '10115', countryCode: 'DE', vatId: 'DE111111111',
      contactName: 'Max', contactPhone: '+49123', contactEmail: 'max@example.com',
    },
    buyer: {
      name: 'XML Buyer AG', street: 'Str 2', city: 'Munich',
      postalCode: '80331', countryCode: 'DE', email: 'buyer@example.com',
    },
    buyerReference: '04011000-1234512345-06',
    paymentMeansCode: '58',
    iban: 'DE89370400440532013000',
    bic: 'COBADEFFXXX',
    paymentTerms: 'Net 30 days',
    taxCategoryCode: 'S',
    taxRate: 19,
    kleinunternehmer: false,
    totalNetAmount: 100,
    totalTaxAmount: 19,
    totalGrossAmount: 119,
    amountDue: 119,
    lines: [
      { lineNumber: 1, quantity: 2, unitCode: 'C62', itemName: 'Widget', netPrice: 50, vatCategoryCode: 'S', vatRate: 19, lineNetAmount: 100 },
    ],
  };
}

describe('XRechnungXmlService — CII format', () => {
  const service = new XRechnungXmlService();

  it('generates CII (CrossIndustryInvoice) root element', () => {
    const xml = service.generate(sampleInvoice());
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('rsm:CrossIndustryInvoice');
    expect(xml).toContain('xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"');
    expect(xml).toContain('xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"');
    expect(xml).toContain('xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100"');
  });

  it('contains Factur-X XRECHNUNG customization ID', () => {
    const xml = service.generate(sampleInvoice());
    expect(xml).toContain(
      'urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_2.3' +
      '#conformant#urn:factur-x.eu:1p0:xrechnung',
    );
  });

  it('contains invoice header fields in CII format', () => {
    const xml = service.generate(sampleInvoice());
    expect(xml).toContain('<ram:ID>XML-001</ram:ID>');
    expect(xml).toContain('<ram:TypeCode>380</ram:TypeCode>');
    // CII dates use format="102" with no dashes: YYYYMMDD
    expect(xml).toContain('<udt:DateTimeString format="102">20240620</udt:DateTimeString>');
    expect(xml).toContain('<ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>');
  });

  it('formats dates as YYYYMMDD (format 102) — no ISO dashes', () => {
    const xml = service.generate(sampleInvoice());
    // No ISO-style dates should appear (YYYY-MM-DD)
    expect(xml).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    // CII format-102 dates should be present
    expect(xml).toContain('format="102"');
  });

  it('contains seller and buyer parties in CII structure', () => {
    const xml = service.generate(sampleInvoice());
    expect(xml).toContain('<ram:SellerTradeParty>');
    expect(xml).toContain('<ram:BuyerTradeParty>');
    expect(xml).toContain('<ram:Name>XML Seller GmbH</ram:Name>');
    expect(xml).toContain('<ram:Name>XML Buyer AG</ram:Name>');
  });

  it('contains seller postal address', () => {
    const xml = service.generate(sampleInvoice());
    expect(xml).toContain('<ram:PostalTradeAddress>');
    expect(xml).toContain('<ram:PostcodeCode>10115</ram:PostcodeCode>');
    expect(xml).toContain('<ram:LineOne>Str 1</ram:LineOne>');
    expect(xml).toContain('<ram:CityName>Berlin</ram:CityName>');
    expect(xml).toContain('<ram:CountryID>DE</ram:CountryID>');
  });

  it('contains seller VAT ID in SpecifiedTaxRegistration (BT-31)', () => {
    const xml = service.generate(sampleInvoice());
    expect(xml).toContain('<ram:ID schemeID="VA">DE111111111</ram:ID>');
  });

  it('BT-42 — emits TelephoneUniversalCommunication only when phone is non-empty', () => {
    const xml = service.generate(sampleInvoice());
    expect(xml).toContain('<ram:TelephoneUniversalCommunication>');
    expect(xml).toContain('<ram:CompleteNumber>+49123</ram:CompleteNumber>');

    // Empty phone → element must be absent
    const inv = sampleInvoice();
    inv.seller.contactPhone = '';
    const xmlNoPhone = service.generate(inv);
    expect(xmlNoPhone).not.toContain('<ram:TelephoneUniversalCommunication>');
  });

  it('BT-72 — ActualDeliveryDate present when deliveryDate is set', () => {
    const xml = service.generate(sampleInvoice());
    expect(xml).toContain('<ram:ActualDeliverySupplyChainEvent>');
    // delivery date 2024-06-20 → 20240620
    expect(xml).toContain('<udt:DateTimeString format="102">20240620</udt:DateTimeString>');
  });

  it('BT-72 — falls back to invoiceDate when deliveryDate is absent', () => {
    const inv = sampleInvoice();
    delete inv.deliveryDate;
    const xml = service.generate(inv);
    expect(xml).toContain('<ram:ActualDeliverySupplyChainEvent>');
    // invoice date 2024-06-20 is used as fallback
    expect(xml).toContain('<udt:DateTimeString format="102">20240620</udt:DateTimeString>');
  });

  it('contains payment information in CII structure', () => {
    const xml = service.generate(sampleInvoice());
    expect(xml).toContain('<ram:SpecifiedTradeSettlementPaymentMeans>');
    expect(xml).toContain('<ram:TypeCode>58</ram:TypeCode>');
    expect(xml).toContain('<ram:IBANID>DE89370400440532013000</ram:IBANID>');
    expect(xml).toContain('<ram:BICID>COBADEFFXXX</ram:BICID>');
  });

  it('contains payment terms and due date', () => {
    const xml = service.generate(sampleInvoice());
    expect(xml).toContain('<ram:Description>Net 30 days</ram:Description>');
    // due date 2024-07-20 → 20240720
    expect(xml).toContain('<udt:DateTimeString format="102">20240720</udt:DateTimeString>');
  });

  it('contains tax and monetary totals in CII structure', () => {
    const xml = service.generate(sampleInvoice());
    expect(xml).toContain('<ram:CalculatedAmount>19.00</ram:CalculatedAmount>');
    expect(xml).toContain('<ram:TaxBasisTotalAmount>100.00</ram:TaxBasisTotalAmount>');
    expect(xml).toContain('<ram:TaxTotalAmount currencyID="EUR">19.00</ram:TaxTotalAmount>');
    expect(xml).toContain('<ram:GrandTotalAmount>119.00</ram:GrandTotalAmount>');
    expect(xml).toContain('<ram:DuePayableAmount>119.00</ram:DuePayableAmount>');
  });

  it('contains line items in CII structure', () => {
    const xml = service.generate(sampleInvoice());
    expect(xml).toContain('<ram:IncludedSupplyChainTradeLineItem>');
    expect(xml).toContain('<ram:BilledQuantity unitCode="C62">2</ram:BilledQuantity>');
    expect(xml).toContain('<ram:Name>Widget</ram:Name>');
    expect(xml).toContain('<ram:ChargeAmount>50.00</ram:ChargeAmount>');
    expect(xml).toContain('<ram:LineTotalAmount>100.00</ram:LineTotalAmount>');
  });

  it('Kleinunternehmer — includes §19 exemption note and ExemptionReasonCode', () => {
    const inv = {
      ...sampleInvoice(),
      kleinunternehmer: true,
      taxCategoryCode: 'E',
      taxRate: 0,
      totalTaxAmount: 0,
      totalGrossAmount: 100,
      amountDue: 100,
      lines: [{ ...sampleInvoice().lines[0], vatCategoryCode: 'E', vatRate: 0 }],
    };
    const xml = service.generate(inv);
    expect(xml).toContain('§19 UStG');
    expect(xml).toContain('<ram:ExemptionReasonCode>vatex-eu-132-1b</ram:ExemptionReasonCode>');
    expect(xml).toContain('<ram:CategoryCode>E</ram:CategoryCode>');
  });

  it('Kleinunternehmer — no ExemptionReasonCode for regular invoices', () => {
    const xml = service.generate(sampleInvoice());
    expect(xml).not.toContain('§19 UStG');
    expect(xml).not.toContain('ExemptionReasonCode');
  });

  it('uses taxNumber as BT-32 (FC scheme) when provided', () => {
    const inv = sampleInvoice();
    inv.seller.taxNumber = '123/456/78901';
    const xml = service.generate(inv);
    expect(xml).toContain('<ram:ID schemeID="FC">123/456/78901</ram:ID>');
  });

  it('does NOT produce UBL elements (no cbc: or cac: prefixes)', () => {
    const xml = service.generate(sampleInvoice());
    expect(xml).not.toContain('xmlns:cbc=');
    expect(xml).not.toContain('xmlns:cac=');
    expect(xml).not.toContain('xmlns:ubl=');
    expect(xml).not.toContain('ubl:Invoice');
  });
});
