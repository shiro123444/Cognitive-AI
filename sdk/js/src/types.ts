export interface EduDatasetInput {
  [domain: string]: unknown[];
}

export interface DatasetMeta {
  name: string;
  description?: string;
  source?: string;
}

export interface CourseScope {
  department_name: string;
  teacher_id: string;
  teacher_name: string;
  course_id?: string;
}

// ── Request types ──────────────────────────────────────────────────────────

export interface CreateDatasetRequest {
  dataset: EduDatasetInput;
  dataset_meta?: DatasetMeta;
  dataset_name?: string;
}

export interface AnalysisPreviewRequest {
  dataset: EduDatasetInput;
  dataset_meta?: DatasetMeta;
  template_id?: string;
  audience_role?: string;
  scope?: Partial<CourseScope>;
}

export interface AnalysisRunRequest {
  dataset_id: string;
  template_id?: string;
  audience_role?: string;
  scope?: Partial<CourseScope>;
}

export interface CollectAnalyzeRequest {
  course_id?: string;
  time_range_days?: number;
  audience_role?: string;
}

// ── Response types ─────────────────────────────────────────────────────────

export interface EduDatasetResponse {
  id: string;
  name: string;
  status: string;
  created_at: string;
  [key: string]: unknown;
}

export interface AnalysisResult {
  analysis_id: string;
  status: string;
  summary: string;
  metrics: Record<string, unknown>;
  insights: unknown[];
  scope: CourseScope;
  created_at: string;
  report_id?: string;
  [key: string]: unknown;
}

export interface AnalysisStatus {
  job_id: string;
  status: string;
  target_id: string;
  [key: string]: unknown;
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  [key: string]: unknown;
}

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  [key: string]: unknown;
}

export interface GraphEdge {
  source: string;
  target: string;
  label?: string;
  [key: string]: unknown;
}

export interface PredictionResult {
  scenarios: unknown[];
  recommendations: unknown[];
  [key: string]: unknown;
}

export interface ReportResponse {
  report_id: string;
  status: string;
  html?: string;
  created_at: string;
  [key: string]: unknown;
}

// ── API envelope ───────────────────────────────────────────────────────────

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown[];
  };
}
