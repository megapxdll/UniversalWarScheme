# -*- coding: utf-8 -*-
"""Rewrite Night Knight lineage, delete wrong cards, assign named photos."""
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
                return existing.name
    dest = slugify(src.stem) + src.suffix.lower()
    stem, ext = Path(dest).stem, Path(dest).suffix
    i = 0
    while (ASSETS / dest).exists() or (PUBLIC / dest).exists():
        if (ASSETS / dest).exists() and sha(ASSETS / dest) == digest:
            return dest
        i += 1
        dest = f"{stem}-{i}{ext}"
    shutil.copy2(src, ASSETS / dest)
    shutil.copy2(src, PUBLIC / dest)
    return dest


def split_fm(text: str) -> tuple[str, str]:
    end = text.find("\n---", 3)
    return text[4:end], text[end + 4 :]


def set_key(fm: str, key: str, value: str) -> str:
    pat = re.compile(rf"^{re.escape(key)}:.*$", re.M)
    line = f"{key}: {value}" if value != "" else f"{key}:"
    if pat.search(fm):
        return pat.sub(line, fm, count=1)
    # insert after aliases or at top of fields
    if re.search(r"^aliases:", fm, re.M):
        return re.sub(r"^(aliases:.*\n)", rf"\1{line}\n", fm, count=1, flags=re.M)
    return line + "\n" + fm


def set_aliases(fm: str, aliases: list[str]) -> str:
    rendered = "[" + ", ".join(aliases) + "]" if aliases else "[]"
    if re.search(r"^aliases:", fm, re.M):
        return re.sub(r"^aliases:.*$", f"aliases: {rendered}", fm, count=1, flags=re.M)
    return f"aliases: {rendered}\n" + fm


def set_looks(fm: str, portrait: str, looks: list[tuple[str, str]]) -> str:
    fm = re.sub(r"^портрет:.*\n(?:облики:\n(?:  - файл:.*\n    имя:.*\n)*)?", "", fm, flags=re.M)
    block = f"портрет: {portrait}\nоблики:\n" + "".join(f"  - файл: {f}\n    имя: {n}\n" for f, n in looks)
    if re.search(r"^aliases:", fm, re.M):
        return re.sub(r"^(aliases:.*\n)", rf"\1{block}", fm, count=1, flags=re.M)
    return block + fm


def set_family(fm: str, members: list[str]) -> str:
    wiki = ", ".join(f'"[[{m}]]"' for m in members)
    line = f"  семья: [{wiki}]"
    if re.search(r"^  семья:", fm, re.M):
        return re.sub(r"^  семья:.*$", line, fm, count=1, flags=re.M)
    if re.search(r"^связи:", fm, re.M):
        return re.sub(r"^(связи:\n)", rf"\1{line}\n", fm, count=1, flags=re.M)
    return fm


def set_romance(fm: str, members: list[str]) -> str:
    wiki = ", ".join(f'"[[{m}]]"' for m in members)
    line = f"  романтика: [{wiki}]" if members else "  романтика: []"
    if re.search(r"^  романтика:", fm, re.M):
        return re.sub(r"^  романтика:.*$", line, fm, count=1, flags=re.M)
    if re.search(r"^  семья:", fm, re.M):
        return re.sub(r"^(  семья:.*\n)", rf"\1{line}\n", fm, count=1, flags=re.M)
    return fm


def ensure_embed(body: str, portrait: str) -> str:
    if f"![[{portrait}]]" in body:
        return body
    return re.sub(r"^(# .+)\n", rf"\1\n\n![[{portrait}]]\n", body, count=1)


def replace_profile(body: str, **fields: str) -> str:
    for label, value in fields.items():
        if re.search(rf"^- {re.escape(label)}:", body, re.M):
            body = re.sub(rf"^- {re.escape(label)}:.*$", f"- {label}: {value}", body, count=1, flags=re.M)
        elif label.startswith("ФИО") and re.search(r"^- ФИО:", body, re.M) and label == "ФИО (англ.)":
            body = re.sub(r"^(- ФИО:.*\n)", rf"\1- ФИО (англ.): {value}\n", body, count=1, flags=re.M)
    return body


def write_card(path: Path, fm: str, body: str) -> None:
    path.write_text("---\n" + fm.strip() + "\n---" + body, encoding="utf-8")


