export type AuditEventReadModel = {
  id: string;
  orgId: string;
  storeId: string | null;
  actorId: string | null;
  actorName: string;
  actorRole: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  before: unknown;
  after: unknown;
  deviceId: string | null;
  branchName: string;
  createdAt: string;
};
