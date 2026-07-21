-- Keep marketplace listing creation aligned with the app-wide currency picker.
-- The original marketplace constraint only allowed the first small currency set,
-- while the app now exposes the full CURRENCIES list from lib/currency.ts.

alter table public.marketplace_listings
  drop constraint if exists marketplace_listings_currency_check;

alter table public.marketplace_listings
  add constraint marketplace_listings_currency_check
  check (
    currency in (
      'USD', 'INR', 'EUR', 'GBP', 'AED', 'AUD', 'CAD', 'SGD',
      'JPY', 'CNY', 'HKD', 'NZD', 'CHF', 'SEK', 'NOK', 'DKK',
      'ZAR', 'BRL', 'MXN', 'KRW', 'THB', 'MYR', 'IDR', 'PHP',
      'VND', 'TRY', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR', 'ILS',
      'EGP', 'PLN', 'CZK', 'HUF', 'RON', 'RUB', 'NGN', 'KES',
      'GHS', 'PKR', 'BDT', 'LKR', 'NPR', 'TWD', 'ARS', 'CLP',
      'COP', 'PEN', 'UYU', 'MAD', 'DZD', 'TND', 'UAH', 'BGN',
      'RSD', 'ISK', 'KZT', 'GEL', 'JOD', 'MUR', 'MOP', 'CRC'
    )
  );
