# EDUFISH — Smart Education Analysis Engine

Course-first AI platform for Artificial Intelligence Introduction and Brain & Cognitive Science Introduction. Features pluggable analysis pipelines, interactive knowledge graphs, and cited AI tutoring.

## Architecture

```
┌──────────────────────────────────────────────┐
│  Host Platform                                │
│  ┌──────────┐  ┌────────────┐  ┌───────────┐ │
│  │ Python SDK│  │  JS SDK    │  │ REST API  │ │
│  └────┬─────┘  └─────┬──────┘  └─────┬─────┘ │
│       └──────────────┼───────────────┘       │
│                      │                        │
│  ┌───────────────────▼──────────────────────┐ │
│  │  EDUFISH Engine (Flask + Gunicorn)       │ │
│  │  /api/v1/edu/*   /api/v1/agents/*        │ │
│  │  ┌─────────┐ ┌────────┐ ┌─────────────┐  │ │
│  │  │ Analysis│ │ Report │ │ Knowledge    │  │ │
│  │  │ Pipeline│ │ Gen    │ │ Graph        │  │ │
│  │  └─────────┘ └────────┘ └─────────────┘  │ │
│  └───────────────────┬──────────────────────┘ │
│                      │                        │
│  ┌───────────────────▼──────────────────────┐ │
│  │  Frontend (Vue 3 + D3 + GSAP)            │ │
│  │  Knowledge Graph  │  Report Viewer        │ │
│  │  Analysis Dashboard                       │ │
│  └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

## One-Click Deploy (Docker)

```bash
git clone <repo-url> && cd edufish
cp deploy/.env.template deploy/.env
# Edit deploy/.env with your LLM_API_KEY
bash deploy/setup.sh
```

The engine starts on port **5001** and the frontend on port **3025**:

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3025 |
| API | http://localhost:5001/api/v1 |
| Health | http://localhost:5001/health |

## Local Development

### Backend (Python >= 3.11)

```bash
cd backend
uv sync
uv run python run.py
```

### Frontend (Node.js >= 18)

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3025`.

## SDK Integration

### Python

```bash
pip install -e sdk/python
```

```python
from edufish import EduFishClient

client = EduFishClient("http://localhost:5001/api/v1", api_key="...")
templates = client.list_templates()
dataset = client.create_dataset(dataset={...}, dataset_meta={"name": "..."})
job = client.run_analysis(dataset_id=dataset.dataset_id, template_id="course-quality")
```

See [sdk/python/README.md](sdk/python/README.md) for full API reference.

### JavaScript / TypeScript

```bash
npm install @edufish/sdk
```

```typescript
import { EduFishClient } from '@edufish/sdk';

const client = new EduFishClient('http://localhost:5001/api/v1', '...');
const { templates } = await client.listTemplates();
const dataset = await client.createDataset({ dataset: {...}, dataset_meta: { name: '...' } });
const job = await client.runAnalysis({ dataset_id: dataset.id, template_id: 'course-quality' });
```

See [sdk/js/README.md](sdk/js/README.md) for full API reference.

### Vue Components

```bash
npm install @edufish/vue
```

```vue
<script setup>
import { AdaptiveGraphPanel } from '@edufish/vue';
</script>
<template>
  <AdaptiveGraphPanel :graph-data="graphData" />
</template>
```

## API Overview

All endpoints under `/api/v1/`:

| Group | Endpoints |
|-------|-----------|
| Datasets | `GET/POST /edu/datasets`, `GET /edu/datasets/:id` |
| Analysis | `POST /edu/analysis/run`, `GET /edu/analysis/status/:jobId`, `GET /edu/analysis/:id` |
| Graph | `GET /edu/analysis/:id/graph` |
| Prediction | `GET /edu/analysis/:id/prediction` |
| Reports | `GET /edu/reports/:id`, `GET /edu/reports/:id/pdf` |
| Agents | `POST /agents/run`, `GET /agents/status/:jobId` |

## Enterprise Features

| Feature | Status | Config |
|---------|--------|--------|
| API versioning (`/api/v1/`) | Delivered | — |
| Rate limiting | Delivered | `RATE_LIMIT_ENABLED=true` |
| Webhook callbacks | Delivered | Pass `webhook_url` in analysis requests |
| Multi-tenant isolation | Delivered | `MULTI_TENANT_ENABLED=true`, use `X-Tenant-ID` header |
| Frontend component library | Delivered | `npm install @edufish/vue` |

## Tests

```bash
cd backend && uv run pytest -q
cd frontend && npm test && npm run build
```

## Environment Variables

See [deploy/.env.template](deploy/.env.template) for all configuration options.