# --- photos ---
PHOTO_MAP = [
    ("Maidi Kun 1.png", "The Earth Characters/Тёмный Рыцарь.md", "основной"),
    ("Maidi Kun 2.png", "The Earth Characters/Тёмный Рыцарь.md", "2"),
    ("Nathan Kun.png", "The Earth Characters/Натан кун.md", "основной"),
    ("Nathan Kun 2.png", "The Earth Characters/Натан кун.md", "2"),
    ("Max Kun 1.png", "The Earth Characters/Макс Кун.md", "основной"),
    ("Max Kun 2.png", "The Earth Characters/Макс Кун.md", "2"),
    ("Max Kun 3.png", "The Earth Characters/Макс Кун.md", "3"),
    ("Nina Frai.png", "The Earth Characters/Нина Фрай.md", "основной"),
    ("Lina.png", "The Earth Characters/Лина.md", "основной"),
    ("Lina 2.png", "The Earth Characters/Лина.md", "2"),
    ("Lina 3.png", "The Earth Characters/Лина.md", "3"),
    ("Lina 4.png", "The Earth Characters/Лина.md", "4"),
    ("Keir Last Knight.png", "New World Characters/Ночной рыцарь Термариона.md", "Keir"),
    ("The Last Knight Of Termarion.png", "New World Characters/Ночной рыцарь Термариона.md", "основной"),
    ("The Last Knight Of Termarion 2.png", "New World Characters/Ночной рыцарь Термариона.md", "2"),
    ("Last Night Od Termarion.png", "New World Characters/Ночной рыцарь Термариона.md", "альтернатива"),
    ("Nirida.png", "Titania Characters/Нирида.md", "основной"),
    ("Noir.png", "The Earth Characters/Нуар.md", "основной"),
    ("Noir Hero.png", "The Earth Characters/Нуар.md", "герой"),
    ("Lloyd Drags.png", "New World Characters/Лойд Драгс.md", "основной"),
    ("Ramona One Woman Army.png", "Titania Characters/Рамона.md", "основной"),
    ("Ramona One Woman Army 2.png", "Titania Characters/Рамона.md", "2"),
    ("Moisei.png", "The Earth Characters/Моисей.md", "основной"),
    ("Medina Succubus.png", "The Earth Characters/Медина.md", "основной"),
    ("Alex Whitmore Mage Ninja.png", "The Earth Characters/Маг ниндзя.md", "основной"),
    ("Reaper.png", "Titania Characters/Рипер.md", "основной"),
    ("Snake.png", "The Earth Characters/Снейк Джихан Ким.md", "основной"),
    ("Deimon Cornell.png", "The Earth Characters/Преемник Дэниеля.md", "основной"),
    ("Striker.png", "The Earth Characters/Страйкер Вильям Гроссман.md", "основной"),
    ("Orryx.png", "The Earth Characters/Инопланетный разрушитель.md", "основной"),
    ("Viktor Zorin.png", "The Earth Characters/Смоук.md", "основной"),
    ("Nero 1.png", "The Earth Characters/Неро 1.md", "основной"),
    ("Nero 1 electrolyzed.png", "The Earth Characters/Неро 1.md", "электролиз"),
    ("Nero 2.png", "The Earth Characters/Неро 2.md", "основной"),
    ("Nero 3 human.png", "The Earth Characters/Неро 3.md", "человек"),
    ("Nero 3 UnHuman force.png", "The Earth Characters/Неро 3.md", "нечеловек"),
    ("Nero 4.png", "The Earth Characters/Неро 4.md", "основной"),
    ("Nero 5.png", "The Earth Characters/Неро 5.md", "основной"),
]

assigned: dict[str, list[tuple[str, str]]] = {}
unknown_src = []
for fname, rel, label in PHOTO_MAP:
    src = IMAGES / fname
    if not src.exists():
        unknown_src.append(fname)
        continue
    dest = copy_img(src)
    assigned.setdefault(rel, []).append((dest, label))

print("missing sources", unknown_src)

for rel, looks in assigned.items():
    path = CHARS / rel
    if not path.exists():
        print("MISSING CARD", rel)
        continue
    text = path.read_text(encoding="utf-8")
    fm, body = split_fm(text)
    portrait = looks[0][0]
    fm = set_looks(fm, portrait, looks)
    body = ensure_embed(body, portrait)
    # drop old Облик section duplicates later if needed
    write_card(path, fm, body)
    print("photos", rel, [x[0] for x in looks])


