from __future__ import annotations

import argparse
import json
import re
import tarfile
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path


class HTMLAuditParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.ids: list[str] = []
        self.links: list[tuple[str, str]] = []
        self.images_without_alt = 0
        self.has_lang = False
        self.inline_scripts: list[str] = []
        self._script: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag == "html" and values.get("lang"):
            self.has_lang = True
        if values.get("id"):
            self.ids.append(values["id"] or "")
        for attr in ("href", "src"):
            if values.get(attr):
                self.links.append((attr, values[attr] or ""))
        if tag == "img" and not (values.get("alt") or "").strip():
            self.images_without_alt += 1
        if tag == "script" and not values.get("src"):
            self._script = []

    def handle_endtag(self, tag: str) -> None:
        if tag == "script" and self._script is not None:
            self.inline_scripts.append("".join(self._script))
            self._script = None

    def handle_data(self, data: str) -> None:
        if self._script is not None:
            self._script.append(data)


def parse_xml_bytes(name: str, data: bytes, errors: list[str]) -> ET.Element | None:
    try:
        return ET.fromstring(data)
    except Exception as exc:
        errors.append(f"XML parse error: {name}: {exc}")
        return None


def audit_mbz(path: Path) -> dict:
    result: dict = {"path": str(path), "errors": [], "warnings": []}
    try:
        with tarfile.open(path, "r:*") as tf:
            members = [m for m in tf.getmembers() if m.isfile()]
            names = [m.name.replace("\\", "/") for m in members]
            blobs = {name: tf.extractfile(m).read() for name, m in zip(names, members)}
    except Exception as exc:
        result["errors"].append(f"Archive open error: {exc}")
        return result

    result["archive_format"] = "tar"
    result["file_count"] = len(names)
    required = {"moodle_backup.xml", "course/course.xml", "files.xml"}
    for missing in sorted(required - set(names)):
        result["errors"].append(f"Missing required file: {missing}")

    roots = {}
    for name, data in blobs.items():
        if name.lower().endswith(".xml"):
            root = parse_xml_bytes(name, data, result["errors"])
            if root is not None:
                roots[name] = root

    manifest = roots.get("moodle_backup.xml")
    if manifest is None:
        return result
    settings_nodes = manifest.findall("./information/settings/setting")
    malformed_settings = [s for s in settings_nodes if not (s.findtext("level") or "").strip()]
    if malformed_settings:
        result["errors"].append(f"Settings without level: {len(malformed_settings)}")
    settings = {s.findtext("name"): s.findtext("value") for s in settings_nodes if s.findtext("level") == "root"}
    if not manifest.find("./information/details/detail").attrib.get("backup_id"):
        result["errors"].append("Backup detail is missing the backup_id attribute")

    activity_nodes = manifest.findall("./information/contents/activities/activity")
    section_nodes = manifest.findall("./information/contents/sections/section")
    activities = {}
    for a in activity_nodes:
        cmid = (a.findtext("moduleid") or "").strip()
        directory = (a.findtext("directory") or "").strip()
        if not directory:
            result["errors"].append(f"Activity {cmid}: missing directory element")
            continue
        activities[cmid] = directory
        for req in ("module.xml", "inforef.xml", "roles.xml"):
            if f"{directory}/{req}" not in blobs:
                result["errors"].append(f"Activity {cmid}: missing {directory}/{req}")
        modname = (a.findtext("modulename") or "").strip()
        if f"{directory}/{modname}.xml" not in blobs:
            result["errors"].append(f"Activity {cmid}: missing {modname}.xml")

    section_sequences: list[str] = []
    for s in section_nodes:
        directory = (s.findtext("directory") or "").strip()
        sx = roots.get(f"{directory}/section.xml")
        if sx is None:
            result["errors"].append(f"Missing section XML: {directory}/section.xml")
            continue
        seq = [x for x in (sx.findtext("sequence") or "").split(",") if x]
        section_sequences.extend(seq)
        for cmid in seq:
            if cmid not in activities:
                result["errors"].append(f"Section sequence references missing activity {cmid}")
    missing_seq = sorted(set(activities) - set(section_sequences))
    dup_seq = [x for x, n in Counter(section_sequences).items() if n > 1]
    if missing_seq:
        result["errors"].append(f"Activities absent from section sequences: {missing_seq}")
    if dup_seq:
        result["errors"].append(f"Activities repeated in section sequences: {dup_seq}")

    quiz_dirs = [d for d in activities.values() if d.startswith("activities/quiz_")]
    questions = roots.get("questions.xml")
    qcount = 0 if questions is None else len(questions.findall(".//question"))
    result["quiz_count"] = len(quiz_dirs)
    result["question_count"] = qcount
    empty_quizzes = []
    for directory in quiz_dirs:
        qroot = roots.get(f"{directory}/quiz.xml")
        slots = [] if qroot is None else qroot.findall(".//question_instance") + qroot.findall(".//slot")
        if not slots:
            empty_quizzes.append(directory)

    if settings.get("questionbank") == "1" and qcount == 0:
        result["errors"].append("questionbank=1 but the backup has an empty question bank")
    elif empty_quizzes:
        result["warnings"].append(f"{len(empty_quizzes)} quiz templates contain no slots; import GIFT and populate them after restore")
    files_root = roots.get("files.xml")
    fcount = 0 if files_root is None else len(files_root.findall(".//file"))
    result["stored_file_records"] = fcount
    payload_files = [n for n in names if n.startswith("files/")]
    result["stored_file_payloads"] = len(payload_files)
    result["activity_count"] = len(activity_nodes)
    result["section_count"] = len(section_nodes)
    result["types"] = dict(Counter((a.findtext("modulename") or "") for a in activity_nodes))
    grade_total = 0.0
    for directory in activities.values():
        kind = directory.split("/", 1)[-1].split("_", 1)[0]
        if kind not in {"assign", "quiz"}:
            continue
        aroot = roots.get(f"{directory}/{kind}.xml")
        if aroot is not None:
            try:
                grade_total += float(aroot.findtext(f"./{kind}/grade") or 0)
            except ValueError:
                result["errors"].append(f"{directory}: invalid grade value")
    result["maximum_grade_total"] = grade_total
    if grade_total != 100:
        result["warnings"].append(f"Maximum grades total {grade_total:g}, not 100")
    return result


