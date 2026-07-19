// POST /api/ocr/process
// Lädt einen Beleg aus Supabase Storage, schickt ihn an Claude Vision,
// speichert das Ergebnis als ocr_data in der receipts-Tabelle.

import { NextRequest, NextResponse } from 'next/server';
import Anthropic                      from '@anthropic-ai/sdk';
import { createClient }               from '@/lib/supabase/server';
import { createAdminClient }          from '@/lib/supabase/admin';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const OCR_PROMPT = `Du bist ein Buchhalter-Assistent. Analysiere diesen österreichischen Beleg (Rechnung, Kassenbon oder Quittung) und extrahiere folgende Felder als JSON.

Antworte NUR mit validem JSON, kein erklärender Text davor oder danach.

Format:
{
  "datum": "YYYY-MM-DD",
  "betrag_brutto": 0.00,
  "mwst_satz": 20,
  "mwst_betrag": 0.00,
  "betrag_netto": 0.00,
  "beschreibung": "Kurze Beschreibung max. 80 Zeichen",
  "lieferant": "Name des Ausstellers/Lieferanten",
  "typ": "ausgabe"
}

Regeln:
- datum: Belegdatum im Format YYYY-MM-DD; falls kein Datum sichtbar, verwende null
- betrag_brutto: Gesamtbetrag inkl. MwSt als Dezimalzahl; Einnahmen und Ausgaben immer positiv
- mwst_satz: Österreichischer MwSt-Satz (0, 10, 13 oder 20); falls mehrere Sätze, den dominanten verwenden
- mwst_betrag: MwSt-Betrag als Dezimalzahl
- betrag_netto: Nettobetrag = betrag_brutto − mwst_betrag
- beschreibung: Kurze sachliche Beschreibung des Beleginhalts
- lieferant: Name des Unternehmens / Ausstellers
- typ: "ausgabe" wenn Kostenbeleg, "einnahme" wenn Einnahmenbeleg (z.B. eigene Ausgangsrechnung)`;

export async function POST(req: NextRequest) {
  // Auth-Check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 });

  const { receiptId } = await req.json();
  if (!receiptId) return NextResponse.json({ error: 'receiptId fehlt' }, { status: 400 });

  const admin = createAdminClient();

  // Beleg laden + Zugriff prüfen
  const { data: receipt, error: fetchErr } = await admin
    .from('receipts')
    .select('id, client_id, file_url, file_name, file_type')
    .eq('id', receiptId)
    .maybeSingle();

  if (fetchErr || !receipt) {
    return NextResponse.json({ error: 'Beleg nicht gefunden' }, { status: 404 });
  }

  // Membership-Check (User darf auf diesen Client zugreifen)
  const { data: membership } = await admin
    .from('client_memberships')
    .select('client_id')
    .eq('user_id', user.id)
    .eq('client_id', receipt.client_id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  }

  // Status → processing
  await admin.from('receipts').update({ status: 'processing' }).eq('id', receiptId);

  try {
    // Datei aus Supabase Storage als Blob laden
    const { data: fileData, error: storageErr } = await admin.storage
      .from('belege')
      .download(receipt.file_url);

    if (storageErr || !fileData) {
      throw new Error(`Storage-Fehler: ${storageErr?.message ?? 'Datei nicht gefunden'}`);
    }

    // Blob → base64
    const arrayBuffer = await fileData.arrayBuffer();
    const base64      = Buffer.from(arrayBuffer).toString('base64');

    // MIME-Typ für Claude bestimmen
    type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
    type PdfMediaType   = 'application/pdf';
    const mimeType = receipt.file_type as ImageMediaType | PdfMediaType;
    const isPdf    = mimeType === 'application/pdf';

    // Claude Vision aufrufen
    const message = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: isPdf
            ? [
                {
                  type:   'document' as const,
                  source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 },
                },
                { type: 'text' as const, text: OCR_PROMPT },
              ]
            : [
                {
                  type:   'image' as const,
                  source: { type: 'base64' as const, media_type: mimeType as ImageMediaType, data: base64 },
                },
                { type: 'text' as const, text: OCR_PROMPT },
              ],
        },
      ],
    });

    // JSON aus Antwort extrahieren
    const raw  = message.content[0].type === 'text' ? message.content[0].text : '';
    const json = raw.match(/\{[\s\S]*\}/)?.[0];
    if (!json) throw new Error('Keine JSON-Antwort von Claude');

    const ocrData = JSON.parse(json);

    // Ergebnis speichern
    await admin.from('receipts').update({
      status:   'processed',
      ocr_data: ocrData,
      ocr_error: null,
    }).eq('id', receiptId);

    return NextResponse.json({ ok: true, ocrData });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
    await admin.from('receipts').update({
      status:    'error',
      ocr_error: msg,
    }).eq('id', receiptId);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
