/**
 * ZUGFeRDService — embeds an XRechnung UBL XML file into a PDF to produce a
 * hybrid ZUGFeRD 2.3 / Factur-X XRECHNUNG invoice.
 *
 * The resulting PDF contains:
 *  • factur-x.xml as an EmbeddedFile with AFRelationship = Alternative
 *  • /AF array in the document catalog pointing at the embedded file
 *  • XMP metadata stream with PDF/A-3b, Dublin Core, XMP Basic, PDF basic,
 *    and ZUGFeRD XRECHNUNG declarations (all required namespaces for PDF/A-3)
 *  • /OutputIntents entry in the catalog with an sRGB ICC v4 profile stream
 *    (ISO 19005-3 §6.2.3 — required when the document uses DeviceRGB colours)
 *
 * Spec reference:
 *  ZUGFeRD 2.3 / Factur-X 1.0.07
 *  Namespace: urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#
 */

import { PDF, PdfArray, PdfDict, PdfName, PdfNumber, PdfRef, PdfStream, PdfString } from '@libpdf/core';
import { loadSrgbProfile } from '../assets/iccLoader.js';

/** AFRelationship value required by ZUGFeRD for the invoice attachment. */
const AF_RELATIONSHIP = 'Alternative';

/** Embedded file name mandated by the Factur-X / ZUGFeRD specification §6. */
const ATTACHMENT_NAME = 'factur-x.xml';

export class ZUGFeRDService {
  /**
   * Embed `xmlString` into `pdfBytes` and return ZUGFeRD-compliant PDF bytes.
   *
   * @param pdfBytes  Raw PDF produced by PdfRenderService.render()
   * @param xmlString Factur-X CII XML string (from XRechnungXmlService.generate())
   */
  async embed(pdfBytes: Uint8Array, xmlString: string): Promise<Uint8Array> {
    const pdf = await PDF.load(pdfBytes);
    const xmlBytes = new TextEncoder().encode(xmlString);
    const now = new Date();

    // 1. Attach the XML file
    pdf.addAttachment(ATTACHMENT_NAME, xmlBytes, {
      mimeType: 'text/xml',
      description: 'Factur-X CII Invoice XML',
    });

    // 2. Set AFRelationship on the FileSpec dict, add /AF to catalog, and fix
    //    the EmbeddedFile stream to carry Type + Subtype (PDF/A-3 §6.8).
    //
    // NOTE: NameTree.get() resolves indirect references — it returns the
    // resolved PdfDict, not the PdfRef. Use ctx.getRef() to retrieve the
    // original indirect reference for inclusion in the /AF array.
    //
    // addAttachment() records mimeType only at the higher-level API layer; the
    // underlying EmbeddedFile stream may lack the /Subtype name entry required
    // by ISO 19005-3 §6.8.1. Replace the stream with one that has both
    // /Type /EmbeddedFile and /Subtype /application#2Fxml (slash is encoded as
    // #2F in PDF name syntax).
    const ctx = pdf.context;
    const tree = ctx.catalog.getEmbeddedFilesTree();
    if (tree) {
      const fileSpec = tree.get(ATTACHMENT_NAME);
      if (fileSpec instanceof PdfDict) {
        fileSpec.set('AFRelationship', PdfName.of(AF_RELATIONSHIP));
        const fileSpecRef = ctx.getRef(fileSpec);
        if (fileSpecRef) {
          pdf.getCatalog().set('AF', PdfArray.of(fileSpecRef));
        }

        // Replace the EF stream so it declares Subtype (PDF/A-3 §6.8)
        const rawEf = fileSpec.get('EF');
        const efDict = rawEf instanceof PdfRef
          ? ctx.resolve(rawEf) as PdfDict
          : rawEf instanceof PdfDict ? rawEf : null;
        if (efDict) {
          const newEfStream = PdfStream.fromDict(
            {
              Type: PdfName.of('EmbeddedFile'),
              Subtype: PdfName.of('text/xml'),
            },
            xmlBytes,
          );
          const newEfRef = ctx.register(newEfStream);
          efDict.set('F', newEfRef);
          efDict.set('UF', newEfRef);
        }
      }
    }

    // 3. Create and set ZUGFeRD XMP metadata stream (full required namespace set)
    const xmpBytes = new TextEncoder().encode(this.buildXmp(now));
    const metadataStream = PdfStream.fromDict(
      { Type: PdfName.of('Metadata'), Subtype: PdfName.of('XML') },
      xmpBytes,
    );
    const metadataRef = ctx.register(metadataStream);
    pdf.getCatalog().set('Metadata', metadataRef);

    // 4. Embed sRGB OutputIntent (ISO 19005-3 §6.2.3 — required for DeviceRGB)
    this.embedOutputIntent(pdf);

    return new Uint8Array(await pdf.save());
  }

  /**
   * Attach an sRGB ICC v4 OutputIntent to the PDF catalog.
   *
   * PDF/A-3b (ISO 19005-3 §6.2.3) requires /OutputIntents when the document
   * uses DeviceRGB colour spaces. The GTS_PDFA1 sub-type signals to PDF/A
   * validators that this intent is the authoritative colour characterisation.
   */
  private embedOutputIntent(pdf: PDF): void {
    const profileBytes = loadSrgbProfile();
    const ctx = pdf.context;

    // ICC profile stream — N=3 for RGB (required by ISO 32000 §10.3.2)
    const profileStream = PdfStream.fromDict(
      { N: PdfNumber.of(3) },
      profileBytes,
    );
    const profileRef = ctx.register(profileStream);

    const outputIntentDict = PdfDict.of({
      Type: PdfName.of('OutputIntent'),
      S: PdfName.of('GTS_PDFA1'),
      OutputConditionIdentifier: PdfString.fromString('sRGB IEC61966-2.1'),
      DestOutputProfile: profileRef,
    });
    const outputIntentRef = ctx.register(outputIntentDict);

    pdf.getCatalog().set('OutputIntents', PdfArray.of(outputIntentRef));
  }