def audit_html(root: Path) -> dict:
    files = sorted(root.rglob("*.html"))
    issues = []
    script_count = 0
    for path in files:
        text = path.read_text(encoding="utf-8-sig")
        parser = HTMLAuditParser()
        try:
            parser.feed(text)
        except Exception as exc:
            issues.append({"file": str(path), "issue": f"HTML parser error: {exc}"})
            continue
        script_count += len(parser.inline_scripts)
        dup = [x for x, n in Counter(parser.ids).items() if n > 1]
        if dup:
            issues.append({"file": str(path), "issue": f"duplicate ids: {dup}"})
        if "<html" in text.lower() and not parser.has_lang:
            issues.append({"file": str(path), "issue": "missing html lang attribute"})
        if parser.images_without_alt:
            issues.append({"file": str(path), "issue": f"images without alt: {parser.images_without_alt}"})
        for attr, url in parser.links:
            if url.startswith(("http://", "https://", "data:", "mailto:", "tel:", "#", "javascript:")):
                continue
            clean = url.split("#", 1)[0].split("?", 1)[0]
            if clean and not (path.parent / clean).exists():
                issues.append({"file": str(path), "issue": f"broken local {attr}: {url}"})
        for pattern, label in [
            (r"\beval\s*\(", "eval()"),
            (r"document\.write\s*\(", "document.write()"),
            (r"<iframe\b", "iframe"),
            (r"\bon(?:error|load)\s*=", "inline event handler"),
        ]:
            if re.search(pattern, text, re.I):
                issues.append({"file": str(path), "issue": label})
    return {"file_count": len(files), "inline_script_count": script_count, "issues": issues}


def audit_docx(path: Path) -> dict:
    result = {"path": str(path), "errors": [], "stats": {}}
    try:
        with zipfile.ZipFile(path) as zf:
            bad = zf.testzip()
            if bad:
                result["errors"].append(f"Corrupt OOXML member: {bad}")
            names = set(zf.namelist())
            doc = ET.fromstring(zf.read("word/document.xml"))
            ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
            result["stats"] = {
                "paragraphs": len(doc.findall(".//w:p", ns)),
                "tables": len(doc.findall(".//w:tbl", ns)),
                "images": len([n for n in names if n.startswith("word/media/")]),
                "sections": len(doc.findall(".//w:sectPr", ns)),
                "has_comments": "word/comments.xml" in names,
            }
    except Exception as exc:
        result["errors"].append(str(exc))
    return result


def audit_gift(path: Path) -> dict:
    text = path.read_text(encoding="utf-8-sig")
    titles = re.findall(r"(?m)^::([^:\r\n]+)::", text)
    categories = re.findall(r"(?m)^\$CATEGORY:\s*(.+?)\s*$", text)
    category_counts = {}
    current = None
    for line in text.splitlines():
        if line.startswith("$CATEGORY:"):
            current = line.split(":", 1)[1].strip()
            category_counts.setdefault(current, 0)
        elif line.startswith("::") and current:
            category_counts[current] += 1
    suspicious_answer_lines = []
    for line_no, line in enumerate(text.splitlines(), 1):
        stripped = line.strip()
        if not stripped.startswith(("=", "~")):
            continue
        payload = re.sub(r"^[=~](?:%-?\d+(?:\.\d+)?%)?", "", stripped)
        if re.search(r"(?<!\\)[=#{}~]", payload):
            suspicious_answer_lines.append(line_no)
    return {
        "path": str(path),
        "question_title_count": len(titles),
        "duplicate_titles": [x for x, n in Counter(titles).items() if n > 1],
        "categories": categories,
        "questions_per_category": category_counts,
        "brace_balance": text.count("{") - text.count("}"),
        "answer_lines_with_unescaped_specials": suspicious_answer_lines,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("root", type=Path)
    args = ap.parse_args()
    root = args.root.resolve()
    mbz = sorted(root.glob("*.mbz"))
    gifts = sorted(root.glob("01_Moodle_Import_Assets/*.txt"))
    docx = sorted(root.glob("*.docx"))
    report = {
        "root": str(root),
        "mbz": [audit_mbz(p) for p in mbz],
        "html": audit_html(root),
        "gift": [audit_gift(p) for p in gifts],
        "docx": [audit_docx(p) for p in docx],
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
