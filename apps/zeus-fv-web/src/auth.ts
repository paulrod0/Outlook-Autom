import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

/**
 * Auth.js (NextAuth v5) — login interno con Credentials provider.
 *
 * Usuarios definidos vía variable de entorno `AUTH_USERS` como JSON:
 *
 *   AUTH_USERS=[{"email":"pablo@grupo-optimus.com","name":"Pablo","passwordHash":"$2b$10$..."}]
 *
 * `passwordHash` se genera con bcrypt. Helper rápido:
 *   node -e "console.log(require('bcryptjs').hashSync('miClave', 10))"
 *
 * Si `AUTH_USERS` está vacío y AUTH_DEV_PASSWORD está definida,
 * cualquier email con esa contraseña entra (modo desarrollo). Nunca en
 * producción.
 *
 * Requiere también `AUTH_SECRET` (cualquier string aleatorio largo).
 */

type AuthUser = {
  email: string;
  name?: string;
  passwordHash: string;
  role?: "admin" | "comercial";
};

function loadUsers(): AuthUser[] {
  const raw = process.env.AUTH_USERS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as AuthUser[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.warn("[auth] AUTH_USERS no es JSON válido — se ignora");
    return [];
  }
}

declare module "next-auth" {
  interface Session {
    user: {
      role?: "admin" | "comercial";
    } & DefaultSession["user"];
  }
}

export const { auth, handlers, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "Grupo Optimus",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        const users = loadUsers();
        const user = users.find((u) => u.email.toLowerCase() === email);

        if (user) {
          const ok = await bcrypt.compare(password, user.passwordHash);
          if (!ok) return null;
          return {
            id: user.email,
            email: user.email,
            name: user.name ?? user.email,
            role: user.role ?? "comercial",
          };
        }

        // Fallback de desarrollo: contraseña única vía env, nunca en prod.
        const devPass = process.env.AUTH_DEV_PASSWORD;
        if (devPass && process.env.NODE_ENV !== "production" && password === devPass) {
          return { id: email, email, name: email, role: "comercial" };
        }
        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user && "role" in user) {
        token.role = (user as { role?: string }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token?.role && session.user) {
        session.user.role = token.role as "admin" | "comercial";
      }
      return session;
    },
  },
});