# --- rewrite knight cards ---
# 1) Maidi / Тёмный Рыцарь
path = CHARS / "The Earth Characters/Тёмный Рыцарь.md"
fm, body = split_fm(path.read_text(encoding="utf-8"))
fm = set_aliases(fm, ["Тёмный Рыцарь", "Ночной рыцарь", "ночной рыцарь 1"])
fm = set_key(fm, "имя", "Мэйди Кун")
fm = set_key(fm, "имя_en", "Maidi Kun")
fm = set_key(fm, "роль", "первый ночной рыцарь; первый носитель силы")
fm = set_family(fm, ["Виктория Джи", "Натан Кун", "Макс Кун"])
fm = set_romance(fm, ["Виктория Джи"])
body = replace_profile(
    body,
    **{
        "ФИО": "Мэйди Кун",
        "ФИО (англ.)": "Maidi Kun",
        "Наименование": "Тёмный Рыцарь, Ночной рыцарь 1",
        "Роль": "первый ночной рыцарь; первый носитель силы",
    },
)
# update family section + notes
body = re.sub(
    r"(## Связи\n- Семья:\n)(?:  - .*\n)*",
    r"\1  - [[Виктория Джи]]\n  - [[Натан Кун]] (сын)\n  - [[Макс Кун]] (внук)\n",
    body,
    count=1,
)
if "Ночной рыцарь 1" not in body:
    body = body.rstrip() + "\n\n## Заметки (линейка)\n- Ночной рыцарь 1. Жена — [[Виктория Джи]]. Сын — [[Натан Кун]]. Карточка [[Мэд Кун]] удалена как дубль.\n"
write_card(path, fm, body)

# 2) Nathan
path = CHARS / "The Earth Characters/Натан кун.md"
fm, body = split_fm(path.read_text(encoding="utf-8"))
fm = set_aliases(fm, ["Натан Кун", "Сын Мэйди и Виктории", "ночной рыцарь 2"])
fm = set_key(fm, "имя", "Натан Кун")
fm = set_key(fm, "имя_en", "Nathan Kun")
fm = set_key(fm, "роль", "второй ночной рыцарь; сын Мэйди и Виктории")
fm = set_key(fm, "жизненный статус", "жив")
fm = set_key(fm, "фракция", '"[[Защитники Земли]]"')
# combat: Bo
if re.search(r"^боевая статистика:", fm, re.M):
    fm = re.sub(r"(^боевая статистика:\n(?:  .*\n)*)", "", fm, count=1, flags=re.M)
fm += """
боевая статистика:
  тип способностей: второй ночной рыцарь
  основное оружие: бо
  боевой стиль: "регенерация, усиленное тело, экзокостюм; основное оружие — бо"
  параметры:
    сила: 7
    скорость: 6
    выносливость: 10
    интеллект: 10
    общий показатель: 33
"""
fm = set_family(fm, ["Тёмный Рыцарь", "Виктория Джи", "Нина Фрай", "Макс Кун"])
fm = set_romance(fm, ["Нина Фрай"])
body = f"""
# Натан Кун

## Профиль
- ФИО: Натан Кун
- ФИО (англ.): Nathan Kun
- Наименование: ночной рыцарь 2, сын Мэйди
- Пол: мужской
- Место рождения: [[Земля]]
- Жизненный статус: жив
- Фракция: [[Защитники Земли]]
- Роль: второй ночной рыцарь; сын [[Тёмный Рыцарь|Мэйди Куна]] и [[Виктория Джи|Виктории Джи]]

## Боевая статистика
- Тип способностей: второй ночной рыцарь
- Основное оружие: бо
- Боевой стиль: регенерация, усиленное тело, экзокостюм; основное оружие — бо
- Сила: 7
- Скорость: 6
- Выносливость: 10
- Интеллект: 10
- Общий показатель: 33

## Связи
- Семья:
  - [[Тёмный Рыцарь]]
  - [[Виктория Джи]]
  - [[Нина Фрай]] (жена)
  - [[Макс Кун]] (сын)
- Романтика:
  - [[Нина Фрай]]

## Арка по периодам
- [[Эпоха XII — Война Вархейма и Титании]]: уже родился; родители женаты.
- [[Эпоха XIII — Затишье и пик земных мутантов]]: в борьбе с теневой организацией познаёт поражение; находит [[Нина Фрай|Нину Фрай]] и становится борцом, как отец.

## Заметки
- Ночной рыцарь 2. Оружие — бо. Жена — [[Нина Фрай]]. Сын — [[Макс Кун]].
- Рабочая карточка «Сын Мэйди и Виктории» слита сюда.
"""
# keep portrait from earlier assign
old = path.read_text(encoding="utf-8")
ofm, _ = split_fm(old)
port_m = re.search(r"^портрет: (.+)$", ofm, re.M)
looks_m = re.search(r"^облики:\n((?:  - файл:.*\n    имя:.*\n)*)", ofm, re.M)
if port_m:
    fm = set_looks(
        fm,
        port_m.group(1).strip(),
        re.findall(r"  - файл: (.+)\n    имя: (.+)", looks_m.group(1)) if looks_m else [(port_m.group(1).strip(), "основной")],
    )
    body = ensure_embed(body, port_m.group(1).strip())
