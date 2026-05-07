import type {
  AnalysisPreviewRequest,
  AnalysisResult,
  AnalysisRunRequest,
  AnalysisStatus,
  ApiEnvelope,
  CollectAnalyzeRequest,
  CreateDatasetRequest,
  EduDatasetResponse,
  KnowledgeGraph,
  PredictionResult,
  ReportResponse,
} from "./types";
import { AuthenticationError, EduFishError, NotFoundError, ValidationError } from "./exceptions";

export class EduFishClient {
  private baseURL: string;
  private apiKey: string | undefined;
  private timeout: number;

  constructor(baseURL: string, apiKey?: string, timeout = 30000) {
    this.baseURL = baseURL.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.timeout = timeout;
  }

  private url(path: string): string {
    return `${this.baseURL}${path}`;
  }

  private async request<T>(method: string, path: string, body?: unknown, params?: Record<string, string>): Promise<T> {
    const url = new URL(this.url(path));
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["X-API-Key"] = this.apiKey;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const resp = await fetch(url.toString(), {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const json: ApiEnvelope<T> = resp.headers.get("content-type")?.includes("application/json")
        ? await resp.json()
        : ({} as ApiEnvelope<T>);

      if (!resp.ok) {
        const err = json.error || { code: "UNKNOWN", message: resp.statusText };
        const msg = typeof err === "string" ? err : err.message;
        const code = typeof err === "string" ? "UNKNOWN" : err.code;

        switch (resp.status) {
          case 401:
            throw new AuthenticationError(msg);
          case 404:
            throw new NotFoundError(msg);
          case 422:
            throw new ValidationError(msg);
          default:
            throw resp.status >= 500
              ? new EduFishError(msg, code, resp.status)
              : new EduFishError(msg, code, resp.status);
        }
      }

      return (json.data ?? json) as T;
    } catch (err) {
      if (err instanceof EduFishError) throw err;
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new EduFishError("Request timed out", "TIMEOUT");
      }
      throw new EduFishError(`Request failed: ${String(err)}`, "CONNECTION_ERROR");
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private get<T>(path: string, params?: Record<string, string>): Promise<T> {
    return this.request<T>("GET", path, undefined, params);
  }

  private post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  // ── Templates ──────────────────────────────────────────────────────────

  async listTemplates(): Promise<{ templates: unknown[] }> {
    return this.get("/api/v1/edu/templates");
  }

  // ── Datasets ───────────────────────────────────────────────────────────

  async normalizeDataset(data: Record<string, unknown[]>): Promise<Record<string, unknown>> {
    return this.post("/api/v1/edu/datasets/normalize", { dataset: data });
  }

  async createDataset(data: CreateDatasetRequest): Promise<EduDatasetResponse> {
    return this.post("/api/v1/edu/datasets", data);
  }

  async listDatasets(limit = 20): Promise<EduDatasetResponse[]> {
    const resp = await this.get<{ datasets: EduDatasetResponse[] }>("/api/v1/edu/datasets", { limit: String(limit) });
    return resp.datasets;
  }

  async getDataset(datasetId: string): Promise<EduDatasetResponse> {
    return this.get(`/api/v1/edu/datasets/${datasetId}`);
  }

  // ── Analysis ───────────────────────────────────────────────────────────

  async previewAnalysis(data: AnalysisPreviewRequest): Promise<AnalysisResult> {
    const resp = await this.post<{ analysis: AnalysisResult }>("/api/v1/edu/analysis/preview", data);
    return resp.analysis;
  }

  async runAnalysis(data: AnalysisRunRequest): Promise<AnalysisStatus> {
    return this.post("/api/v1/edu/analysis/run", data);
  }

  async getAnalysisStatus(jobId: string): Promise<AnalysisStatus> {
    return this.get(`/api/v1/edu/analysis/status/${jobId}`);
  }

  async listAnalyses(limit = 20): Promise<AnalysisResult[]> {
    const resp = await this.get<{ analyses: AnalysisResult[] }>("/api/v1/edu/analysis", { limit: String(limit) });
    return resp.analyses;
  }

  async getAnalysis(analysisId: string): Promise<AnalysisResult> {
    return this.get(`/api/v1/edu/analysis/${analysisId}`);
  }

  async getLatestAnalysis(courseId: string): Promise<AnalysisResult | null> {
    try {
      return await this.get<AnalysisResult>("/api/v1/edu/analysis/latest", { course_id: courseId });
    } catch (err) {
      if (err instanceof NotFoundError) return null;
      throw err;
    }
  }

  async getAnalysisGraph(analysisId: string): Promise<KnowledgeGraph> {
    return this.get(`/api/v1/edu/analysis/${analysisId}/graph`);
  }

  async getPrediction(analysisId: string): Promise<PredictionResult> {
    return this.get(`/api/v1/edu/analysis/${analysisId}/prediction`);
  }

  // ── Reports ────────────────────────────────────────────────────────────

  async getReport(reportId: string): Promise<ReportResponse> {
    return this.get(`/api/v1/edu/reports/${reportId}`);
  }

  getReportPreviewUrl(reportId: string): string {
    return this.url(`/api/v1/edu/reports/${reportId}/preview`);
  }

  getReportPdfUrl(reportId: string, download = false): string {
    const qs = download ? "?download=1" : "";
    return this.url(`/api/v1/edu/reports/${reportId}/pdf${qs}`);
  }

  async getReportPdfBlob(reportId: string, download = false): Promise<Blob> {
    const url = this.getReportPdfUrl(reportId, download);
    const headers: Record<string, string> = {};
    if (this.apiKey) headers["X-API-Key"] = this.apiKey;

    const resp = await fetch(url, { headers });
    if (!resp.ok) {
      throw new EduFishError("Failed to fetch PDF", "REQUEST_FAILED", resp.status);
    }
    return resp.blob();
  }

  // ── Collect & Analyze ──────────────────────────────────────────────────

  async collectAndAnalyze(data: CollectAnalyzeRequest): Promise<Record<string, unknown>> {
    return this.post("/api/v1/edu/collect-and-analyze", data);
  }

  async collectPreview(courseId?: string, timeRangeDays = 30): Promise<Record<string, unknown>> {
    const params: Record<string, string> = { time_range_days: String(timeRangeDays) };
    if (courseId) params.course_id = courseId;
    return this.get("/api/v1/edu/collect-preview", params);
  }
}
