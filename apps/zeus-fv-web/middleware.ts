import { auth } from "@/auth";
import { NextResponse } from "next/server";

/**
 * Protección global de rutas.
 *
 * Si `AUTH_ENFORCE` no está definida (o = "0"), el middleware no exige
 * sesión — útil en demos locales y previews sin necesidad de configurar
 * usuarios. Cuando se quiera blindar producción, basta con
 * `AUTH_ENFORCE=1` y un `AUTH_USERS` con la lista real.
 *
 * Las rutas internas de Auth.js y assets quedan siempre abiertas.
 */
export default auth((req) => {
  if (process.env.AUTH_ENFORCE !== "1") return NextResponse.next();
  if (req.auth) return NextResponse.next();

  const url = new URL(req.url);
  const callbackUrl = url.pathname + (url.search || "");
  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("callbackUrl", callbackUrl);
  return NextResponse.redirect(loginUrl);
});

export const config = {
  matcher: [
    // Excluye assets estáticos, _next, favicon e iconos públicos.
    "/((?!api/auth|_next|favicon|branding|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
