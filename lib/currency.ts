export interface CurrencyMeta<Code extends string = string> {
  code: Code;
  symbol: string;
  label: string;
  flag: string;
}

const POPULAR_CURRENCIES = [
  { code: 'USD', symbol: '$', label: 'US Dollar', flag: '🇺🇸' },
  { code: 'INR', symbol: '₹', label: 'Indian Rupee', flag: '🇮🇳' },
  { code: 'EUR', symbol: '€', label: 'Euro', flag: '🇪🇺' },
  { code: 'GBP', symbol: '£', label: 'British Pound', flag: '🇬🇧' },
  { code: 'AED', symbol: 'د.إ', label: 'UAE Dirham', flag: '🇦🇪' },
  { code: 'AUD', symbol: 'A$', label: 'Australian Dollar', flag: '🇦🇺' },
  { code: 'CAD', symbol: 'CA$', label: 'Canadian Dollar', flag: '🇨🇦' },
  { code: 'SGD', symbol: 'S$', label: 'Singapore Dollar', flag: '🇸🇬' },
  { code: 'JPY', symbol: '¥', label: 'Japanese Yen', flag: '🇯🇵' },
  { code: 'CNY', symbol: '¥', label: 'Chinese Yuan', flag: '🇨🇳' },
  { code: 'HKD', symbol: 'HK$', label: 'Hong Kong Dollar', flag: '🇭🇰' },
  { code: 'NZD', symbol: 'NZ$', label: 'New Zealand Dollar', flag: '🇳🇿' },
  { code: 'CHF', symbol: 'CHF', label: 'Swiss Franc', flag: '🇨🇭' },
  { code: 'SEK', symbol: 'kr', label: 'Swedish Krona', flag: '🇸🇪' },
  { code: 'NOK', symbol: 'kr', label: 'Norwegian Krone', flag: '🇳🇴' },
  { code: 'DKK', symbol: 'kr', label: 'Danish Krone', flag: '🇩🇰' },
  { code: 'ZAR', symbol: 'R', label: 'South African Rand', flag: '🇿🇦' },
  { code: 'BRL', symbol: 'R$', label: 'Brazilian Real', flag: '🇧🇷' },
  { code: 'MXN', symbol: 'MX$', label: 'Mexican Peso', flag: '🇲🇽' },
  { code: 'KRW', symbol: '₩', label: 'South Korean Won', flag: '🇰🇷' },
  { code: 'THB', symbol: '฿', label: 'Thai Baht', flag: '🇹🇭' },
  { code: 'MYR', symbol: 'RM', label: 'Malaysian Ringgit', flag: '🇲🇾' },
  { code: 'IDR', symbol: 'Rp', label: 'Indonesian Rupiah', flag: '🇮🇩' },
  { code: 'PHP', symbol: '₱', label: 'Philippine Peso', flag: '🇵🇭' },
  { code: 'VND', symbol: '₫', label: 'Vietnamese Dong', flag: '🇻🇳' },
  { code: 'TRY', symbol: '₺', label: 'Turkish Lira', flag: '🇹🇷' },
  { code: 'SAR', symbol: 'ر.س', label: 'Saudi Riyal', flag: '🇸🇦' },
  { code: 'QAR', symbol: 'ر.ق', label: 'Qatari Riyal', flag: '🇶🇦' },
  { code: 'KWD', symbol: 'د.ك', label: 'Kuwaiti Dinar', flag: '🇰🇼' },
  { code: 'BHD', symbol: 'BD', label: 'Bahraini Dinar', flag: '🇧🇭' },
  { code: 'OMR', symbol: 'ر.ع.', label: 'Omani Rial', flag: '🇴🇲' },
  { code: 'ILS', symbol: '₪', label: 'Israeli Shekel', flag: '🇮🇱' },
  { code: 'EGP', symbol: 'E£', label: 'Egyptian Pound', flag: '🇪🇬' },
  { code: 'PLN', symbol: 'zł', label: 'Polish Zloty', flag: '🇵🇱' },
  { code: 'CZK', symbol: 'Kč', label: 'Czech Koruna', flag: '🇨🇿' },
  { code: 'HUF', symbol: 'Ft', label: 'Hungarian Forint', flag: '🇭🇺' },
  { code: 'RON', symbol: 'lei', label: 'Romanian Leu', flag: '🇷🇴' },
  { code: 'RUB', symbol: '₽', label: 'Russian Ruble', flag: '🇷🇺' },
  { code: 'NGN', symbol: '₦', label: 'Nigerian Naira', flag: '🇳🇬' },
  { code: 'KES', symbol: 'KSh', label: 'Kenyan Shilling', flag: '🇰🇪' },
  { code: 'GHS', symbol: 'GH₵', label: 'Ghanaian Cedi', flag: '🇬🇭' },
  { code: 'PKR', symbol: '₨', label: 'Pakistani Rupee', flag: '🇵🇰' },
  { code: 'BDT', symbol: '৳', label: 'Bangladeshi Taka', flag: '🇧🇩' },
  { code: 'LKR', symbol: 'Rs', label: 'Sri Lankan Rupee', flag: '🇱🇰' },
  { code: 'NPR', symbol: 'Rs', label: 'Nepalese Rupee', flag: '🇳🇵' },
  { code: 'TWD', symbol: 'NT$', label: 'New Taiwan Dollar', flag: '🇹🇼' },
  { code: 'ARS', symbol: 'AR$', label: 'Argentine Peso', flag: '🇦🇷' },
  { code: 'CLP', symbol: 'CL$', label: 'Chilean Peso', flag: '🇨🇱' },
  { code: 'COP', symbol: 'COL$', label: 'Colombian Peso', flag: '🇨🇴' },
  { code: 'PEN', symbol: 'S/', label: 'Peruvian Sol', flag: '🇵🇪' },
  { code: 'UYU', symbol: '$U', label: 'Uruguayan Peso', flag: '🇺🇾' },
  { code: 'MAD', symbol: 'DH', label: 'Moroccan Dirham', flag: '🇲🇦' },
  { code: 'DZD', symbol: 'DA', label: 'Algerian Dinar', flag: '🇩🇿' },
  { code: 'TND', symbol: 'DT', label: 'Tunisian Dinar', flag: '🇹🇳' },
  { code: 'UAH', symbol: '₴', label: 'Ukrainian Hryvnia', flag: '🇺🇦' },
  { code: 'BGN', symbol: 'лв', label: 'Bulgarian Lev', flag: '🇧🇬' },
  { code: 'RSD', symbol: 'дин', label: 'Serbian Dinar', flag: '🇷🇸' },
  { code: 'ISK', symbol: 'kr', label: 'Icelandic Krona', flag: '🇮🇸' },
  { code: 'KZT', symbol: '₸', label: 'Kazakhstani Tenge', flag: '🇰🇿' },
  { code: 'GEL', symbol: '₾', label: 'Georgian Lari', flag: '🇬🇪' },
  { code: 'JOD', symbol: 'JD', label: 'Jordanian Dinar', flag: '🇯🇴' },
  { code: 'MUR', symbol: 'Rs', label: 'Mauritian Rupee', flag: '🇲🇺' },
  { code: 'MOP', symbol: 'MOP$', label: 'Macanese Pataca', flag: '🇲🇴' },
  { code: 'CRC', symbol: '₡', label: 'Costa Rican Colon', flag: '🇨🇷' },
] as const satisfies readonly CurrencyMeta[];

export type CurrencyCode = typeof POPULAR_CURRENCIES[number]['code'];

export const CURRENCIES: CurrencyMeta<CurrencyCode>[] = [...POPULAR_CURRENCIES];

export const CURRENCY_MAP = new Map<CurrencyCode, CurrencyMeta<CurrencyCode>>(
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
