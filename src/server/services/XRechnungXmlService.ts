import { create } from 'xmlbuilder2';
import type { InvoiceDto } from '../../shared/types';
import { KLEINUNTERNEHMER_NOTE } from '../../shared/constants/index.js';

/**
 * Generates a ZUGFeRD 2.3 / Factur-X 1.0 compliant CII (Cross Industry Invoice)
 * XML document in the XRECHNUNG profile.
 *
 * Syntax: UN/CEFACT Cross Industry Invoice 100
 * Profile: urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_2.3
 * Attachment filename: factur-x.xml (required by Factur-X spec §6)
 */
export class XRechnungXmlService {
  private static readonly CUSTOMIZATION_ID =
    'urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_3.0';

  generate(invoice: InvoiceDto): string {
    const root = create({ version: '1.0', encoding: 'UTF-8' })
      .ele('rsm:CrossIndustryInvoice', {
        'xmlns:rsm': 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100',
        'xmlns:ram': 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100',
        'xmlns:udt': 'urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100',
        'xmlns:qdt': 'urn:un:unece:uncefact:data:standard:QualifiedDataType:100',
      });

    // ── 1. ExchangedDocumentContext ───────────────────────────────────────────
    root.ele('rsm:ExchangedDocumentContext')
      .ele('ram:GuidelineSpecifiedDocumentContextParameter')
      .ele('ram:ID').txt(XRechnungXmlService.CUSTOMIZATION_ID);

    // ── 2. ExchangedDocument (header) ─────────────────────────────────────────
    const doc = root.ele('rsm:ExchangedDocument');
    doc.ele('ram:ID').txt(invoice.invoiceNumber);
    doc.ele('ram:TypeCode').txt(invoice.invoiceTypeCode);
    doc.ele('ram:IssueDateTime')
      .ele('udt:DateTimeString', { format: '102' }).txt(this.ciiDate(invoice.invoiceDate));

    // Note (BT-22) — Kleinunternehmer or free text
    if (invoice.kleinunternehmer) {
      doc.ele('ram:IncludedNote').ele('ram:Content').txt(KLEINUNTERNEHMER_NOTE);
    } else if (invoice.note) {
      doc.ele('ram:IncludedNote').ele('ram:Content').txt(invoice.note);
    }

    // ── 3. SupplyChainTradeTransaction ────────────────────────────────────────
    const tx = root.ele('rsm:SupplyChainTradeTransaction');

    // 3a. Line items (BG-25) — must come first per CII schema order
    for (const line of invoice.lines) {
      const li = tx.ele('ram:IncludedSupplyChainTradeLineItem');

      li.ele('ram:AssociatedDocumentLineDocument')
        .ele('ram:LineID').txt(String(line.lineNumber));

      const product = li.ele('ram:SpecifiedTradeProduct');
      if (line.itemDescription) {
        product.ele('ram:Description').txt(line.itemDescription);
      }
      product.ele('ram:Name').txt(line.itemName);

      li.ele('ram:SpecifiedLineTradeAgreement')
        .ele('ram:NetPriceProductTradePrice')
        .ele('ram:ChargeAmount').txt(this.fmt(line.netPrice));

      li.ele('ram:SpecifiedLineTradeDelivery')
        .ele('ram:BilledQuantity', { unitCode: line.unitCode }).txt(String(line.quantity));

      const lineSettlement = li.ele('ram:SpecifiedLineTradeSettlement');
      const lineTax = lineSettlement.ele('ram:ApplicableTradeTax');
      lineTax.ele('ram:TypeCode').txt('VAT');
      lineTax.ele('ram:CategoryCode').txt(line.vatCategoryCode);
      lineTax.ele('ram:RateApplicablePercent').txt(String(line.vatRate));

      lineSettlement.ele('ram:SpecifiedTradeSettlementLineMonetarySummation')
        .ele('ram:LineTotalAmount').txt(this.fmt(line.lineNetAmount));
    }

    // 3b. Header Trade Agreement
    const agreement = tx.ele('ram:ApplicableHeaderTradeAgreement');
    agreement.ele('ram:BuyerReference').txt(invoice.buyerReference || 'n/a');

    // Seller (BG-4)
    const seller = agreement.ele('ram:SellerTradeParty');
    seller.ele('ram:Name').txt(invoice.seller.name);
    // BT-33 — legal registration info (managing directors, registered office, commercial register)
    if (invoice.seller.legalRegistration?.trim()) {
      seller.ele('ram:Description').txt(invoice.seller.legalRegistration.trim());
    }

    // Seller contact (BG-6) — BR-DE-2: mandatory for XRechnung
    const contact = seller.ele('ram:DefinedTradeContact');
    contact.ele('ram:PersonName').txt(invoice.seller.contactName || '');
    // BT-42 — only emit when a non-empty phone is available
    if (invoice.seller.contactPhone?.trim()) {
      contact.ele('ram:TelephoneUniversalCommunication')
        .ele('ram:CompleteNumber').txt(invoice.seller.contactPhone.trim());
    }
    if (invoice.seller.contactEmail) {
      contact.ele('ram:EmailURIUniversalCommunication')
        .ele('ram:URIID').txt(invoice.seller.contactEmail);
    }

    this.addPostalAddress(seller, invoice.seller);

    // Seller electronic address (BT-34) — EM scheme = email
    if (invoice.seller.contactEmail) {
      seller.ele('ram:URIUniversalCommunication')
        .ele('ram:URIID', { schemeID: 'EM' }).txt(invoice.seller.contactEmail);
    }

    // BT-31 VAT ID
    if (invoice.seller.vatId) {
      seller.ele('ram:SpecifiedTaxRegistration')
        .ele('ram:ID', { schemeID: 'VA' }).txt(invoice.seller.vatId);
    }
    // BT-32 Tax number (Steuernummer)
    if (invoice.seller.taxNumber) {
      seller.ele('ram:SpecifiedTaxRegistration')
        .ele('ram:ID', { schemeID: 'FC' }).txt(invoice.seller.taxNumber);
    }

    // Buyer (BG-7)
    const buyer = agreement.ele('ram:BuyerTradeParty');
    buyer.ele('ram:Name').txt(invoice.buyer.name);
    this.addPostalAddress(buyer, invoice.buyer);

    // Buyer electronic address (BT-49)
    if (invoice.buyer.email) {
      buyer.ele('ram:URIUniversalCommunication')
        .ele('ram:URIID', { schemeID: 'EM' }).txt(invoice.buyer.email);
    }

    // BT-48 Buyer VAT ID
    if (invoice.buyer.vatId) {
      buyer.ele('ram:SpecifiedTaxRegistration')
        .ele('ram:ID', { schemeID: 'VA' }).txt(invoice.buyer.vatId);
    }

    // BT-13 Order reference
    if (invoice.orderReference) {
      agreement.ele('ram:BuyerOrderReferencedDocument')
        .ele('ram:IssuerAssignedID').txt(invoice.orderReference);
    }

    // BT-12 Contract reference
    if (invoice.contractReference) {
      agreement.ele('ram:ContractReferencedDocument')
        .ele('ram:IssuerAssignedID').txt(invoice.contractReference);
    }

    // 3c. Header Trade Delivery
    // BT-72 ActualDeliveryDate — mandatory for XRechnung (BR-DE-6).
    // Fall back to invoice issue date when no explicit delivery date is set.
    const deliveryDate = invoice.deliveryDate || invoice.invoiceDate;
    tx.ele('ram:ApplicableHeaderTradeDelivery')
      .ele('ram:ActualDeliverySupplyChainEvent')
      .ele('ram:OccurrenceDateTime')
      .ele('udt:DateTimeString', { format: '102' }).txt(this.ciiDate(deliveryDate));

    // 3d. Header Trade Settlement
    const settlement = tx.ele('ram:ApplicableHeaderTradeSettlement');

    if (invoice.paymentReference) {
      settlement.ele('ram:PaymentReference').txt(invoice.paymentReference);
    }
    settlement.ele('ram:InvoiceCurrencyCode').txt(invoice.currencyCode);

    // Payment means (BG-16)
    const paymentMeans = settlement.ele('ram:SpecifiedTradeSettlementPaymentMeans');
    paymentMeans.ele('ram:TypeCode').txt(invoice.paymentMeansCode);
    if (invoice.iban) {
      const creditorAccount = paymentMeans.ele('ram:PayeePartyCreditorFinancialAccount');
      creditorAccount.ele('ram:IBANID').txt(invoice.iban);
      if (invoice.accountName) {
        creditorAccount.ele('ram:AccountName').txt(invoice.accountName);
      }
      if (invoice.bic) {
        paymentMeans.ele('ram:PayeeSpecifiedCreditorFinancialInstitution')
          .ele('ram:BICID').txt(invoice.bic);
      }
    }

    // Tax (BG-23)
    const tax = settlement.ele('ram:ApplicableTradeTax');
    tax.ele('ram:CalculatedAmount').txt(this.fmt(invoice.totalTaxAmount ?? 0));
    tax.ele('ram:TypeCode').txt('VAT');
    if (invoice.kleinunternehmer) {
      tax.ele('ram:ExemptionReason').txt(KLEINUNTERNEHMER_NOTE);
      tax.ele('ram:ExemptionReasonCode').txt('vatex-eu-132-1b');
    }
    tax.ele('ram:BasisAmount').txt(this.fmt(invoice.totalNetAmount ?? 0));
    tax.ele('ram:CategoryCode').txt(invoice.taxCategoryCode);
    tax.ele('ram:RateApplicablePercent').txt(String(invoice.taxRate));

    // Payment terms (BT-20)
    if (invoice.paymentTerms || invoice.dueDate) {
      const terms = settlement.ele('ram:SpecifiedTradePaymentTerms');
      if (invoice.paymentTerms) {
        terms.ele('ram:Description').txt(invoice.paymentTerms);
      }
      if (invoice.dueDate) {
        terms.ele('ram:DueDateDateTime')
          .ele('udt:DateTimeString', { format: '102' }).txt(this.ciiDate(invoice.dueDate));
      }
    }

    // Monetary totals (BG-22)
    const totals = settlement.ele('ram:SpecifiedTradeSettlementHeaderMonetarySummation');
    totals.ele('ram:LineTotalAmount').txt(this.fmt(invoice.totalNetAmount ?? 0));
    totals.ele('ram:TaxBasisTotalAmount').txt(this.fmt(invoice.totalNetAmount ?? 0));
    totals.ele('ram:TaxTotalAmount', { currencyID: invoice.currencyCode })
      .txt(this.fmt(invoice.totalTaxAmount ?? 0));
    totals.ele('ram:GrandTotalAmount').txt(this.fmt(invoice.totalGrossAmount ?? 0));
    if (invoice.prepaidAmount && invoice.prepaidAmount > 0) {
      totals.ele('ram:TotalPrepaidAmount').txt(this.fmt(invoice.prepaidAmount));
    }
    totals.ele('ram:DuePayableAmount').txt(this.fmt(invoice.amountDue ?? 0));

    return root.end({ prettyPrint: true });
  }

  private addPostalAddress(
    party: ReturnType<typeof create>,
    address: { street: string; city: string; postalCode: string; countryCode: string },
  ): void {
    const addr = (party as any).ele('ram:PostalTradeAddress');
    addr.ele('ram:PostcodeCode').txt(address.postalCode);
    addr.ele('ram:LineOne').txt(address.street);
    addr.ele('ram:CityName').txt(address.city);
    addr.ele('ram:CountryID').txt(address.countryCode);
  }

  /** Convert ISO date (YYYY-MM-DD) to CII format 102 (YYYYMMDD). */
  private ciiDate(iso: string): string {
    return iso.replace(/-/g, '');
  }

  private fmt(n: number): string {
    return n.toFixed(2);
  }
}
