import { z } from 'zod';
import validator from 'validator';

export const partySchema = z.object({
  type: z.enum(['seller', 'buyer']),
  name: z.string().min(1, 'Name ist erforderlich'),
  street: z.string().min(1, 'Straße ist erforderlich'),
  city: z.string().min(1, 'Ort ist erforderlich'),
  postalCode: z.string().min(1, 'PLZ ist erforderlich'),
  countryCode: z.string().length(2, 'Ländercode muss 2 Zeichen haben'),
  vatId: z.string().optional().or(z.literal('')),
  taxNumber: z.string().optional().or(z.literal('')),
  contactName: z.string().optional().or(z.literal('')),
  contactPhone: z.string().optional().or(z.literal('')),
  contactEmail: z.string().optional().or(z.literal('')),
  email: z.string().optional().or(z.literal('')),
  legalRegistration: z.string().optional().or(z.literal('')),
}).refine(
  (data) => data.countryCode !== 'DE' || /^\d{5}$/.test(data.postalCode),
  { message: 'Deutsche PLZ muss 5 Ziffern haben', path: ['postalCode'] },
).superRefine((data, ctx) => {
  // Seller-specific required fields (BR-DE-2, PEPPOL-R020)
  if (data.type === 'seller') {
    if (!data.contactName || data.contactName.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Ansprechpartner ist Pflichtfeld für Verkäufer (BR-DE-2)',
        path: ['contactName'],
      });
    }
    if (!data.contactPhone || data.contactPhone.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Telefon ist Pflichtfeld für Verkäufer (BR-DE-2)',
        path: ['contactPhone'],
      });
    }
    if (!data.contactEmail || data.contactEmail.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'E-Mail ist Pflichtfeld für Verkäufer (PEPPOL-R020)',
        path: ['contactEmail'],
      });
    } else if (!validator.isEmail(data.contactEmail)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Ungültige E-Mail-Adresse',
        path: ['contactEmail'],
      });
    }
  }

  // Buyer-specific required fields (PEPPOL-R010)
  if (data.type === 'buyer') {
    if (!data.email || data.email.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'E-Mail ist Pflichtfeld für Käufer (PEPPOL-R010)',
        path: ['email'],
      });
    } else if (!validator.isEmail(data.email)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Ungültige E-Mail-Adresse',
        path: ['email'],
      });
    }
  }
});

export type PartyInput = z.infer<typeof partySchema>;
