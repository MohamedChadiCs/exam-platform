import { query } from './db.js';

/** Append an audit record. `db` may be a transaction client. */
export function audit({ actorId = null, action, entityType, entityId = null, before = null, after = null, ip = null }, db = { query }) {
  return db.query(
    `INSERT INTO activity_logs(actor_id,action,entity_type,entity_id,before,after,ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [actorId, action, entityType, entityId && String(entityId),
      before && JSON.stringify(before), after && JSON.stringify(after), ip]);
}
