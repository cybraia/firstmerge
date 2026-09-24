import type { SkillProfile } from "@/lib/types";

declare module "next-auth" {
  interface Session {
    login?: string;
    skills?: SkillProfile;
  }
}

// In Auth.js v5 the JWT type lives in @auth/core.
declare module "@auth/core/jwt" {
  interface JWT {
    login?: string;
    skills?: SkillProfile;
  }
}
