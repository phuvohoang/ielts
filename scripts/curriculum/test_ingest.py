import tempfile
import unittest
from pathlib import Path
from pypdf import PdfWriter
from unittest.mock import Mock, patch
from ingest import inspect_pdf

class IngestionTests(unittest.TestCase):
    def test_blank_pages_keep_exact_provenance_and_need_review(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "scan.pdf"
            writer = PdfWriter()
            writer.add_blank_page(width=300, height=400)
            writer.add_blank_page(width=300, height=400)
            writer.write(path)
            result = inspect_pdf(path)
            self.assertEqual(result["pageCount"], 2)
            self.assertEqual([p["pdfPage"] for p in result["pages"]], [1, 2])
            self.assertTrue(all(p["status"] == "needs_ocr_or_visual_review" for p in result["pages"]))
            self.assertEqual(len(result["sha256"]), 64)
            self.assertEqual(result, inspect_pdf(path))
    def test_missing_file_and_unreadable_page_are_reported(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "missing.pdf"
            self.assertEqual(inspect_pdf(path)["error"], "FileNotFoundError")
            path.write_bytes(b"fixture")
            broken, readable = Mock(), Mock()
            broken.extract_text.side_effect = ValueError("bad page")
            readable.extract_text.return_value = "Readable page text " * 10
            with patch("ingest.PdfReader", return_value=Mock(pages=[broken, readable])):
                pages = inspect_pdf(path)["pages"]
            self.assertEqual(pages[0]["pdfPage"], 1)
            self.assertEqual(pages[0]["status"], "unreadable")
            self.assertEqual(pages[1]["pdfPage"], 2)
            self.assertEqual(pages[1]["status"], "text_extracted_unverified")

    def test_corrupt_pdf_is_not_silently_skipped(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "broken.pdf"
            path.write_bytes(b"%PDF-1.7\ninvalid")
            result = inspect_pdf(path)
            self.assertIn("error", result)
            self.assertEqual(result["pageCount"], 0)

if __name__ == "__main__":
    unittest.main()
