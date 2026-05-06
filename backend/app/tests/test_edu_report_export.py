import shutil
import subprocess
from pathlib import Path
from urllib.parse import urlparse

from app.services.edu_report_export import EduReportExportService


def test_render_pdf_prints_styled_preview_html_with_browser(monkeypatch):
    report = {
        "report_id": "edu_rp_test",
        "title": "Course Quality Review",
        "status": "completed",
        "sections": [
            {
                "title": "Course Quality Signals",
                "content": "- Strong feedback loop\n- Stable attendance trend",
            }
        ],
    }
    browser_pdf = b"%PDF-1.7\n% rendered from styled html\n"
    calls = []

    def fake_run(command, *, check, stdout, stderr, timeout):
        calls.append(command)
        output_arg = next(arg for arg in command if arg.startswith("--print-to-pdf="))
        output_path = Path(output_arg.split("=", 1)[1])
        html_url = command[-1]
        html_path = Path(urlparse(html_url).path)
        html_text = html_path.read_text(encoding="utf-8")

        assert check is True
        assert stdout == subprocess.PIPE
        assert stderr == subprocess.PIPE
        assert "@page" in html_text
        assert ".report-section" in html_text
        assert "EDUFISH QUALITY REPORT" in html_text

        output_path.write_bytes(browser_pdf)
        return subprocess.CompletedProcess(command, 0)

    monkeypatch.setattr(shutil, "which", lambda binary: "/usr/bin/google-chrome" if binary == "google-chrome" else None)
    monkeypatch.setattr(subprocess, "run", fake_run)

    pdf = EduReportExportService().render_pdf(report)

    assert pdf == browser_pdf
    assert calls
    assert "--headless=new" in calls[0]
