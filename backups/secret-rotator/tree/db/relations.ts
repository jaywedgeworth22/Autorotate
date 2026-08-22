import { relations } from "drizzle-orm";
import { connectors, secrets, targets, rotationRuns, auditLog } from "./schema";

export const connectorsRelations = relations(connectors, ({ many }) => ({
  secrets: many(secrets),
}));

export const secretsRelations = relations(secrets, ({ one, many }) => ({
  connector: one(connectors, {
    fields: [secrets.connectorId],
    references: [connectors.id],
  }),
  targets: many(targets),
  runs: many(rotationRuns),
}));

export const targetsRelations = relations(targets, ({ one }) => ({
  secret: one(secrets, {
    fields: [targets.secretId],
    references: [secrets.id],
  }),
}));

export const rotationRunsRelations = relations(rotationRuns, ({ one }) => ({
  secret: one(secrets, {
    fields: [rotationRuns.secretId],
    references: [secrets.id],
  }),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  secret: one(secrets, {
    fields: [auditLog.secretId],
    references: [secrets.id],
  }),
}));
