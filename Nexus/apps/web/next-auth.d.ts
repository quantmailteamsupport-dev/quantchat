import type { DefaultSession } from "next-auth";

export { default } from "../../node_modules/next-auth";
export * from "../../node_modules/next-auth";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    refreshToken?: string;
    authProvider?: string;
    user: DefaultSession["user"] & {
      id: string;
    };
  }

  interface User {
    accessToken?: string;
    refreshToken?: string;
    authProvider?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    accessToken?: string;
    refreshToken?: string;
    authProvider?: string;
  }
}
