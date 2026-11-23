"""Local-only PDF inventory. Never uploads source content or writes into source folders."""
import argparse
import hashlib
import json
import logging
from pathlib import Path
from pypdf import PdfReader


class WarningCounter(logging.Handler):
    def __init__(self):
        super().__init__(logging.WARNING)
        self.count = 0
    def emit(self, record):
        self.count += 1


def inspect_pdf(path):
    path = Path(path)
    result = {"file": path.name, "sha256": None, "pages": []}
    try:
        result["sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
        reader = PdfReader(path)
        for number, page in enumerate(reader.pages, 1):
            try:
                counter = WarningCounter()
                logger = logging.getLogger("pypdf")
                previous_propagate = logger.propagate
                logger.addHandler(counter)
                logger.propagate = False
                try:
                    text = page.extract_text() or ""
                finally:
                    logger.removeHandler(counter)
                    logger.propagate = previous_propagate
                result["pages"].append({"pdfPage": number, "characters": len(text.strip()), "extractionWarnings": counter.count,
                    "status": "text_extracted_unverified" if len(text.strip()) >= 50 else "needs_ocr_or_visual_review"})
            except Exception as error:
                result["pages"].append({"pdfPage": number, "status": "unreadable", "error": type(error).__name__})
    except Exception as error:
        result["error"] = type(error).__name__
    result["pageCount"] = len(result["pages"])
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_dir", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    # Reject output paths under source_dir so original reference material stays read-only.
    if args.output.resolve().is_relative_to(args.source_dir.resolve()):
        parser.error("Output must be outside the source directory")
    records = [inspect_pdf(p) for p in sorted(args.source_dir.glob("*.pdf"))]
    if not records:
        parser.error("No PDF files found")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({"version": 1, "documents": records}, indent=2) + "\n")
    for record in records:
        counts = {s: sum(p["status"] == s for p in record["pages"]) for s in
            ["text_extracted_unverified", "needs_ocr_or_visual_review", "unreadable"]}
        print(record["file"], record["pageCount"], counts, record.get("error", ""))
