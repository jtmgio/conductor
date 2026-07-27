import { PrismaClient } from "@prisma/client";

/**
 * Allocate the next per-company task number on every create.
 *
 * This lives in an extension rather than in each route because there are seven
 * task.create call sites (capture, tasks API, calendar prep, MCP, Linear, import).
 * Centralizing it means a new one can't silently produce a keyless task.
 *
 * The counter bump is a single atomic UPDATE ... RETURNING, so concurrent creates
 * can never collide. If the insert then fails the number is simply burned — gaps
 * are expected and correct; numbers are never reused.
 */
function withTaskNumbers(client: PrismaClient) {
  return client.$extends({
    query: {
      task: {
        async create({ args, query }) {
          const data = args.data as Record<string, unknown>;
          const roleId = data?.roleId as string | undefined;
          // A task that brings its own key (Linear's MED-54) doesn't need a
          // Conductor number — allocating one would burn the company's counter
          // for a key that never gets displayed.
          if (roleId && data.number == null && !data.externalKey) {
            const rows = await client.$queryRaw<{ taskSeq: number }[]>`
              UPDATE "Role" SET "taskSeq" = "taskSeq" + 1
              WHERE id = ${roleId}
              RETURNING "taskSeq"
            `;
            if (rows[0]) data.number = rows[0].taskSeq;
          }
          return query(args);
        },
      },
    },
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof withTaskNumbers> | undefined;
};

export const prisma = globalForPrisma.prisma ?? withTaskNumbers(new PrismaClient());

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
