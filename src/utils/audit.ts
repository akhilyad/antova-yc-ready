import { EquipmentOption } from '../constants';

export interface AuditRequestData {
  email: string;
  company: string;
  equipment: EquipmentOption;
  plan: string;
}

export function formatEuro(amount: number): string {
  return '€' + amount.toLocaleString('en-US');
}

export function validateWorkEmail(email: string): {
  valid: boolean;
  error?: string;
} {
  const trimmed = email.trim();
  if (!trimmed) {
    return { valid: false, error: 'Enter your work email.' };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return { valid: false, error: 'Enter a valid email address.' };
  }
  return { valid: true };
}

/**
 * Sends the intake form to a Formspree-compatible endpoint (JSON POST).
 * Throws if no endpoint is configured or the request fails, so the UI can
 * show an error instead of silently dropping the request.
 */
export async function submitAuditRequest(
  data: AuditRequestData,
  endpoint: string | undefined
): Promise<void> {
  if (!endpoint) {
    throw new Error('Intake endpoint is not configured.');
  }
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      _subject: `Antova tender request: ${data.plan}`,
      email: data.email,
      company: data.company,
      equipment: data.equipment,
      plan: data.plan,
    }),
  });
  if (!response.ok) {
    throw new Error(`Intake request failed with status ${response.status}.`);
  }
}
