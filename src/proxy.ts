// ============================================================
// Proxy (ehemals Middleware) – schützt alle /dashboard-Routen
// Nicht eingeloggte User werden zu /login weitergeleitet.
// ============================================================
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Nicht eingeloggt & nicht auf einer Auth-Seite → Login
  // Öffentlich erreichbar – sonst landet man beim Aufruf der
  // Anmeldeseite in einer Weiterleitungsschleife.
  const publicPaths = ['/login', '/passwort-vergessen', '/passwort-neu'];
  if (!user && !publicPaths.some(p => request.nextUrl.pathname.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

// Der Matcher listete bisher vier Bereiche auf: /dashboard, /buchungen,
// /dauerauftraege und /uva. Alles andere – /rechnungen, /kunden,
// /lieferanten, /belege, /konten, /einstellungen, /kanzlei, /import,
// /offene-posten, /monatsabschluss – lief daran vorbei.
//
// Der Zugriffsschutz selbst war dadurch nicht offen: das Layout unter
// (dashboard) leitet ohne Anmeldung nach /login um. Aber dieser Proxy
// erneuert nebenbei das Supabase-Sitzungstoken. Wer eine Stunde lang
// nur Rechnungen schrieb, fiel deshalb irgendwann grundlos aus der
// Anmeldung – wer zwischendurch die Buchungsliste öffnete, nicht.
//
// Jetzt greift er überall außer bei statischen Dateien und den
// API-Routen. Die prüfen selbst und müssen einen 401 zurückgeben,
// statt eine Weiterleitung auf die Login-Seite zu liefern, mit der
// ein fetch() nichts anfangen kann.
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|manifest\\.webmanifest|sw\\.js|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
