import { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Conductor",
      credentials: {},
      // No password: Conductor is single-user. Port 5402 is open to the LAN and tailnet, so
      // anyone on either gets in. The session still exists so the getServerSession gates hold.
      async authorize() {
        return { id: "1", name: "Conductor" };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
};