  /** Format a Date as an XMP/ISO 8601 timestamp with UTC offset. */
  private formatXmpDate(d: Date): string {
    return d.toISOString().replace(/\.\d{3}Z$/, '+00:00');
  }

  private buildXmp(now: Date): string {
    const ts = this.formatXmpDate(now);
    // The BOM character (﻿) before the id attribute is required by the XMP spec.
    return (
      `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n` +
      `<x:xmpmeta xmlns:x="adobe:ns:meta/">\n` +
      `  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n` +

      // PDF/A-3b conformance declaration
      `    <rdf:Description rdf:about=""\n` +
      `        xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">\n` +
      `      <pdfaid:part>3</pdfaid:part>\n` +
      `      <pdfaid:conformance>B</pdfaid:conformance>\n` +
      `    </rdf:Description>\n` +

      // Dublin Core — required baseline namespace for PDF/A-3
      `    <rdf:Description rdf:about=""\n` +
      `        xmlns:dc="http://purl.org/dc/elements/1.1/">\n` +
      `      <dc:format>application/pdf</dc:format>\n` +
      `    </rdf:Description>\n` +

      // XMP Basic — required baseline namespace for PDF/A-3
      `    <rdf:Description rdf:about=""\n` +
      `        xmlns:xmp="http://ns.adobe.com/xap/1.0/">\n` +
      `      <xmp:CreatorTool>xpferd</xmp:CreatorTool>\n` +
      `      <xmp:CreateDate>${ts}</xmp:CreateDate>\n` +
      `      <xmp:ModifyDate>${ts}</xmp:ModifyDate>\n` +
      `    </rdf:Description>\n` +

      // PDF basic — required baseline namespace for PDF/A-3
      `    <rdf:Description rdf:about=""\n` +
      `        xmlns:pdf="http://ns.adobe.com/pdf/1.3/">\n` +
      `      <pdf:Producer>xpferd / @libpdf/core</pdf:Producer>\n` +
      `    </rdf:Description>\n` +

      // ZUGFeRD / Factur-X metadata
      `    <rdf:Description rdf:about=""\n` +
      `        xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">\n` +
      `      <fx:DocumentFileName>${ATTACHMENT_NAME}</fx:DocumentFileName>\n` +
      `      <fx:DocumentType>INVOICE</fx:DocumentType>\n` +
      `      <fx:Version>2.3.1</fx:Version>\n` +
      `      <fx:ConformanceLevel>XRECHNUNG</fx:ConformanceLevel>\n` +
      `    </rdf:Description>\n` +

      // PDF/A extension schema declaration (required for strict conformance validators)
      `    <rdf:Description rdf:about=""\n` +
      `        xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/"\n` +
      `        xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#"\n` +
      `        xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">\n` +
      `      <pdfaExtension:schemas>\n` +
      `        <rdf:Bag>\n` +
      `          <rdf:li rdf:parseType="Resource">\n` +
      `            <pdfaSchema:schema>ZUGFeRD / Factur-X PDFA Extension Schema</pdfaSchema:schema>\n` +
      `            <pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>\n` +
      `            <pdfaSchema:prefix>fx</pdfaSchema:prefix>\n` +
      `            <pdfaSchema:property>\n` +
      `              <rdf:Seq>\n` +
      `                <rdf:li rdf:parseType="Resource">\n` +
      `                  <pdfaProperty:name>DocumentFileName</pdfaProperty:name>\n` +
      `                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>\n` +
      `                  <pdfaProperty:category>external</pdfaProperty:category>\n` +
      `                  <pdfaProperty:description>Name of the embedded invoice XML file</pdfaProperty:description>\n` +
      `                </rdf:li>\n` +
      `                <rdf:li rdf:parseType="Resource">\n` +
      `                  <pdfaProperty:name>DocumentType</pdfaProperty:name>\n` +
      `                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>\n` +
      `                  <pdfaProperty:category>external</pdfaProperty:category>\n` +
      `                  <pdfaProperty:description>Type of the embedded invoice document</pdfaProperty:description>\n` +
      `                </rdf:li>\n` +
      `                <rdf:li rdf:parseType="Resource">\n` +
      `                  <pdfaProperty:name>Version</pdfaProperty:name>\n` +
      `                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>\n` +
      `                  <pdfaProperty:category>external</pdfaProperty:category>\n` +
      `                  <pdfaProperty:description>ZUGFeRD specification version (2.3 = Factur-X 1.0.07)</pdfaProperty:description>\n` +
      `                </rdf:li>\n` +
      `                <rdf:li rdf:parseType="Resource">\n` +
      `                  <pdfaProperty:name>ConformanceLevel</pdfaProperty:name>\n` +
      `                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>\n` +
      `                  <pdfaProperty:category>external</pdfaProperty:category>\n` +
      `                  <pdfaProperty:description>ZUGFeRD conformance level / profile</pdfaProperty:description>\n` +
      `                </rdf:li>\n` +
      `              </rdf:Seq>\n` +
      `            </pdfaSchema:property>\n` +
      `          </rdf:li>\n` +
      `        </rdf:Bag>\n` +
      `      </pdfaExtension:schemas>\n` +
      `    </rdf:Description>\n` +

      `  </rdf:RDF>\n` +
      `</x:xmpmeta>\n` +
      `<?xpacket end="w"?>`
    );
  }
}
