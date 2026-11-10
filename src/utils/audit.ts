import { DeviationItem, EquipmentOption, VendorBid } from '../constants';

export type PriceMode = 'sticker' | 'true' | 'pushback';
export type ChartMode = PriceMode;

export const MAX_AXIS_EUR = 500000;

export interface AuditRequestData {
  email: string;
  company: string;
  equipment: EquipmentOption;
}

export function getVendorActiveDeviations(
  vendor: VendorBid,
  mode: PriceMode
): DeviationItem[] {
  if (mode === 'true') {
    return vendor.trueDeviations;
  }
  if (mode === 'pushback') {
    return vendor.pushbackDeviations;
  }
  return [];
}

export const getActiveDeviations = getVendorActiveDeviations;

export function getVendorPenaltyTotal(
  vendor: VendorBid,
  mode: PriceMode = 'true'
): number {
  const deviations = getVendorActiveDeviations(vendor, mode);
  return deviations.reduce((sum, item) => sum + item.penalty, 0);
}

export function getVendorDisplayPrice(
  vendor: VendorBid,
  mode: PriceMode
): number {
  if (mode === 'sticker') {
    return vendor.stickerPrice;
  }
  return vendor.stickerPrice + getVendorPenaltyTotal(vendor, mode);
}

export const computeVendorTotal = getVendorDisplayPrice;

export function sortVendorsByMode(
  vendors: VendorBid[],
  mode: PriceMode
): VendorBid[] {
  return [...vendors].sort((a, b) => {
    const priceA = getVendorDisplayPrice(a, mode);
    const priceB = getVendorDisplayPrice(b, mode);
    return priceA - priceB;
  });
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

export function submitAuditRequest(data: AuditRequestData): void {
  console.log('Antova Shadow Audit Request:', data);
}
