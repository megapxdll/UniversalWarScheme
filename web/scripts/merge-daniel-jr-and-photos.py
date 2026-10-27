# -*- coding: utf-8 -*-
"""Merge Daniel Jr cards, delete Sul, assign new photos."""
from __future__ import annotations

import hashlib
import re
import shutil
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VAULT = ROOT / "Universe War History"
CHARS = VAULT / "01_Characters"
IMAGES = ROOT / "images"
ASSETS = VAULT / "08_Assets" / "characters"
PUBLIC = ROOT / "web" / "public" / "canon-images"

CYR = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo", "ж": "zh",
    "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o",
    "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "kh", "ц": "ts",
    "ч": "ch", "ш": "sh", "щ": "shch", "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu",
    "я": "ya",
}


def slugify(text: str) -> str:
    out = "".join(CYR.get(ch, ch) for ch in text.strip().lower())
    folded = "".join(c for c in unicodedata.normalize("NFD", out) if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", folded).strip("-")


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def copy_img(src: Path) -> str:
    ASSETS.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    digest = sha(src)
    for folder in (ASSETS, PUBLIC):
        for existing in folder.glob("*.*"):
            if existing.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"} and sha(existing) == digest:
                if not (ASSETS / existing.name).exists():
                    shutil.copy2(src, ASSETS / existing.name)
                if not (PUBLIC / existing.name).exists():
                    shutil.copy2(src, PUBLIC / existing.name)
                return existing.name
    dest = slugify(src.stem) + src.suffix.lower()
    stem, ext = Path(dest).stem, Path(dest).suffix
    i = 0
    while (ASSETS / dest).exists() or (PUBLIC / dest).exists():
        if (ASSETS / dest).exists() and sha(ASSETS / dest) == digest:
            if not (PUBLIC / dest).exists():
                shutil.copy2(src, PUBLIC / dest)
            return dest
        i += 1
        dest = f"{stem}-{i}{ext}"
    shutil.copy2(src, ASSETS / dest)
    shutil.copy2(src, PUBLIC / dest)
    return dest


def split_fm(text: str) -> tuple[str, str]:
    end = text.find("\n---", 3)
    return text[4:end], text[end + 4 :]


def set_aliases(fm: str, aliases: list[str]) -> str:
    rendered = "[" + ", ".join(aliases) + "]"
    if re.search(r"^aliases:", fm, re.M):
        return re.sub(r"^aliases:.*$", f"aliases: {rendered}", fm, count=1, flags=re.M)
    return f"aliases: {rendered}\n" + fm


def set_key(fm: str, key: str, value: str) -> str:
    line = f"{key}: {value}" if value != "" else f"{key}:"
    if re.search(rf"^{re.escape(key)}:", fm, re.M):
        return re.sub(rf"^{re.escape(key)}:.*$", line, fm, count=1, flags=re.M)
    return line + "\n" + fm


def set_family(fm: str, members: list[str]) -> str:
    wiki = ", ".join(f'"[[{m}]]"' for m in members)
    line = f"  семья: [{wiki}]"
    if re.search(r"^  семья:", fm, re.M):
        return re.sub(r"^  семья:.*$", line, fm, count=1, flags=re.M)
    if re.search(r"^связи:", fm, re.M):
        return re.sub(r"^(связи:\n)", rf"\1{line}\n", fm, count=1, flags=re.M)
    return fm


def set_looks(fm: str, portrait: str, looks: list[tuple[str, str]]) -> str:
    fm = re.sub(r"^портрет:.*\n(?:облики:\n(?:  - файл:.*\n    имя:.*\n)*)?", "", fm, flags=re.M)
    block = f"портрет: {portrait}\nоблики:\n" + "".join(
        f"  - файл: {f}\n    имя: {n}\n" for f, n in looks
    )
    if re.search(r"^aliases:", fm, re.M):
        return re.sub(r"^(aliases:.*\n)", rf"\1{block}", fm, count=1, flags=re.M)
    return block + fm


def ensure_embed(body: str, portrait: str) -> str:
    if f"![[{portrait}]]" in body:
        return body
    return re.sub(r"^(# .+)\n", rf"\1\n\n![[{portrait}]]\n", body, count=1)


def write_card(path: Path, fm: str, body: str) -> None:
    path.write_text("---\n" + fm.strip() + "\n---" + body, encoding="utf-8")


# --- merge ---
path = CHARS / "Titania Characters" / "Дэниель младший.md"
fm, body = split_fm(path.read_text(encoding="utf-8"))
fm = set_aliases(fm, ["Дэниель младший", "Сын Дэниеля 1", "сын Дэниеля", "Daniel Jr"])
fm = set_key(fm, "имя", "Дэниель младший")
fm = set_key(fm, "роль", "сын Дэниеля 1; показан с эпохи XV")
fm = set_family(fm, ["Дэниель 1", "Сакура"])
port_m = re.search(r"^портрет: (.+)$", fm, re.M)
looks_m = re.findall(r"  - файл: (.+)\n    имя: (.+)", fm)
body = """
# Дэниель младший

## Профиль
- ФИО: Дэниель младший
- Наименование: сын Дэниеля 1
- Пол: мужской
- Место рождения: [[Титания]]
- Жизненный статус: новобранец
- Фракция: [[Боевая Академия Титанов]]
- Роль: сын [[Дэниель 1]]; карточка «Сын Дэниеля 1» слита сюда

## Боевая статистика
- Тип способностей: сын Дэниеля
- Основное оружие: катана
- Боевой стиль: манипуляция магией огня, усиление магией огня, око мантры, энерго сфера, клонирование, управление потоком маны, взрывная искра
- Сила: 9
- Скорость: 9
- Выносливость: 7
- Интеллект: 7
- Общий показатель: 32

## Связи
- Семья:
  - [[Дэниель 1]] (отец)
  - [[Сакура]] (мать / поздняя семейная линия)
- Друзья:
  - [[Персонажи герои Титании]]
  - [[Новое поколение]]
- Напарники:
  - [[Персонажи герои Титании]]
  - [[Новое поколение]]

## Арка по периодам
- [[Эпоха XV — Тихая война Тьмы]]: появляется в кадре вместе с [[Макс Кун|Максом Куном]].

## Заметки
- Один человек: бывшие карточки «Сын Дэниеля 1» и «Дэниель младший» слиты.
- Карточки Дэниеля 2–5 сняты ранее.
"""
if port_m and port_m.group(1).strip():
    portrait = port_m.group(1).strip()
    looks = looks_m or [(portrait, "основной")]
    fm = set_looks(fm, portrait, looks)
    body = ensure_embed(body, portrait)
write_card(path, fm, body)
print("merged into Дэниель младший")

d1 = CHARS / "Titania Characters" / "Дэниель 1.md"
t = d1.read_text(encoding="utf-8")
if "Дэниель младший" not in t:
    fm1, body1 = split_fm(t)
    if re.search(r"^  семья:", fm1, re.M):
        def add_son(m: re.Match[str]) -> str:
            inner = m.group(1)
            if "Дэниель младший" in inner:
                return m.group(0)
            if inner.strip():
                return f'  семья: [{inner}, "[[Дэниель младший]]"]'
            return '  семья: ["[[Дэниель младший]]"]'

        fm1 = re.sub(r"^  семья: \[(.*)\]$", add_son, fm1, count=1, flags=re.M)
    else:
        fm1 = set_family(fm1, ["Дэниель младший", "Сакура"])
    if "Дэниель младший" not in body1:
        body1 = body1.rstrip() + "\n\n## Заметки\n- Сын: [[Дэниель младший]] (он же «Сын Дэниеля 1»).\n"
    write_card(d1, fm1, body1)
    print("updated Дэниель 1")

sakura = CHARS / "Titania Characters" / "Сакура.md"
st = sakura.read_text(encoding="utf-8")
st2 = st.replace(
    "- Семья с [[Дэниель младший|Дэниелем младшим]] — поздняя линия; карточки Дэниеля 2–5 пока сняты. Не путать с романом эпохи Академии.",
    "- Семья с [[Дэниель младший|Дэниелем младшим]] (сын [[Дэниель 1|Дэниеля 1]], он же «Сын Дэниеля 1») — поздняя линия. Не путать с романом эпохи Академии.",
)
if st2 != st:
    sakura.write_text(st2, encoding="utf-8")
    print("updated Сакура")

for rel in ["Titania Characters/Сын Дэниеля 1.md", "Titania Characters/Сул.md"]:
    p = CHARS / rel
    if p.exists():
        p.unlink()
        print("deleted", rel)

REPLACES = [
    ("[[Сын Дэниеля 1]]", "[[Дэниель младший]]"),
    ("[[Сын Дэниеля 1|", "[[Дэниель младший|"),
    ("[[Сул]]", ""),
]
for md in VAULT.rglob("*.md"):
    text = md.read_text(encoding="utf-8")
    nxt = text
    for a, b in REPLACES:
        nxt = nxt.replace(a, b)
    nxt = re.sub(r",\s*,", ",", nxt)
    nxt = re.sub(r"\[\s*,", "[", nxt)
    nxt = re.sub(r",\s*\]", "]", nxt)
    nxt = nxt.replace(
        "Не сливать сына Дэниеля 1 с [[Дэниель младший]].",
        "Сын Дэниеля 1 = [[Дэниель младший]] (слиты).",
    )
    nxt = re.sub(
        r"\*\*N29\.\*\*.*",
        "**N29.** Сын Дэниеля 1 = [[Дэниель младший]]. Слиты в одну карточку. Карточки Дэниеля 2–5 сняты.\nРешение: канон автора.",
        nxt,
        count=1,
    )
    nxt = nxt.replace(
        "| [[Дэниель младший]] | имя не закреплено |",
        "| [[Дэниель младший]] | сын Дэниеля 1; алиас «Сын Дэниеля 1» |",
    )
    nxt = nxt.replace(
        "Не подставлять имена сына Дэниеля, правителя Титании",
        "Сын Дэниеля = [[Дэниель младший]]. Не подставлять имена правителя Титании",
    )
    nxt = nxt.replace("Не сливать сына Дэниеля 1 с [[Дэниель младший]]. ", "")
    nxt = nxt.replace("Сын Дэниеля 1 = [[Дэниель младший]]. ", "")  # avoid double if already rewritten oddly
    # restore one clean plan sentence if stripped too hard — handled below on plan file
    if nxt != text:
        md.write_text(nxt, encoding="utf-8")
        print("retarget", md.relative_to(VAULT))

# fix plan constraints carefully
plan = VAULT / "06_Rules" / "План эпох XII–XXII.md"
if plan.exists():
    pt = plan.read_text(encoding="utf-8")
    pt = re.sub(
        r"Сын Дэниеля = \[\[Дэниель младший\]\]\. Не подставлять имена правителя Титании[^\n]*",
        "Сын Дэниеля = [[Дэниель младший]]. Не подставлять имена правителя Титании, Архимага, предводителя Эпсилон, планеты Неро без решения. Карточки Дэниеля 2–5 пока сняты. Война XII — с [[Терракс]], не автоматически со всей планетой и не с [[Ноктеваль]], пока автор не скажет.",
        pt,
        count=1,
    )
    plan.write_text(pt, encoding="utf-8")

oq = VAULT / "06_Rules" / "Открытые вопросы и нестыковки.md"
if oq.exists():
    t = oq.read_text(encoding="utf-8")
    t = re.sub(
        r"\*\*N11\.\*\*[\s\S]*?\nРешение:",
        "**N11.** [[Дэниель 1]] / Дэниел Сольварен vs [[Дэниель младший]] (сын; семья с [[Сакура|Сакурой]], поздняя линия). Карточки Дэниеля 2–5 сняты.\nРешение: младший = сын Дэниеля 1.",
        t,
        count=1,
    )
    t = t.replace(
        "**Q58.** Мать [[Дэниель младший|сына Дэниеля 1]]. Карточки Дэниеля 2–5 пока сняты.",
        "**Q58.** Мать [[Дэниель младший]] — в семейной линии указана [[Сакура]]; подтвердить, если нужно иначе. Карточки Дэниеля 2–5 сняты.",
    )
    if "Сул удалён" not in t and "Карточка Сул" not in t:
        t = t.rstrip() + "\n\n**N34.** Карточка Сул удалена по решению автора.\nРешение: удалена.\n"
    oq.write_text(t, encoding="utf-8")

PHOTO_MAP = [
    ("Steven Drake.png", "The Earth Characters/Оулмен Стивен Дрейк.md", "основной"),
    ("Falcon William Harlow.png", "The Earth Characters/Сокол.md", "основной"),
    ("Slim Fagras.png", "New World Characters/Слим Фаграс.md", "основной"),
    ("Scarlet The Raven's Eye.png", "Titania Characters/Скарлет.md", "основной"),
    ("Sylvana Black Bible Sourcerer.png", "Titania Characters/Сильвана.md", "основной"),
    ("Selma Light Sourcerer.png", "Titania Characters/Сельма.md", "основной"),
    ("Sasha Spilberg.png", "New World Characters/Саша Спилберг.md", "основной"),
    ("Sasha Spilberg 2.png", "New World Characters/Саша Спилберг.md", "2"),
    ("Samurai Ten.png", "Titania Characters/Самурай Тэн.md", "основной"),
    ("Samurai Ten 2.png", "Titania Characters/Самурай Тэн.md", "2"),
    ("Pickard.png", "New World Characters/Пикард.md", "основной"),
    ("Natasha Frolova.png", "The Earth Characters/Наташа Фролова.md", "основной"),
    ("Natasha Frolova 2.png", "The Earth Characters/Наташа Фролова.md", "2"),
    ("Salamon - DeathGhost.png", "New World Characters/Саламон (дух).md", "DeathGhost"),
    ("Elder Nero 3.png", "The Earth Characters/Неро 3.md", "Elder"),
]

assigned: dict[str, list[tuple[str, str]]] = {}
missing: list[str] = []
for fname, rel, label in PHOTO_MAP:
    src = IMAGES / fname
    if not src.exists():
        missing.append(fname)
        continue
    dest = copy_img(src)
    assigned.setdefault(rel, []).append((dest, label))
print("missing sources", missing)

for rel, looks in assigned.items():
    path = CHARS / rel
    if not path.exists():
        print("MISSING CARD", rel)
        continue
    text = path.read_text(encoding="utf-8")
    fm, body = split_fm(text)
    old = re.findall(r"  - файл: (.+)\n    имя: (.+)", fm)
    old_port = re.search(r"^портрет: (.+)$", fm, re.M)
    merged: list[tuple[str, str]] = []
    seen: set[str] = set()
    for f, n in looks + old:
        if f in seen:
            continue
        seen.add(f)
        merged.append((f, n))
    if "Неро 3" in rel and old_port and old_port.group(1).strip():
        portrait = old_port.group(1).strip()
        merged = [(portrait, "человек")] + [(f, n) for f, n in merged if f != portrait]
    else:
        portrait = looks[0][0]
    fm = set_looks(fm, portrait, merged)
    body = ensure_embed(body, portrait)
    if "Сокол" in rel:
        fm = set_key(fm, "имя", "Уильям Харлоу")
        fm = set_key(fm, "имя_en", "William Harlow")
        if re.search(r"^- ФИО:", body, re.M):
            body = re.sub(r"^- ФИО:.*$", "- ФИО: Уильям Харлоу", body, count=1, flags=re.M)
        if re.search(r"^- ФИО \(англ\.\):", body, re.M):
            body = re.sub(r"^- ФИО \(англ\.\):.*$", "- ФИО (англ.): William Harlow", body, count=1, flags=re.M)
        elif re.search(r"^- ФИО:", body, re.M):
            body = re.sub(r"^(- ФИО:.*\n)", r"\1- ФИО (англ.): William Harlow\n", body, count=1, flags=re.M)
    if "Оулмен" in rel:
        fm = set_key(fm, "имя_en", "Steven Drake")
    write_card(path, fm, body)
    print("photos", rel, [x[0] for x in merged])

print("ASK: Sol.png")
print("SKIP: ChatGPT Image (academy style)")
print("DONE")
