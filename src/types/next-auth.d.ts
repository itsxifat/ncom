import type { PlatformRole } from '@/generated/prisma/enums'
import type { DefaultSession } from '@auth/core/types'

// `next-auth`'s User/Session/JWT types are re-exports of @auth/core's — TS
// declaration merging must target the module where the interface is
// actually declared, not a module that only re-exports it.
declare module '@auth/core/types' {
  interface User {
    platformRole: PlatformRole
  }

  interface Session {
    user: {
      id: string
      platformRole: PlatformRole
    } & DefaultSession['user']
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    id: string
    platformRole: PlatformRole
  }
}
