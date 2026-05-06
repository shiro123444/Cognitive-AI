"""EduFish report preview and PDF export helpers."""

from __future__ import annotations

import html
import re
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _plain_text(value: str) -> str:
    text = re.sub(r"[#*_`>]+", "", value or "")
    text = re.sub(r"^\s*-\s*", "", text)
    return re.sub(r"\s+", " ", text).strip()


def _wrap_text(text: str, limit: int = 46) -> list[str]:
    text = _plain_text(text)
    if not text:
        return [""]
    lines: list[str] = []
    current = ""
    for token in re.findall(r"[\u4e00-\u9fff]|[^\s\u4e00-\u9fff]+|\s+", text):
        if token.isspace():
            if current and not current.endswith(" "):
                current += " "
            continue
        if len(current) + len(token) > limit and current:
            lines.append(current.strip())
            current = token
        else:
            current += token
    if current.strip():
        lines.append(current.strip())
    return lines or [text[:limit]]


class EduReportExportService:
    """Render a stored EduFish report as preview HTML or PDF."""

    _BROWSER_CANDIDATES = ("google-chrome", "chromium", "chromium-browser")

    def render_preview_html(self, report: dict[str, Any]) -> str:
        sections = report.get("sections") or []
        section_html = "\n".join(
            f"""
            <section class="report-section">
              <div class="section-number">{index + 1:02d}</div>
              <div>
                <h2>{html.escape(section.get("title") or f"Section {index + 1}")}</h2>
                {self._markdown_block_to_html(section.get("content") or "")}
              </div>
            </section>
            """
            for index, section in enumerate(sections)
        )
        generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html.escape(report.get("title") or "EduFish Report")}</title>
  <style>
    @page {{ margin: 22mm 18mm; }}
    :root {{ --blue:#0022ff; --ink:#0b0d12; --muted:#767b86; --line:#e6e8ef; }}
    body {{ margin:0; background:#f5f6f8; color:var(--ink); font-family: Inter, "Noto Sans SC", system-ui, sans-serif; }}
    .page {{ max-width: 860px; min-height: 100vh; margin: 0 auto; background:#fff; padding: 52px 58px 72px; box-sizing:border-box; }}
    .meta {{ display:flex; gap:14px; align-items:center; margin-bottom: 28px; font: 700 11px/1.4 monospace; color:var(--muted); }}
    .tag {{ background:#000; color:#fff; padding:5px 8px; letter-spacing:0; }}
    h1 {{ margin:0 0 16px; max-width:760px; font: 700 38px/1.16 Georgia, "Times New Roman", serif; letter-spacing:0; }}
    .subtitle {{ margin:0 0 34px; color:var(--muted); font: italic 16px/1.7 Georgia, "Times New Roman", serif; }}
    .rule {{ height:1px; background:var(--line); margin-bottom:34px; }}
    .report-section {{ display:grid; grid-template-columns:42px 1fr; gap:18px; margin:0 0 34px; break-inside:avoid; }}
    .section-number {{ color:#a5a9b2; font: 500 16px/1.3 monospace; }}
    h2 {{ margin:0 0 12px; font: 600 24px/1.25 Georgia, "Times New Roman", serif; letter-spacing:0; }}
    p, li, blockquote {{ font-size:14px; line-height:1.82; color:#333944; }}
    p {{ margin:0 0 10px; }}
    ul {{ margin:0 0 14px 18px; padding:0; }}
    blockquote {{ margin: 10px 0; padding-left:14px; border-left:2px solid var(--blue); color:#555b66; }}
    .footer {{ margin-top:48px; padding-top:18px; border-top:1px solid var(--line); color:var(--muted); font: 11px/1.6 monospace; display:flex; justify-content:space-between; }}
    .actions {{ position:fixed; right:24px; top:24px; display:flex; gap:8px; }}
    .actions a {{ color:var(--blue); background:#fff; border:1px solid rgba(0,34,255,.28); padding:8px 10px; text-decoration:none; font:700 11px/1 monospace; }}
    @media print {{ body {{ background:#fff; }} .page {{ padding:0; max-width:none; }} .actions {{ display:none; }} }}
  </style>
</head>
<body>
  <nav class="actions">
    <a href="/api/edu/reports/{html.escape(report.get("report_id") or "")}/pdf" target="_blank">PDF PREVIEW</a>
    <a href="/api/edu/reports/{html.escape(report.get("report_id") or "")}/pdf?download=1">DOWNLOAD PDF</a>
  </nav>
  <main class="page">
    <div class="meta">
      <span class="tag">EDUFISH QUALITY REPORT</span>
      <span>ID: {html.escape(report.get("report_id") or "")}</span>
      <span>{generated_at}</span>
    </div>
    <h1>{html.escape(report.get("title") or "EduFish Teaching Quality Report")}</h1>
    <p class="subtitle">Evidence-backed teaching quality analysis, generated from feedback, achievement, attendance, and graph relationships.</p>
    <div class="rule"></div>
    {section_html}
    <footer class="footer">
      <span>EDUFISH OS / REPORT AGENT</span>
      <span>{html.escape(report.get("status") or "completed").upper()}</span>
    </footer>
  </main>
</body>
</html>"""

    def render_pdf(self, report: dict[str, Any]) -> bytes:
        html_source = self.render_preview_html(report)
        browser_pdf = self._render_html_pdf_with_browser(html_source)
        if browser_pdf:
            return browser_pdf
        return self._render_plain_text_pdf(report)

    def _render_html_pdf_with_browser(self, html_source: str) -> bytes | None:
        browser_path = self._find_browser()
        if not browser_path:
            return None

        with tempfile.TemporaryDirectory(prefix="edufish-report-") as temp_dir:
            temp_path = Path(temp_dir)
            html_path = temp_path / "report.html"
            pdf_path = temp_path / "report.pdf"
            html_path.write_text(html_source, encoding="utf-8")
            command = [
                browser_path,
                "--headless=new",
                "--disable-gpu",
                "--disable-dev-shm-usage",
                "--disable-extensions",
                "--no-sandbox",
                "--no-pdf-header-footer",
                "--print-to-pdf-no-header",
                f"--print-to-pdf={pdf_path}",
                html_path.as_uri(),
            ]
            try:
                subprocess.run(
                    command,
                    check=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    timeout=30,
                )
            except (OSError, subprocess.SubprocessError):
                return None
            if not pdf_path.exists() or pdf_path.stat().st_size == 0:
                return None
            return pdf_path.read_bytes()

    def _find_browser(self) -> str | None:
        for binary in self._BROWSER_CANDIDATES:
            browser_path = shutil.which(binary)
            if browser_path:
                return browser_path
        return None

    def _render_plain_text_pdf(self, report: dict[str, Any]) -> bytes:
        lines = self._report_lines(report)
        pages = [lines[index:index + 42] for index in range(0, len(lines), 42)] or [["EduFish Report"]]
        objects: list[bytes] = []

        def add_object(body: str | bytes) -> int:
            objects.append(body.encode("utf-8") if isinstance(body, str) else body)
            return len(objects)

        add_object("<< /Type /Catalog /Pages 2 0 R >>")
        add_object("PAGES_PLACEHOLDER")
        add_object("<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [4 0 R] >>")
        add_object("<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 2 >> >>")

        page_object_ids: list[int] = []
        for page_index, page_lines in enumerate(pages):
            content = self._page_stream(page_lines, page_index + 1, len(pages))
            stream_id = add_object(f"<< /Length {len(content)} >>\nstream\n".encode("utf-8") + content + b"endstream")
            page_id = add_object(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents {stream_id} 0 R >>")
            page_object_ids.append(page_id)

        kids = " ".join(f"{page_id} 0 R" for page_id in page_object_ids)
        objects[1] = f"<< /Type /Pages /Kids [{kids}] /Count {len(page_object_ids)} >>".encode("utf-8")

        output = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
        offsets = [0]
        for index, body in enumerate(objects, start=1):
            offsets.append(len(output))
            output.extend(f"{index} 0 obj\n".encode("utf-8"))
            output.extend(body)
            output.extend(b"\nendobj\n")
        xref_at = len(output)
        output.extend(f"xref\n0 {len(objects) + 1}\n".encode("utf-8"))
        output.extend(b"0000000000 65535 f \n")
        for offset in offsets[1:]:
            output.extend(f"{offset:010d} 00000 n \n".encode("utf-8"))
        output.extend(f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_at}\n%%EOF\n".encode("utf-8"))
        return bytes(output)

    def _markdown_block_to_html(self, markdown: str) -> str:
        blocks: list[str] = []
        list_items: list[str] = []
        for raw_line in (markdown or "").splitlines():
            line = raw_line.strip()
            if not line:
                if list_items:
                    blocks.append("<ul>" + "".join(list_items) + "</ul>")
                    list_items = []
                continue
            if line.startswith("- "):
                list_items.append(f"<li>{html.escape(_plain_text(line))}</li>")
                continue
            if list_items:
                blocks.append("<ul>" + "".join(list_items) + "</ul>")
                list_items = []
            if line.startswith(">"):
                blocks.append(f"<blockquote>{html.escape(_plain_text(line))}</blockquote>")
            elif line.startswith("**") and line.endswith("**"):
                blocks.append(f"<p><strong>{html.escape(_plain_text(line))}</strong></p>")
            else:
                blocks.append(f"<p>{html.escape(_plain_text(line))}</p>")
        if list_items:
            blocks.append("<ul>" + "".join(list_items) + "</ul>")
        return "\n".join(blocks)

    def _report_lines(self, report: dict[str, Any]) -> list[str]:
        lines = [
            "EDUFISH QUALITY REPORT",
            f"ID: {report.get('report_id') or ''}",
            f"Title: {report.get('title') or 'Teaching Quality Report'}",
            "",
        ]
        for index, section in enumerate(report.get("sections") or [], start=1):
            lines.extend(["", f"{index:02d} {section.get('title') or 'Section'}"])
            for raw_line in (section.get("content") or "").splitlines():
                for wrapped in _wrap_text(raw_line):
                    if wrapped:
                        lines.append(wrapped)
        return lines

    def _page_stream(self, lines: list[str], page_number: int, page_count: int) -> bytes:
        commands: list[str] = []
        y = 790
        for index, line in enumerate(lines):
            size = 16 if page_number == 1 and index == 0 else 12
            if re.match(r"^\d{2}\s", line):
                size = 14
                y -= 4
            commands.append(self._text_command(line, 54, y, size))
            y -= 17 if size <= 12 else 22
        commands.append(self._text_command(f"{page_number} / {page_count}", 510, 34, 9))
        return "\n".join(commands).encode("ascii")

    def _text_command(self, text: str, x: int, y: int, size: int) -> str:
        encoded = (text or "").encode("utf-16-be", errors="ignore").hex().upper()
        return f"BT /F1 {size} Tf {x} {y} Td <{encoded}> Tj ET"
