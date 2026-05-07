"""EDUFISH Engine API client."""

from __future__ import annotations

from typing import Any
from urllib.parse import urljoin

import requests

from .exceptions import (
    AuthenticationError,
    EduFishError,
    NotFoundError,
    ServerError,
    ValidationError,
)
from .models import (
    AnalysisPreviewRequest,
    AnalysisResult,
    AnalysisRunRequest,
    AnalysisStatus,
    CollectAnalyzeRequest,
    CreateDatasetRequest,
    EduDatasetResponse,
    KnowledgeGraph,
    PredictionResult,
    ReportResponse,
)


class EduFishClient:
    """HTTP client for the EDUFISH engine API.

    Usage:
        client = EduFishClient("http://localhost:5001", api_key="sk-xxx")
        datasets = client.list_datasets()
    """

    def __init__(self, base_url: str, api_key: str | None = None, timeout: int = 30):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout
        self._session = requests.Session()
        if api_key:
            self._session.headers["X-API-Key"] = api_key

    def _url(self, path: str) -> str:
        return urljoin(self.base_url, path)

    def _request(self, method: str, path: str, **kwargs) -> dict[str, Any]:
        kwargs.setdefault("timeout", self.timeout)
        try:
            resp = self._session.request(method, self._url(path), **kwargs)
        except requests.RequestException as exc:
            raise EduFishError(f"Request failed: {exc}", code="CONNECTION_ERROR") from exc

        body = resp.json() if resp.text else {}

        if resp.ok:
            return body.get("data", body)

        error = body.get("error", {})
        code = error.get("code", "UNKNOWN") if isinstance(error, dict) else "UNKNOWN"
        message = error.get("message", str(error)) if isinstance(error, dict) else str(error)

        status_map = {
            401: AuthenticationError,
            404: NotFoundError,
            422: ValidationError,
        }
        exc_cls = status_map.get(resp.status_code, ServerError if resp.status_code >= 500 else EduFishError)
        raise exc_cls(message, code=code, status=resp.status_code)

    def _get(self, path: str, params: dict | None = None) -> dict[str, Any]:
        return self._request("GET", path, params=params)

    def _post(self, path: str, json: dict | None = None) -> dict[str, Any]:
        return self._request("POST", path, json=json)

    # ── Templates ──────────────────────────────────────────────────────────

    def list_templates(self) -> dict[str, Any]:
        return self._get("/api/v1/edu/templates")

    # ── Datasets ───────────────────────────────────────────────────────────

    def normalize_dataset(self, data: dict[str, Any]) -> dict[str, Any]:
        """Normalize raw education data into the engine's domain schema."""
        return self._post("/api/v1/edu/datasets/normalize", json={"dataset": data})

    def create_dataset(self, data: CreateDatasetRequest) -> EduDatasetResponse:
        resp = self._post("/api/v1/edu/datasets", json=data.to_dict())
        return EduDatasetResponse(resp)

    def list_datasets(self, limit: int = 20) -> list[EduDatasetResponse]:
        resp = self._get("/api/v1/edu/datasets", params={"limit": limit})
        return [EduDatasetResponse(item) for item in resp.get("datasets", [])]

    def get_dataset(self, dataset_id: str) -> EduDatasetResponse:
        resp = self._get(f"/api/v1/edu/datasets/{dataset_id}")
        return EduDatasetResponse(resp)

    # ── Analysis ───────────────────────────────────────────────────────────

    def preview_analysis(self, data: AnalysisPreviewRequest) -> AnalysisResult:
        resp = self._post("/api/v1/edu/analysis/preview", json=data.to_dict())
        analysis = resp.get("analysis", {})
        return AnalysisResult(analysis)

    def run_analysis(self, data: AnalysisRunRequest) -> AnalysisStatus:
        resp = self._post("/api/v1/edu/analysis/run", json=data.to_dict())
        return AnalysisStatus(resp)

    def get_analysis_status(self, job_id: str) -> AnalysisStatus:
        resp = self._get(f"/api/v1/edu/analysis/status/{job_id}")
        return AnalysisStatus(resp)

    def list_analyses(self, limit: int = 20) -> list[AnalysisResult]:
        resp = self._get("/api/v1/edu/analysis", params={"limit": limit})
        return [AnalysisResult(item) for item in resp.get("analyses", [])]

    def get_analysis(self, analysis_id: str) -> AnalysisResult:
        resp = self._get(f"/api/v1/edu/analysis/{analysis_id}")
        return AnalysisResult(resp)

    def get_latest_analysis(self, course_id: str) -> AnalysisResult | None:
        resp = self._get("/api/v1/edu/analysis/latest", params={"course_id": course_id})
        return AnalysisResult(resp) if resp else None

    def get_analysis_graph(self, analysis_id: str) -> KnowledgeGraph:
        resp = self._get(f"/api/v1/edu/analysis/{analysis_id}/graph")
        return KnowledgeGraph(resp)

    def get_prediction(self, analysis_id: str) -> PredictionResult:
        resp = self._get(f"/api/v1/edu/analysis/{analysis_id}/prediction")
        return PredictionResult(resp)

    # ── Reports ────────────────────────────────────────────────────────────

    def get_report(self, report_id: str) -> ReportResponse:
        resp = self._get(f"/api/v1/edu/reports/{report_id}")
        return ReportResponse(resp)

    def get_report_html(self, report_id: str) -> str:
        resp = self._session.get(
            self._url(f"/api/v1/edu/reports/{report_id}/preview"), timeout=self.timeout
        )
        resp.raise_for_status()
        return resp.text

    def get_report_preview_url(self, report_id: str) -> str:
        return self._url(f"/api/v1/edu/reports/{report_id}/preview")

    def get_report_pdf(self, report_id: str, download: bool = False) -> bytes:
        params = {"download": "1"} if download else None
        resp = self._session.get(
            self._url(f"/api/v1/edu/reports/{report_id}/pdf"),
            params=params,
            timeout=self.timeout,
        )
        resp.raise_for_status()
        return resp.content

    # ── Collect & Analyze ──────────────────────────────────────────────────

    def collect_and_analyze(self, data: CollectAnalyzeRequest) -> dict[str, Any]:
        return self._post("/api/v1/edu/collect-and-analyze", json=data.to_dict())

    def collect_preview(
        self, course_id: str | None = None, time_range_days: int = 30
    ) -> dict[str, Any]:
        params = {"time_range_days": time_range_days}
        if course_id:
            params["course_id"] = course_id
        return self._get("/api/v1/edu/collect-preview", params=params)
