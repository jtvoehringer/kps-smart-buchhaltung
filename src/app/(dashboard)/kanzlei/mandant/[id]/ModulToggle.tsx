// Vormals "ModulToggle": Rechnungsmodul, OCR-Belegverarbeitung und Offene
// Posten waren optional zubuchbare Add-ons. Seit dem Vollintegrations-Update
// sind sie fixer, nicht abschaltbarer Bestandteil jeder Lösung – diese Karte
// informiert Superadmins nur mehr darüber, es gibt nichts mehr zu togglen.

const INKLUSIV_LEISTUNGEN = [
  {
    icon:        '📄',
    label:       'Rechnungsmodul',
    description: 'Ausgangsrechnungen, Kundenstamm, Lieferantenstamm, PDF-Export im Klientendesign',
  },
  {
    icon:        '🔍',
    label:       'OCR Belegverarbeitung',
    description: 'Belege fotografieren oder hochladen (auch mobil), KI-gestützte Datenerkennung, automatisch als Buchung übernehmen',
  },
  {
    icon:        '💳',
    label:       'Offene Posten',
    description: 'Ein- und Ausgangsrechnungen, Zahlungsabgleich, automatische Verbuchung bei Zahlungseingang/-ausgang',
  },
];

export default function InklusivCard() {
  return (
    <div className="bg-white rounded-xl border border-[#35609E]/20 shadow-sm p-5 mb-5">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="font-semibold text-gray-700">Inklusivleistungen</h2>
        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
          Fixer Bestandteil
        </span>
      </div>

      <div className="space-y-3">
        {INKLUSIV_LEISTUNGEN.map(mod => (
          <div
            key={mod.label}
            className="flex items-center gap-3 p-4 rounded-xl border-2 border-[#35609E] bg-[#35609E]/5"
          >
            <span className="text-2xl">{mod.icon}</span>
            <div>
              <span className="font-medium text-gray-800 text-sm">{mod.label}</span>
              <p className="text-xs text-gray-400 mt-0.5">{mod.description}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 mt-3">
        Diese Leistungen sind seit dem Vollintegrations-Update für alle Mandanten aktiv
        und nicht mehr einzeln zu- oder abschaltbar.
      </p>
    </div>
  );
}
