export interface ContextGrant {
  grant_id: string;
  from_run_id: string;
  to_run_id: string | null;
  entry_refs: string[];
  summary_refs: string[];
  artifact_refs: string[];
  resource_scopes: string[];
  expires_at: string | null;
}
