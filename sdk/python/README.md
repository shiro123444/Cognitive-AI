# EDUFISH Python SDK

Python client for the EDUFISH smart education analysis engine.

## Installation

```bash
pip install -e /path/to/edufish/sdk/python
```

Or install directly from source:

```bash
cd sdk/python
pip install .
```

Requires Python >= 3.11 and `requests`.

## Quick Start

```python
from edufish import EduFishClient

# Initialize client
client = EduFishClient(
    base_url="http://localhost:5001/api/v1",
    api_key="your-api-key"  # optional — omit if auth is disabled
)

# List available analysis templates
templates = client.list_templates()

# Create a dataset
dataset = client.create_dataset(
    dataset={
        "courses": [{"course_id": "cs101", "title": "CS 101"}],
        "students": [{"student_id": "s001", "name": "Alice"}],
    },
    dataset_meta={"name": "My Dataset"}
)

# Run analysis (async)
job = client.run_analysis(
    dataset_id=dataset.dataset_id,
    template_id="course-quality",
    audience_role="school_admin",
    webhook_url="https://your-platform.example/webhook"  # optional
)

# Poll for status
status = client.get_analysis_status(job.job_id)
print(status.status)  # "queued" → "running" → "completed"

# Retrieve results
analysis = client.get_analysis(status.analysis_id)
report = client.get_report(analysis["report_id"])
```

## Error Handling

```python
from edufish import (
    EduFishError,
    AuthenticationError,
    NotFoundError,
    ValidationError,
    ServerError,
)

try:
    dataset = client.get_dataset("nonexistent")
except NotFoundError as e:
    print(f"Dataset not found: {e}")
except AuthenticationError as e:
    print(f"Auth failed (status={e.status}): {e}")
except EduFishError as e:
    print(f"API error (code={e.code}): {e}")
```

## API Reference

| Method | Description |
|--------|-------------|
| `list_templates()` | List available analysis templates |
| `normalize_dataset(payload)` | Preview normalized dataset schema |
| `create_dataset(dataset, dataset_meta, name)` | Create a new dataset |
| `list_datasets(limit=20)` | List all datasets |
| `get_dataset(dataset_id)` | Get a single dataset |
| `preview_analysis(payload)` | Run analysis in preview mode |
| `run_analysis(dataset_id, template_id, audience_role, ...)` | Submit async analysis job |
| `list_analyses(limit=20)` | List all analyses |
| `get_analysis(analysis_id)` | Get analysis details |
| `get_analysis_graph(analysis_id)` | Get knowledge graph data |
| `get_analysis_prediction(analysis_id)` | Get intervention strategy predictions |
| `get_report(report_id)` | Get report content |
| `get_report_preview(report_id)` | Get HTML report preview |
| `export_report_pdf(report_id, download=False)` | Export report as PDF |
| `collect_and_analyze(course_id, ...)` | Collect data + run analysis in one call |
