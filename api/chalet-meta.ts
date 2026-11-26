import type { IncomingMessage, ServerResponse } from 'node:http';

interface VercelRequest extends IncomingMessage {
  query?: Record<string, string | string[] | undefined>;
}

interface VercelResponse extends ServerResponse {
  status(code: number): VercelResponse;
  setHeader(name: string, value: string): this;
  send(body: string): void;
}

interface ChaletMetaRow {
  id: string;
  title?: string;
  governorate?: string | null;
  city?: string | null;
  area_or_village?: string | null;
  property_type?: string | null;
  description?: string;
  price_per_night?: number;
  bedrooms?: number;
  max_guests?: number;
  images?: string[] | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function getQueryId(req: VercelRequest): string {
  const fromQuery = req.query?.id;
  if (typeof fromQuery === 'string' && fromQuery.trim()) {
    return fromQuery.trim();
  }
  if (Array.isArray(fromQuery) && fromQuery[0]) {
    return fromQuery[0].trim();
  }
  try {
    const parsed = new URL(req.url ?? '/', 'https://agzstay.com');
    const qId = parsed.searchParams.get('id');
    if (qId) return qId.trim();
    const match = parsed.pathname.match(/\/(?:unit|chalet)\/([^/]+)/);
    return match?.[1] ?? '';
  } catch {
    return '';
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const proto = String(req.headers['x-forwarded-proto'] ?? 'https');
  const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? 'agzstay.com');
  const origin = `${proto}://${host}`;
  const chaletId = getQueryId(req);

  const supabaseUrl = (
    process.env.VITE_SUPABASE_URL ||
    process.env.VITE_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ''
  ).replace(/\/+$/, '');
  const supabaseKey =
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.VITE_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    '';

  let chalet: ChaletMetaRow | null = null;

  if (supabaseUrl && supabaseKey && chaletId) {
    try {
      const apiUrl = `${supabaseUrl}/rest/v1/chalets?id=eq.${encodeURIComponent(
        chaletId
      )}&availability_status=eq.active&select=id,title,governorate,city,area_or_village,property_type,description,price_per_night,bedrooms,max_guests,images&limit=1`;
      const response = await fetch(apiUrl, {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          Accept: 'application/json',
        },
      });
      if (response.ok) {
        const rows = (await response.json()) as ChaletMetaRow[];
        if (Array.isArray(rows) && rows[0]) {
          chalet = rows[0];
        }
      }
    } catch {
      // Fallback to default platform metadata below
    }
  }

  const canonicalUrl = chaletId
    ? `${origin}/chalet/${encodeURIComponent(chaletId)}`
    : `${origin}/`;

  const locationLabel = [chalet?.governorate, chalet?.city, chalet?.area_or_village]
    .filter(Boolean)
    .join(' - ');

  const title = chalet?.title
    ? `${chalet.title} | ${locationLabel || 'AgzStay'} — AgzStay`
    : 'AgzStay - إجازة ستاي | شاليهات، شقق مفروشة، وشقق فاضية للإيجار في مصر';

  const isMonthly = chalet?.property_type === 'شقة فاضية';
  const priceText =
    typeof chalet?.price_per_night === 'number'
      ? `السعر يبدأ من ${chalet.price_per_night.toLocaleString('ar-EG')} ج.م${isMonthly ? '/شهر' : '/ليلة'} • `
      : '';

  const description = chalet
    ? `${priceText}${locationLabel} — ${(chalet.description ?? '').slice(0, 140)}`
    : 'منصة AgzStay - إجازة ستاي للإيجار اليومي والأسبوعي والشهري للشاليهات والشقق المفروشة والفاضية والفيلات في ٢٧ محافظة مصرية.';

  const imageUrl =
    chalet?.images && chalet.images[0] ? chalet.images[0] : `${origin}/icon-512.png`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Accommodation',
    name: chalet?.title ?? 'وحدة إيجار على AgzStay',
    description,
    url: canonicalUrl,
    image: imageUrl,
    numberOfBedrooms: chalet?.bedrooms ?? undefined,
    occupancy: chalet?.max_guests
      ? {
          '@type': 'QuantitativeValue',
          maxValue: chalet.max_guests,
        }
      : undefined,
    address: locationLabel
      ? {
          '@type': 'PostalAddress',
          addressLocality: chalet?.area_or_village || chalet?.city || chalet?.governorate || '',
          addressRegion: chalet?.governorate || '',
          addressCountry: 'EG',
        }
      : undefined,
  };

  const html = `<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="ar_EG" />
    <meta property="og:site_name" content="AgzStay - إجازة ستاي" />
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${escapeHtml(imageUrl)}" />
    <meta property="og:image:alt" content="${escapeHtml(title)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
    <script type="application/ld+json">${safeJsonLd(jsonLd)}</script>
  </head>
  <body>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(description)}</p>
    <a href="${escapeHtml(canonicalUrl)}">عرض الوحدة على AgzStay</a>
  </body>
</html>`;

  res.status(200);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  res.send(html);
}