write_card(path, fm, body)

# 3) Max
path = CHARS / "The Earth Characters/Макс Кун.md"
fm, body = split_fm(path.read_text(encoding="utf-8"))
fm = set_aliases(fm, ["Макс Кун", "Внук Мэйди", "ночной рыцарь 3", "третий ночной рыцарь"])
fm = set_key(fm, "имя", "Макс Кун")
fm = set_key(fm, "имя_en", "Max Kun")
fm = set_key(fm, "роль", "третий ночной рыцарь; готовит нового рыцаря не из рода")
fm = set_key(fm, "жизненный статус", "мертв")
if re.search(r"^боевая статистика:", fm, re.M):
    fm = re.sub(r"(^боевая статистика:\n(?:  .*\n)*)", "", fm, count=1, flags=re.M)
fm += """
боевая статистика:
  тип способностей: третий ночной рыцарь
  основное оружие: палки эскрима
  боевой стиль: "регенерация, лезвие разящее мраком, ударный блинк, псионическое усиление, поглощение жизненной энергии; оружие — палки эскрима"
  параметры:
    сила: 8
    скорость: 7
    выносливость: 10
    интеллект: 7
    общий показатель: 32
"""
fm = set_family(fm, ["Натан Кун", "Нина Фрай", "Тёмный Рыцарь", "Виктория Джи", "Лина", "Ревенант"])
fm = set_romance(fm, ["Лина"])
port_m = re.search(r"^портрет: (.+)$", fm, re.M)
looks_m = re.search(r"^облики:\n((?:  - файл:.*\n    имя:.*\n)*)", fm, re.M)
body = f"""
# Макс Кун

## Профиль
- ФИО: Макс Кун
- ФИО (англ.): Max Kun
- Наименование: ночной рыцарь 3, внук Мэйди
- Пол: мужской
- Место рождения: [[Земля]]
- Жизненный статус: мертв
- Фракция: [[Защитники]], [[Боевая Академия Титанов]]
- Роль: третий ночной рыцарь; готовит нового рыцаря не из рода

## Боевая статистика
- Тип способностей: третий ночной рыцарь
- Основное оружие: палки эскрима
- Боевой стиль: регенерация, лезвие разящее мраком, ударный блинк, псионическое усиление, поглощение жизненной энергии; оружие — палки эскрима
- Сила: 8
- Скорость: 7
- Выносливость: 10
- Интеллект: 7
- Общий показатель: 32

## Связи
- Семья:
  - [[Натан Кун]] (отец)
  - [[Нина Фрай]] (мать)
  - [[Тёмный Рыцарь]] (дед)
  - [[Виктория Джи]] (бабушка)
  - [[Лина]] (жена)
  - [[Ревенант]] (сын Кевин Кун; не рыцарь)
- Романтика:
  - [[Лина]]
- Напарники:
  - [[Ночной рыцарь Термариона]]

## Арка по периодам
- [[Эпоха XV — Тихая война Тьмы]]: появляется в кадре.
- [[Эпоха XVIII — Термарион и гибель Дэниеля]]: на [[Термарион|Термарионе]] готовит нового ночного рыцаря — не своего сына, а обычного мальчика ([[Ночной рыцарь Термариона]] / Кейр Холт). Умирает вместе с [[Дэниель 1]].

## Заметки
- Ночной рыцарь 3. Оружие — палки эскрима. Жена — [[Лина]]. Сын — [[Ревенант]] (Кевин Кун), не наследует маску.
"""
if port_m:
    body = ensure_embed(body, port_m.group(1).strip())
write_card(path, fm, body)

