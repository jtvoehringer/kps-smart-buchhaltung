// BMD-Export ist umgezogen (Design-Review 12.08.2026): er gehört zum
// Monatsabschluss und ist jetzt für Klient UND Kanzlei unter /bmd-export.
import { redirect } from 'next/navigation';

export default function AlterBmdExportPfad() {
  redirect('/bmd-export');
}
