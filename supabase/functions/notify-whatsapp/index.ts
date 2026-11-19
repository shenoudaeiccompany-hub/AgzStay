// Supabase Edge Function Stub: WhatsApp Booking & Notification Dispatcher
// NOTE: This stub is READY TO DEPLOY but NOT ACTIVATED by default.
//
// ============================================================================
// تعليمات التفعيل لاحقاً (Setup Instructions - Arabic & English):
// 1. اضبط المفاتيح السرية في Supabase Dashboard -> Edge Functions -> Secrets:
//    supabase secrets set WHATSAPP_PROVIDER="meta" \
//      WHATSAPP_ACCESS_TOKEN="EAAG..." \
//      WHATSAPP_PHONE_NUMBER_ID="1234567890" \
//      WEBHOOK_SECRET="your-random-webhook-secret"
//
//    (أو باستخدام Twilio WhatsApp):
//    supabase secrets set WHATSAPP_PROVIDER="twilio" \
//      TWILIO_ACCOUNT_SID="AC..." \
//      TWILIO_AUTH_TOKEN="..." \
//      TWILIO_WHATSAPP_FROM="whatsapp:+14155238886" \
//      WEBHOOK_SECRET="your-random-webhook-secret"
//
// 2. انشر الدالة عبر Supabase CLI:
//    supabase functions deploy notify-whatsapp --no-verify-jwt
//
// 3. فعّل Database Webhook في Supabase Dashboard -> Database -> Webhooks:
//    - Table: public.notifications (Event: INSERT)
//    - URL: https://<PROJECT_REF>.supabase.co/functions/v1/notify-whatsapp
//    - Header: x-webhook-secret: <WEBHOOK_SECRET>
// ============================================================================

interface NotificationWebhookPayload {
  type: 'INSERT' | 'UPDATE';
  table: string;
  record: {
    id: string;
    user_id: string;
    booking_id?: string | null;
    type: string;
    title: string;
    body: string;
    created_at: string;
  };
  recipient_phone?: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
  'Content-Type': 'application/json',
};

interface DenoRuntimeShape {
  env?: {
    get(key: string): string | undefined;
  };
  serve?: (handler: (req: Request) => Promise<Response> | Response) => void;
}

const denoRuntime = (globalThis as unknown as { Deno?: DenoRuntimeShape }).Deno;
const denoEnv = denoRuntime?.env;
const denoServe = denoRuntime?.serve;

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: CORS_HEADERS,
    });
  }

  const configuredSecret = denoEnv?.get('WEBHOOK_SECRET');
  const incomingSecret = req.headers.get('x-webhook-secret');
  if (configuredSecret && incomingSecret !== configuredSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized webhook secret' }), {
      status: 401,
      headers: CORS_HEADERS,
    });
  }

  let payload: NotificationWebhookPayload;
  try {
    payload = (await req.json()) as NotificationWebhookPayload;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), {
      status: 400,
      headers: CORS_HEADERS,
    });
  }

  const provider = denoEnv?.get('WHATSAPP_PROVIDER') ?? 'stub';
  const accessToken = denoEnv?.get('WHATSAPP_ACCESS_TOKEN');
  const phoneNumberId = denoEnv?.get('WHATSAPP_PHONE_NUMBER_ID');

  // If secrets are not provisioned yet, safely log and acknowledge without failing DB webhook.
  if (provider === 'stub' || !accessToken || !phoneNumberId || !payload.recipient_phone) {
    return new Response(
      JSON.stringify({
        ok: true,
        mode: 'stub_inactive',
        message: 'WhatsApp dispatcher is in stub mode until provider secrets are configured.',
        notificationId: payload.record?.id ?? null,
        notificationType: payload.record?.type ?? null,
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  }

  // Ready-to-use Meta WhatsApp Cloud API call
  if (provider === 'meta') {
    const cleanPhone = payload.recipient_phone.replace(/[^\d]/g, '');
    const e164Egypt = cleanPhone.startsWith('0') ? `2${cleanPhone}` : cleanPhone;

    const metaRes = await fetch(
      `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: e164Egypt,
          type: 'text',
          text: {
            body: `*AgzStay - إجازة ستاي*\n${payload.record.title}\n${payload.record.body}`,
          },
        }),
      }
    );

    const metaJson = await metaRes.json();
    return new Response(
      JSON.stringify({ ok: metaRes.ok, provider: 'meta', result: metaJson }),
      { status: metaRes.ok ? 200 : 502, headers: CORS_HEADERS }
    );
  }

  return new Response(
    JSON.stringify({ ok: true, mode: 'unsupported_provider_stub', provider }),
    { status: 200, headers: CORS_HEADERS }
  );
}

if (typeof denoServe === 'function') {
  denoServe(handleRequest);
}

export { handleRequest };