# 4) Revenant / Kevin
path = CHARS / "The Earth Characters/Ревенант.md"
fm, body = split_fm(path.read_text(encoding="utf-8"))
fm = set_aliases(fm, ["Ревенант", "Revenant", "Revanant", "Кевин Кун"])
fm = set_key(fm, "имя", "Кевин Кун")
fm = set_key(fm, "имя_en", "Kevin Kun")
fm = set_key(fm, "роль", "сын Макса и Лины; не ночной рыцарь; владелец меча и способностей родителей")
fm = set_family(fm, ["Макс Кун", "Лина"])
# keep existing portraits (old Max Kun files = Revenant looks) unless empty
port_m = re.search(r"^портрет: (.+)$", fm, re.M)
body = f"""
# Ревенант

## Профиль
- ФИО: Кевин Кун
- ФИО (англ.): Kevin Kun
- Наименование: Ревенант, Revenant
- Пол: мужской
- Место рождения: [[Земля]]
- Роль: сын [[Макс Кун|Макса Куна]] и [[Лина|Лины]]; не ночной рыцарь

## Связи
- Семья:
  - [[Макс Кун]]
  - [[Лина]]

## Заметки
- ФИО Кевин Кун. Позывной Ревенант. Не рыцарь.
- Владелец меча; способности матери ([[Лина]]) и отца ([[Макс Кун]]).
- Карточка «Кевин Кун / Найт Винг» удалена: это был ошибочный отец Макса.
"""
if port_m and port_m.group(1).strip():
    body = ensure_embed(body, port_m.group(1).strip())
    looks_m = re.search(r"^облики:\n((?:  - файл:.*\n    имя:.*\n)*)", fm, re.M)
    if looks_m:
        oblik = "## Облик\n" + "\n".join(
            f"- {name}: ![[{file}]]" for file, name in re.findall(r"  - файл: (.+)\n    имя: (.+)", looks_m.group(1))
            if file != port_m.group(1).strip()
        )
        if "![[" in oblik:
            body = body.replace("## Профиль", oblik + "\n\n## Профиль", 1)
write_card(path, fm, body)

# 5) Lina as Max's wife / Kevin's mother
path = CHARS / "The Earth Characters/Лина.md"
fm, body = split_fm(path.read_text(encoding="utf-8"))
fm = set_family(fm, ["Макс Кун", "Ревенант"])
fm = set_romance(fm, ["Макс Кун"])
body = re.sub(
    r"(## Связи\n- Семья:\n)(?:  -.*\n)*",
    r"\1  - [[Макс Кун]] (муж)\n  - [[Ревенант]] (сын Кевин Кун)\n",
    body,
    count=1,
)
if "жена [[Макс Кун" not in body and "Жена третьего" not in body:
    body = body.rstrip() + "\n\n## Заметки\n- Жена [[Макс Кун|Макса Куна]] (ночной рыцарь 3). Сын — [[Ревенант]] (Кевин Кун).\n"
write_card(path, fm, body)

# 6) Nina as Nathan's wife
path = CHARS / "The Earth Characters/Нина Фрай.md"
fm, body = split_fm(path.read_text(encoding="utf-8"))
fm = set_key(fm, "имя_en", "Nina Frai")
fm = set_family(fm, ["Натан Кун", "Макс Кун"])
fm = set_romance(fm, ["Натан Кун"])
# replace Сын Мэйди links in yaml friends/partners via text replace later
body = replace_profile(body, **{"ФИО (англ.)": "Nina Frai"})
body = body.replace("[[Сын Мэйди и Виктории]]", "[[Натан Кун]]")
body = re.sub(
    r"(## Связи\n- Семья:\n)(?:  -.*\n)*",
    r"\1  - [[Натан Кун]] (муж)\n  - [[Макс Кун]] (сын)\n",
    body,
    count=1,
)
body = re.sub(
    r"(## Связи[\s\S]*?- Романтика:\n)(?:  -.*\n)*",
    r"\1  - [[Натан Кун]]\n",
    body,
    count=1,
)
if "жена [[Натан Кун" not in body and "Жена второго" not in body:
    body = body.rstrip() + "\n\n## Заметки\n- Жена [[Натан Кун|Натана Куна]] (ночной рыцарь 2). Сын — [[Макс Кун]].\n"
write_card(path, fm, body)

# 7) Victoria family
path = CHARS / "The Earth Characters/Виктория Джи.md"
text = path.read_text(encoding="utf-8")
text = text.replace("[[Сын Мэйди и Виктории]]", "[[Натан Кун]]")
fm, body = split_fm(text)
fm = set_family(fm, ["Тёмный Рыцарь", "Натан Кун", "Макс Кун"])
write_card(path, fm, body)

