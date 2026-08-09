-- audit_logs é append-only (DOC-002/006): UPDATE e DELETE são bloqueados no banco,
-- não apenas por convenção de aplicação.
CREATE OR REPLACE FUNCTION forbid_audit_log_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'raise_exception';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER trg_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_log_mutation();
