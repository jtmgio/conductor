import { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Password",
      credentials: {
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.password) return null;

        // Try DB password first, then env var as fallback
        let hash = process.env.APP_PASSWORD_HASH;
        try {
          const profile = await prisma.userProfile.findUnique({ where: { id: "default" } });
          if (profile?.passwordHash) hash = profile.passwordHash;
        } catch {
          // DB might not be ready — fall back to env var
        }

        if (!hash) return null;
        const valid = await bcrypt.compare(credentials.password, hash);
        if (valid) {
          return { id: "1", name: "Conductor" };
        }
        return null;
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
};
