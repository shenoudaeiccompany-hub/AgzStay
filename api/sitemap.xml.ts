import type { IncomingMessage, ServerResponse } from 'node:http';

interface VercelResponse extends ServerResponse {
  status(code: number): VercelResponse;
  setHeader(name: string, value: string): this;
  send(body: string): void;
}

interface SitemapRow {
  id: string;
  updated_at?: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export default async function handler(req: IncomingMessage, res: VercelResponse): Promise<void> {
  const proto = String(req.headers['x-forwarded-proto'] ?? 'https');
  const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? 'agzstay.com');
  const origin = `${proto}://${host}`;

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

  let chaletRows: SitemapRow[] = [];

  if (supabaseUrl && supabaseKey) {
    try {
      const apiUrl = `${supabaseUrl}/rest/v1/chalets?availability_status=eq.active&select=id,updated_at&order=updated_at.desc&limit=500`;
      const response = await fetch(apiUrl, {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          Accept: 'application/json',
        },
      });
      if (response.ok) {
        const rows = (await response.json()) as SitemapRow[];
        if (Array.isArray(rows)) {
          chaletRows = rows;
        }
      }
    } catch {
      // Fallback to root-only sitemap
    }
  }

  const urlsXml = [
    `<url><loc>${escapeXml(`${origin}/`)}</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
    ...chaletRows.map((row) => {
      const loc = `${origin}/chalet/${encodeURIComponent(row.id)}`;
      const lastmod = row.updated_at
        ? `<lastmod>${escapeXml(row.updated_at.slice(0, 10))}</lastmod>`
        : '';
      return `<url><loc>${escapeXml(loc)}</loc>${lastmod}<changefreq>daily</changefreq><priority>0.8</priority></url>`;
    }),
  ].join('\n  ');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${urlsXml}
</urlset>`;

  res.status(200);
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1200');
  res.send(xml);
}
