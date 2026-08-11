// POST /api/app-einladung
// Verschickt eine E-Mail mit dem Installations-Link zur KPS Smart Buchhaltung
// PWA + Kurzanleitung für iOS/Android/iPad. Nutzt denselben Resend-Versand
// wie /api/rechnungen/[id]/send.

import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 });

  const admin = createAdminClient();

  const { data: membership } = await admin
    .from('client_memberships')
    .select('client_id')
    .eq('user_id', user.id)
    .order('created_at')
    .limit(1)
    .maybeSingle();

  if (!membership?.client_id) {
    return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  }

  let body: { to?: string } = {};
  try {
    body = await req.json();
  } catch {
    // kein Body
  }

  const recipient = body.to?.trim() || '';
  if (!recipient || !isValidEmail(recipient)) {
    return NextResponse.json({ error: 'Bitte eine gültige E-Mail-Adresse angeben.' }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !fromAddress) {
    return NextResponse.json({
      error: 'E-Mail-Versand ist noch nicht konfiguriert (RESEND_API_KEY / RESEND_FROM_EMAIL fehlt in den Umgebungsvariablen).',
    }, { status: 500 });
  }

  // Herkunft aus dem tatsächlichen Request ableiten statt eine Domain zu raten –
  // funktioniert dadurch automatisch korrekt, egal ob Vercel-Standarddomain,
  // eigene Domain oder Preview-Deployment (behebt Vercel "DEPLOYMENT_NOT_FOUND").
  const appUrl = req.nextUrl.origin;
  const belegeUrl = `${appUrl}/belege`;

  const { data: clientData } = await admin
    .from('clients')
    .select('company_name')
    .eq('id', membership.client_id)
    .maybeSingle();
  const senderName = clientData?.company_name || 'KPS Smart Buchhaltung';

  try {
    const resend = new Resend(apiKey);

    const { error: sendErr } = await resend.emails.send({
      from: fromAddress,
      to: recipient,
      subject: 'KPS Smart Buchhaltung – App auf dem Smartphone installieren',
      text: [
        `Hallo,`,
        ``,
        `hier ist der Link zu KPS Smart Buchhaltung, den du auf deinem Smartphone oder Tablet als App installieren kannst – ideal, um Belege direkt unterwegs zu fotografieren:`,
        ``,
        belegeUrl,
        ``,
        `So installierst du die App:`,
        ``,
        `iPhone/iPad (Safari):`,
        `1. Link oben öffnen`,
        `2. Teilen-Symbol antippen (Quadrat mit Pfeil nach oben)`,
        `3. "Zum Home-Bildschirm" auswählen`,
        ``,
        `Android (Chrome):`,
        `1. Link oben öffnen`,
        `2. Menü (drei Punkte) antippen`,
        `3. "App installieren" bzw. "Zum Startbildschirm hinzufügen" auswählen`,
        ``,
        `Danach erscheint ein eigenes App-Symbol auf dem Homescreen – kein App-Store nötig.`,
        ``,
        `Freundliche Grüße`,
        senderName,
      ].join('\n'),
      html: [
        `<p>Hallo,</p>`,
        `<p>hier ist der Link zu <strong>KPS Smart Buchhaltung</strong>, den du auf deinem Smartphone oder Tablet als App installieren kannst – ideal, um Belege direkt unterwegs zu fotografieren:</p>`,
        `<p><a href="${belegeUrl}">${belegeUrl}</a></p>`,
        `<p><strong>iPhone/iPad (Safari):</strong><br>1. Link oben öffnen<br>2. Teilen-Symbol antippen (Quadrat mit Pfeil nach oben)<br>3. „Zum Home-Bildschirm" auswählen</p>`,
        `<p><strong>Android (Chrome):</strong><br>1. Link oben öffnen<br>2. Menü (drei Punkte) antippen<br>3. „App installieren" bzw. „Zum Startbildschirm hinzufügen" auswählen</p>`,
        `<p>Danach erscheint ein eigenes App-Symbol auf dem Homescreen – kein App-Store nötig.</p>`,
        `<p>Freundliche Grüße<br>${senderName}</p>`,
      ].join(''),
    });

    if (sendErr) {
      return NextResponse.json({ error: sendErr.message }, { status: 502 });
    }

    return NextResponse.json({ ok: true, sentTo: recipient });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler beim Versand';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
