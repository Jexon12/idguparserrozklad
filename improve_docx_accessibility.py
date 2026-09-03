import re
from pathlib import Path

from docx import Document


PATH = Path(r"C:\Users\0009\.gemini\antigravity\scratch\schedule-viewer\.montage_work\Повний_курс_лекцій_Монтаж_та_обслуговування_КС_2025_2026.docx")

ALT_TEXTS = [
    "Структурна схема компонентів сучасної комп'ютерної системи",
    "Схема підсистеми живлення процесора VRM",
    "Схема організації робочого місця із захистом від електростатичного розряду",
    "Схема завантаження системи з UEFI та діагностикою POST",
    "Схема розмітки накопичувача GPT для завантаження UEFI",
    "Послідовність провідників у конекторі 8P8C за схемою T568B",
    "Схема резервного копіювання за правилом 3-2-1-1-0",
]


doc = Document(PATH)
if len(doc.inline_shapes) != len(ALT_TEXTS):
    raise RuntimeError(f"Expected {len(ALT_TEXTS)} images, found {len(doc.inline_shapes)}")

for shape, alt in zip(doc.inline_shapes, ALT_TEXTS):
    shape._inline.docPr.set("descr", alt)
    shape._inline.docPr.set("title", alt)

h1 = re.compile(r"^(ЛЕКЦІЯ\s+\d+\.|СПИСОК РЕКОМЕНДОВАНОЇ ЛІТЕРАТУРИ)")
h2 = re.compile(r"^\d+\.\d+\.\s")
heading_counts = {"Heading 1": 0, "Heading 2": 0}
for paragraph in doc.paragraphs:
    text = paragraph.text.strip()
    if h1.match(text):
        paragraph.style = "Heading 1"
        heading_counts["Heading 1"] += 1
    elif h2.match(text):
        paragraph.style = "Heading 2"
        heading_counts["Heading 2"] += 1

doc.save(PATH)
print({"images": len(ALT_TEXTS), "headings": heading_counts})
