// POST /api/rechnungen/[id]/send
// Erzeugt die Rechnung als PDF und verschickt sie per E-Mail (Resend) an den Kunden.
// Aktualisiert invoices.sent_at / invoices.sent_to bei Erfolg.

import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { renderInvoicePdf } from '@/lib/pdf/invoiceReactPdf';
import { istEmail, versandProtokollieren } from '@/lib/mail/versand';
import { anrede } from '@/lib/mail/anrede';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Auth-Check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 });

  const admin = createAdminClient();

  // Membership-Check (welcher Client gehört zum eingeloggten User)
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

  let body: { to?: string; message?: string } = {};
  try {
    body = await req.json();
  } catch {
    // kein Body mitgeschickt – ok, wir nutzen die Kunden-E-Mail
  }

  // Rechnung + Kunde + Branding + eigene Firmendaten laden
  const [{ data: invoice }, { data: branding }, { data: clientData }] = await Promise.all([
    admin.from('invoices')
      .select(`*, customers(*)`)
      .eq('id', id)
      .eq('client_id', membership.client_id)
      .maybeSingle(),
    admin.from('client_branding').select('*')
      .eq('client_id', membership.client_id).maybeSingle(),
    admin.from('clients').select('company_name, uid_number')
      .eq('id', membership.client_id).maybeSingle(),
  ]);

  if (!invoice) {
    return NextResponse.json({ error: 'Rechnung nicht gefunden' }, { status: 404 });
  }

  // Ein Entwurf hat noch keine Rechnungsnummer. Ohne die ist die
  // Rechnung nach § 11 Abs. 1 Z 2 UStG unvollständig – und beim
  // Empfänger nicht vorsteuerabzugsfähig.
  if (invoice.status === 'draft' || !invoice.invoice_number) {
    return NextResponse.json({
      error: 'Diese Rechnung ist noch ein Entwurf und hat keine Rechnungsnummer. Bitte zuerst finalisieren.',
    }, { status: 400 });
  }
  if (invoice.status === 'cancelled') {
    return NextResponse.json({ error: 'Diese Rechnung ist storniert und kann nicht versendet werden.' }, { status: 400 });
  }

  const customer = invoice.customers as {
    name: string; contact_person: string | null;
    street: string | null; zip: string | null; city: string | null;
    country: string; uid_number: string | null; email: string | null;
  } | null;

  const recipient = body.to?.trim() || customer?.email?.trim() || '';
  if (!recipient) {
    return NextResponse.json({ error: 'Keine Empfänger-E-Mail-Adresse vorhanden. Bitte beim Kunden hinterlegen oder manuell eingeben.' }, { status: 400 });
  }
  if (!istEmail(recipient)) {
    return NextResponse.json({ error: `"${recipient}" ist keine gültige E-Mail-Adresse.` }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !fromAddress) {
    return NextResponse.json({
      error: 'E-Mail-Versand ist noch nicht konfiguriert (RESEND_API_KEY / RESEND_FROM_EMAIL fehlt in den Umgebungsvariablen).',
    }, { status: 500 });
  }

  // Zusatzanhänge (Leistungs-/Zeitnachweise) der Rechnung laden.
  // Geladen wird mit dem Service-Role-Schlüssel – deshalb gilt dieselbe
  // Pfadprüfung wie bei der Belegerkennung: nur aus dem Ordner des
  // eigenen Mandanten, sonst wird der Anhang übersprungen.
  const { data: anhangZeilen } = await admin
    .from('invoice_attachments')
    .select('file_name, storage_path, file_size')
    .eq('invoice_id', id)
    .eq('client_id', membership.client_id)
    .order('created_at', { ascending: true });

  const gesamtGroesse = (anhangZeilen ?? []).reduce((s, a) => s + (Number(a.file_size) || 0), 0);
  if (gesamtGroesse > 25 * 1024 * 1024) {
    return NextResponse.json({
      error: 'Die Anhänge sind zusammen größer als 25 MB – das übersteigt das E-Mail-Limit. Bitte einzelne Anhänge entfernen.',
    }, { status: 400 });
  }

  const erlaubt = await versandProtokollieren(admin, {
    clientId: membership.client_id,
    userId: user.id,
    zweck: 'rechnung',
    empfaenger: recipient,
  });
  if (!erlaubt.ok) {
    return NextResponse.json({ error: erlaubt.fehler }, { status: 429 });
  }

  try {
    const pdfBuffer = await renderInvoicePdf({
      invoice: {
        invoice_number: invoice.invoice_number,
        invoice_date: invoice.invoice_date,
        due_date: invoice.due_date,
        total_net: invoice.total_net,
        total_vat: invoice.total_vat,
        total_gross: invoice.total_gross,
        notes: invoice.notes,
        footer_override: invoice.footer_override,
        items: invoice.items ?? [],
      },
      customer,
      branding: branding ?? null,
      senderCompanyName: clientData?.company_name ?? '',
      senderUid: clientData?.uid_number ?? null,
    });

    const mailAnhaenge: { filename: string; content: Buffer }[] = [
      {
        filename: `Rechnung-${invoice.invoice_number || id}.pdf`,
        content: pdfBuffer,
      },
    ];
    for (const a of anhangZeilen ?? []) {
      const pfad = String(a.storage_path ?? '');
      if (!pfad.startsWith(`${membership.client_id}/`) || pfad.includes('..')) {
        console.error('[Rechnungsversand] Anhang außerhalb des Mandantenordners übersprungen:', pfad);
        continue;
      }
      const { data: datei, error: dlErr } = await admin.storage.from('belege').download(pfad);
      if (dlErr || !datei) {
        // Lieber abbrechen als eine Rechnung ohne den zugesagten
        // Nachweis zu verschicken.
        return NextResponse.json({
          error: `Anhang "${a.file_name}" konnte nicht geladen werden (${dlErr?.message ?? 'nicht gefunden'}). Bitte den Anhang entfernen oder neu hochladen.`,
        }, { status: 500 });
      }
      mailAnhaenge.push({
        filename: a.file_name,
        content: Buffer.from(await datei.arrayBuffer()),
      });
    }

    const resend = new Resend(apiKey);
    const senderName = clientData?.company_name || 'Ihre Buchhaltung';
    // Angesprochen wird der Kontakt ("z.H." der Rechnung, sonst der
    // aus dem Kundenstamm) – nicht die Firmenbezeichnung.
    const gruss = anrede(invoice.contact_person || customer?.contact_person);

    const { error: sendErr } = await resend.emails.send({
      from: fromAddress,
      to: recipient,
      subject: `Rechnung ${invoice.invoice_number || ''} von ${senderName}`.trim(),
      text: [
        gruss,
        '',
        body.message?.trim() || `anbei erhalten Sie die Rechnung ${invoice.invoice_number || ''}.`,
        '',
        `Freundliche Grüße`,
        senderName,
      ].join('\n'),
      attachments: mailAnhaenge,
    });

    if (sendErr) {
      return NextResponse.json({ error: sendErr.message }, { status: 502 });
    }

    const sentAt = new Date().toISOString();
    const { error: sentErr } = await admin.from('invoices').update({ sent_at: sentAt, sent_to: recipient }).eq('id', id);
    if (sentErr) {
      // Die Mail ist raus – der Vermerk fehlt. Ohne Log versendet
      // der Nutzer die Rechnung womöglich ein zweites Mal.
      console.error('[Rechnungsversand] sent_at konnte nicht gesetzt werden', sentErr);
    }

    return NextResponse.json({ ok: true, sentAt, sentTo: recipient });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler beim Versand';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
