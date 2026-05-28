import type { Prisma } from "@prisma/client";
import { z } from "zod";

/** Filter params shared by the activity feed + the audit export routes. */
export const auditFilterSchema = z.object({
  action: z.enum(["ASSIGN", "CHURN", "ASSIGN_CSM"]).optional(),
  actor: z.string().trim().optional(), // CSM email substring
  enterpriseId: z.string().trim().optional(),
  q: z.string().trim().optional(), // free-text — matches enterpriseId OR actor
  from: z.coerce.date().optional(), // inclusive lower bound on createdAt
  to: z.coerce.date().optional(), // inclusive upper bound on createdAt
  cursor: z.string().optional(), // keyset on AuditLog.id (cuid is sortable)
  take: z.coerce.number().int().min(1).max(500).optional(),
});
export type AuditFilter = z.infer<typeof auditFilterSchema>;

export function buildAuditWhere(f: AuditFilter): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};
  if (f.action) where.action = f.action;
  if (f.actor)
    where.actorEmail = { contains: f.actor.toLowerCase(), mode: "insensitive" };
  if (f.enterpriseId)
    where.enterpriseId = { contains: f.enterpriseId, mode: "insensitive" };

  if (f.q) {
    where.OR = [
      { enterpriseId: { contains: f.q, mode: "insensitive" } },
      { actorEmail: { contains: f.q.toLowerCase(), mode: "insensitive" } },
    ];
  }

  if (f.from || f.to) {
    where.createdAt = {};
    if (f.from) where.createdAt.gte = f.from;
    if (f.to) where.createdAt.lte = f.to;
  }

  return where;
}
