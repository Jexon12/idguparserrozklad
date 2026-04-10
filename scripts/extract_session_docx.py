import json
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime


def clean(s: str) -> str:
    s = "".join(ch for ch in s if ch >= " " or ch in "\n\t")
    s = s.replace("\u200e", "").replace("\u200f", "")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def parse_groups(heading: str):
    if not heading:
        return []
    tokens = re.findall(r"\d{1,3}\s*\w*", heading)
    out = []
    for token in tokens:
        token = clean(token)
        token = re.sub(r"(?<=\d)(?=\D)", " ", token)
        token = clean(token)
        if token and token not in out:
            out.append(token)
    return out


def extract(docx_path: str):
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    with zipfile.ZipFile(docx_path) as zf:
        xml_bytes = zf.read("word/document.xml")
    root = ET.fromstring(xml_bytes)
    body = root.find("w:body", ns)

    def txt(el):
        return clean("".join(t.text or "" for t in el.findall(".//w:t", ns)))

    items = []
    paragraph_buffer = []
    table_idx = 0

    for child in body:
        tag = child.tag.split("}")[-1]
        if tag == "p":
            t = txt(child)
            if t:
                paragraph_buffer.append(t)
            continue

        if tag != "tbl":
            continue

        table_idx += 1
        heading = paragraph_buffer[0] if paragraph_buffer else ""
        meta_lines = paragraph_buffer[1:] if len(paragraph_buffer) > 1 else []
        groups = parse_groups(heading)
        speciality = "; ".join([m for m in meta_lines if ":" in m and ("освіт" not in m.lower())])
        program = "; ".join([m for m in meta_lines if "освіт" in m.lower()])
        paragraph_buffer = []

        control_type = ""
        row_idx = 0
        for tr in child.findall("./w:tr", ns):
            cells = [txt(tc) for tc in tr.findall("./w:tc", ns)]
            if not cells:
                continue
            row_idx += 1
            if row_idx == 1:
                continue
            while len(cells) < 7:
                cells.append("")

            non_empty = [c for c in cells if c]
            if len(non_empty) == 1 and cells[1]:
                control_type = cells[1]
                continue
            if not cells[1]:
                continue

            items.append(
                {
                    "groupHeading": heading,
                    "groups": groups,
                    "speciality": speciality,
                    "program": program,
                    "controlType": control_type,
                    "discipline": cells[1],
                    "examForm": cells[2],
                    "teacher": cells[3],
                    "date": cells[4],
                    "time": cells[5],
                    "room": cells[6],
                    "sourceTable": table_idx,
                }
            )

    return items


def main():
    if len(sys.argv) < 3:
        print("Usage: python scripts/extract_session_docx.py <input.docx> <output.json>")
        raise SystemExit(1)

    input_docx = sys.argv[1]
    output_json = sys.argv[2]

    items = extract(input_docx)
    data = {
        "sourceFile": os.path.basename(input_docx),
        "generatedAt": datetime.now().isoformat(),
        "term": "Winter session 2025-26",
        "items": items,
    }

    os.makedirs(os.path.dirname(output_json), exist_ok=True)
    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"Saved {len(items)} items -> {output_json}")


if __name__ == "__main__":
    main()