# Termarion knight note
path = CHARS / "New World Characters/Ночной рыцарь Термариона.md"
fm, body = split_fm(path.read_text(encoding="utf-8"))
fm = set_key(fm, "имя", "Кейр Холт")
fm = set_key(fm, "имя_en", "Keir Holt")
body = replace_profile(body, **{"ФИО": "Кейр Холт", "ФИО (англ.)": "Keir Holt"})
if "не из рода" not in body:
    body = body.rstrip() + "\n\nГотовит его [[Макс Кун]] — не сын Макса, а мальчик с Термариона (не из рода Кунов).\n"
write_card(path, fm, body)


# --- delete cards ---
for rel in [
    "The Earth Characters/Кевин Кун.md",
    "The Earth Characters/Сын Мэйди и Виктории.md",
    "The Earth Characters/Мэд Кун.md",
    "New World Characters/Моргана.md",
]:
    p = CHARS / rel
    if p.exists():
        p.unlink()
        print("deleted", rel)

# --- retarget wiki across vault ---
REPLACES = [
    ("[[Сын Мэйди и Виктории]]", "[[Натан Кун]]"),
    ("[[Сын Мэйди и Виктории|", "[[Натан Кун|"),
    ("[[Мэд Кун]]", "[[Тёмный Рыцарь]]"),
    ("[[Мэд Кун|", "[[Тёмный Рыцарь|"),
    ("[[Моргана]]", ""),
]
for md in VAULT.rglob("*.md"):
    text = md.read_text(encoding="utf-8")
    nxt = text
    for a, b in REPLACES:
        nxt = nxt.replace(a, b)
    # cleanup empty wiki leftovers
    nxt = re.sub(r",\s*,", ",", nxt)
    nxt = re.sub(r"\[\s*,", "[", nxt)
    nxt = re.sub(r",\s*\]", "]", nxt)
    nxt = re.sub(r'"\s*,\s*"', '", "', nxt)
    if nxt != text:
        md.write_text(nxt, encoding="utf-8")
        print("retarget", md.relative_to(VAULT))

# open questions patch
oq = VAULT / "06_Rules/Открытые вопросы и нестыковки.md"
if oq.exists():
    t = oq.read_text(encoding="utf-8")
    t = t.replace(
        "- Дальше линейка: [[Кевин Кун]] «Темный Рыцарь стрелок» (алиас Найт Винг), [[Натан Кун]] «Темный Рыцарь защитник», [[Макс Кун]] сын Кевина и третий ночной рыцарь; [[Ревенант]] — сын Макса, ФИО Кевин Кун, не наследник маски. Не путать двух Кевинов.",
        "- Линейка закреплена: [[Тёмный Рыцарь|Мэйди Кун]] (НК1) → [[Натан Кун]] (НК2, бо, жена [[Нина Фрай]]) → [[Макс Кун]] (НК3, эскрима, жена [[Лина]]) → [[Ревенант]] (Кевин Кун, не рыцарь). [[Мэд Кун]] и ложный «Кевин Кун / Найт Винг» удалены.",
    )
    t = re.sub(
        r"\| \[\[Сын Мэйди и Виктории\]\] \|.*\|",
        "| [[Натан Кун]] | сын Мэйди; ночной рыцарь 2; жена Нина Фрай |",
        t,
    )
    t = re.sub(
        r"\| \[\[Макс Кун\]\] \|.*\|",
        "| [[Макс Кун]] | ночной рыцарь 3; сын Натана; жена Лина; эскрима |",
        t,
    )
    t = re.sub(
        r"\| \[\[Ревенант\]\] \|.*\|",
        "| [[Ревенант]] | ФИО Кевин Кун; сын Макса и Лины; не рыцарь |",
        t,
    )
    if "Моргана удалена" not in t:
        t += "\n\n**N31.** Карточки [[Моргана]] и [[Мэд Кун]] / ложный Кевин Кун (Найт Винг) удалены по решению автора.\nРешение: удалены.\n"
    oq.write_text(t, encoding="utf-8")

plan = VAULT / "06_Rules/План эпох XII–XXII.md"
if plan.exists():
    t = plan.read_text(encoding="utf-8")
    t = t.replace("есть сын ([[Натан Кун]])", "есть сын ([[Натан Кун]])")  # already retargeted
    t = t.replace(
        "Не сливать сына Мэйди с [[Макс Кун]] (внук — это Макс).",
        "Сын Мэйди = [[Натан Кун]]; внук = [[Макс Кун]]; правнук = [[Ревенант]] (Кевин Кун, не рыцарь).",
    )
    plan.write_text(t, encoding="utf-8")

print("DONE")
