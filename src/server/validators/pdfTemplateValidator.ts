import { z } from 'zod';

const pdfBlockSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    'seller-address', 'buyer-address', 'invoice-header', 'lines-table',
    'totals', 'payment-info', 'free-text', 'image', 'logo', 'line',
    'invoice-title', 'invoice-number', 'invoice-date', 'due-date', 'buyer-reference',
    'total-net', 'total-tax', 'total-gross',
    'payment-means', 'iban-bic', 'payment-terms',
    'kleinunternehmer-note', 'seller-legal',
  ]),
  x: z.number().min(0),
  y: z.number().min(0),
  width: z.number().min(10),
  height: z.number().min(0),
  fontSize: z.number().min(4).max(72).optional(),
  fontColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  fontWeight: z.enum(['normal', 'bold']).optional(),
  content: z.string().optional(),
  columns: z.array(z.string()).optional(),
  showHeader: z.boolean().optional(),
  lineHeight: z.number().min(1.2).max(3.0).optional(),
  tableStyle: z.enum(['minimal', 'grid', 'striped', 'compact', 'elegant', 'modern']).optional(),
  tableHeaderBgColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  tableHeaderLineColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  columnAlignments: z.record(z.string(), z.enum(['left', 'right', 'center'])).optional(),
  textAlign: z.enum(['left', 'center', 'right', 'block']).optional(),
  paddingLeft: z.number().min(0).max(100).optional(),
  paddingRight: z.number().min(0).max(100).optional(),
  fontFamily: z.string().optional(),
  lockAspectRatio: z.boolean().optional(),
  lineThickness: z.number().min(0.25).max(10).optional(),
  lineColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  lineDirection: z.enum(['horizontal', 'vertical']).optional(),
});

const guideLineSchema = z.object({
  id: z.string().min(1),
  orientation: z.enum(['horizontal', 'vertical']),
  position: z.number(),
  locked: z.boolean(),
});

export const pdfTemplateSchema = z.object({
  name: z.string().min(1, 'Name ist erforderlich'),
  pageSize: z.enum(['a4', 'letter']),
  orientation: z.enum(['portrait', 'landscape']),
  blocks: z.array(pdfBlockSchema),
  guideLines: z.array(guideLineSchema).optional(),
  logoData: z.string().optional(),
  logoMimeType: z.string().optional(),
  customFonts: z.array(z.object({
    name: z.string().min(1),
    data: z.string().min(1),
    dataBold: z.string().min(1).optional(),
    mimeType: z.string().min(1),
  })).optional(),
  marginLeft:   z.number().min(0).max(10).optional(),
  marginRight:  z.number().min(0).max(10).optional(),
  marginTop:    z.number().min(0).max(10).optional(),
  marginBottom: z.number().min(0).max(10).optional(),
});

export const previewDraftSchema = z.object({
  template: pdfTemplateSchema,
  invoiceId: z.number().int().positive(),
});
