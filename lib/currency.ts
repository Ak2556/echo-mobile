export type CurrencyCode = 'INR' | 'USD' | 'EUR' | 'GBP' | 'AED' | 'SGD' | 'CAD' | 'AUD';

export interface CurrencyMeta {
  code: CurrencyCode;
  symbol: string;
  label: string;
  flag: string;
}

export const CURRENCIES: CurrencyMeta[] = [
  { code: 'INR', symbol: '₹',   label: 'Indian Rupee',       flag: '🇮🇳' },
  { code: 'USD', symbol: '$',    label: 'US Dollar',          flag: '🇺🇸' },
  { code: 'EUR', symbol: '€',    label: 'Euro',               flag: '🇪🇺' },
  { code: 'GBP', symbol: '£',    label: 'British Pound',      flag: '🇬🇧' },
  { code: 'AED', symbol: 'د.إ', label: 'UAE Dirham',         flag: '🇦🇪' },
  { code: 'SGD', symbol: 'S$',   label: 'Singapore Dollar',   flag: '🇸🇬' },
  { code: 'CAD', symbol: 'CA$',  label: 'Canadian Dollar',    flag: '🇨🇦' },
  { code: 'AUD', symbol: 'A$',   label: 'Australian Dollar',  flag: '🇦🇺' },
];

export const CURRENCY_MAP = new Map<CurrencyCode, CurrencyMeta>(
  CURRENCIES.map(c => [c.code, c])
);

export function formatPrice(amount: number, currency: CurrencyCode): string {
  const sym = CURRENCY_MAP.get(currency)?.symbol ?? currency;
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';
  try {
    const formatted = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
    return `${sym}${formatted}`;
  } catch {
    return `${sym}${amount}`;
  }
}

export function getCurrencySymbol(currency: CurrencyCode): string {
  return CURRENCY_MAP.get(currency)?.symbol ?? currency;
}
