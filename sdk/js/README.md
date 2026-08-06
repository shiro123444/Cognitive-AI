# EDUFISH JavaScript SDK

JavaScript/TypeScript client for the EDUFISH smart education analysis engine.

## Installation

```bash
npm install @edufish/sdk
```

Requires Node.js >= 18.

## Quick Start

```typescript
import { EduFishClient } from '@edufish/sdk';

const client = new EduFishClient(
  'http://localhost:5001/api/v1',
  'your-api-key'  // optional — omit if auth is disabled
);

// List available analysis templates
const { templates } = await client.listTemplates();

// Create a dataset
const dataset = await client.createDataset({
  dataset: {
    courses: [{ course_id: 'cs101', title: 'CS 101' }],
    students: [{ student_id: 's001', name: 'Alice' }],
  },
  dataset_meta: { name: 'My Dataset' },
});

// Run analysis (async)
const job = await client.runAnalysis({
  dataset_id: dataset.id,
  template_id: 'course-quality',
  audience_role: 'school_admin',
});

// Poll for status
const status = await client.getAnalysisStatus(job.job_id);
console.log(status.status); // "queued" → "running" → "completed"

// Retrieve results
const analysis = await client.getAnalysis(status.target_id);
const report = await client.getReport(analysis.report_id);

// Download report PDF
const pdfBlob = await client.getReportPdfBlob(analysis.report_id);
```

## Error Handling

```typescript
import {
  EduFishError,
  AuthenticationError,
  NotFoundError,
  ValidationError,
  ServerError,
} from '@edufish/sdk';

try {
  const dataset = await client.getDataset('nonexistent');
} catch (err) {
  if (err instanceof NotFoundError) {
    console.error('Dataset not found:', err.message);
  } else if (err instanceof AuthenticationError) {
    console.error('Auth failed:', err.message);
  } else if (err instanceof EduFishError) {
    console.error(`API error (${err.code}):`, err.message);
  }
}
```

## API Reference

| Method | Description |
|--------|-------------|
| `listTemplates()` | List available analysis templates |
| `normalizeDataset(data)` | Preview normalized dataset schema |
| `createDataset(data)` | Create a new dataset |
| `listDatasets(limit?)` | List all datasets |
| `getDataset(datasetId)` | Get a single dataset |
| `previewAnalysis(data)` | Run analysis in preview mode |
| `runAnalysis(data)` | Submit async analysis job |
| `getAnalysisStatus(jobId)` | Poll job status |
| `listAnalyses(limit?)` | List all analyses |
| `getAnalysis(analysisId)` | Get analysis details |
| `getLatestAnalysis(courseId)` | Get latest analysis for a course |
| `getAnalysisGraph(analysisId)` | Get knowledge graph data |
| `getPrediction(analysisId)` | Get intervention strategy predictions |
| `getReport(reportId)` | Get report content |
| `getReportPreviewUrl(reportId)` | Get HTML report preview URL |
| `getReportPdfUrl(reportId, download?)` | Get PDF download URL |
| `getReportPdfBlob(reportId, download?)` | Download report PDF as Blob |
| `collectAndAnalyze(data)` | Collect data + run analysis in one call |
| `collectPreview(courseId?, timeRangeDays?)` | Preview collectable data |
