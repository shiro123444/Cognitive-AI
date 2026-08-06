from pathlib import Path
from statistics import pstdev

from PIL import Image
from playwright.sync_api import sync_playwright


ROOT = Path.cwd()
OUT = ROOT / "screenshots"
OUT.mkdir(exist_ok=True)


def image_signal(path):
    image = Image.open(path).convert("RGB")
    image.thumbnail((160, 160))
    samples = list(image.getdata())
    luma = [(r * 0.2126 + g * 0.7152 + b * 0.0722) for r, g, b in samples]
    return {
        "unique": len(set(samples)),
        "stdev": round(pstdev(luma), 2),
        "mean": round(sum(luma) / max(len(luma), 1), 2),
    }


def check_graph(page, name, width, height):
    page.set_viewport_size({"width": width, "height": height})
    page.goto("http://127.0.0.1:3000/courses/ai-intro", wait_until="networkidle")
    page.wait_for_selector(".graph-workbench")
    page.wait_for_timeout(1800)
    page.locator(".graph-workbench").scroll_into_view_if_needed()
    page.locator('.graph-node[data-node-id="concept-transformer-attention"] circle').click()
    page.wait_for_timeout(400)

    page_path = OUT / f"graph-b-{name}.png"
    graph_path = OUT / f"graph-b-{name}-stage.png"
    page.screenshot(path=str(page_path), full_page=False)
    page.locator(".graph-stage").screenshot(path=str(graph_path))

    overflow = page.evaluate(
        "() => document.documentElement.scrollWidth - document.documentElement.clientWidth"
    )
    selected_title = page.locator(".graph-detail h3").first.inner_text()
    relation_count = page.locator(".graph-relation-row").count()
    neighbor_count = page.locator(".graph-neighbor").count()
    signal = image_signal(graph_path)

    return {
        "name": name,
        "screenshot": str(page_path),
        "stage": str(graph_path),
        "overflow": overflow,
        "selected_title": selected_title,
        "relation_count": relation_count,
        "neighbor_count": neighbor_count,
        "stage_nonblank": signal["unique"] > 30 and signal["stdev"] > 2,
        "stage_signal": signal,
    }


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    results = [
        check_graph(page, "desktop", 1440, 1000),
        check_graph(page, "mobile", 390, 844),
    ]
    browser.close()

for result in results:
    print(result)

if not all(
    r["overflow"] <= 1
    and r["selected_title"] == "Transformer Attention"
    and r["relation_count"] > 0
    and r["stage_nonblank"]
    for r in results
):
    raise SystemExit(1)
