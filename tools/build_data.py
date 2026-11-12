#!/usr/bin/env python3
"""Собирает данные для сайта «Дерево клад животных».

Что делает скрипт:
  1. читает список видов (species.tsv) и словарь клад (clades.tsv);
  2. находит каждый вид в Open Tree of Life (OToL) и скачивает его «родословную» -
     цепочку узлов дерева от вида до корня;
  3. складывает родословные в одно дерево и упрощает его: оставляет точки ветвления
     и клады из словаря, остальные промежуточные узлы убирает;
  4. для каждой клады собирает научные работы, которые её подтверждают, и годы их публикации;
  5. скачивает через API OneZoom картинки видов с указанием авторов и лицензий;
  6. записывает результат в data/tree-data.js.

Запуск:  python3 tools/build_data.py
Нужен только Python 3 и интернет. Ответы серверов кэшируются в tools/cache/.
"""
import collections
import datetime
import json
import pathlib
import re
import sys
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from otol import onezoom, otol  # noqa: E402

TOOLS = pathlib.Path(__file__).parent
ROOT = TOOLS.parent
ROOT_CLADE = "Metazoa"  # корень нашего дерева


def read_tsv(name, min_cols, max_cols):
    rows = []
    for line in (TOOLS / name).read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        cols = [c.strip() for c in line.split("\t")]
        if len(cols) < min_cols:
            sys.exit(f"{name}: слишком мало столбцов в строке: {line!r}")
        rows.append(cols + [""] * (max_cols - len(cols)))
    return rows


def warn(msg):
    print("  ВНИМАНИЕ:", msg)


# ---------------------------------------------------------------- 1. входные таблицы
species = read_tsv("species.tsv", 2, 2)
clade_dict = {lat: (ru, rank, desc) for lat, ru, rank, desc in read_tsv("clades.tsv", 2, 4)}
extra = read_tsv("extra_clades.tsv", 6, 7)
notes = dict(read_tsv("notes.tsv", 2, 2))
print(f"Видов в списке: {len(species)}, клад в словаре: {len(clade_dict)}")

# ---------------------------------------------------------------- 2. виды -> OToL
print("Ищу виды в Open Tree of Life…")
ott_of = {}
names = [lat for lat, _ in species]
for i in range(0, len(names), 50):
    res = otol("tnrs/match_names", {"names": names[i:i + 50], "do_approximate_matching": False})
    for item in res["results"]:
        exact = [m for m in item["matches"] if not m["is_synonym"]] or item["matches"]
        if len(exact) != 1:
            sys.exit(f"Неоднозначное название {item['name']}: уточните его в species.tsv")
        taxon = exact[0]["taxon"]
        if taxon["rank"] not in ("species", "no rank") or taxon["is_suppressed_from_synth"]:
            sys.exit(f"{item['name']}: в OToL это не вид или он не входит в дерево ({taxon['rank']})")
        if taxon["name"] != item["name"]:
            print(f"  {item['name']} в OToL называется {taxon['name']} (синоним)")
        ott_of[item["name"]] = taxon["ott_id"]
missing = [n for n in names if n not in ott_of]
if missing:
    sys.exit("Не найдены в OToL: " + ", ".join(missing))

about = otol("tree_of_life/about", {})

# ---------------------------------------------------------------- 3. родословные -> дерево
print("Скачиваю родословные…")
raw = {}          # узел OToL -> его данные
parent = {}       # узел OToL -> родитель
leaf_info = {}    # узел OToL -> (латинское, русское, ott)
for lat, ru in species:
    info = otol("tree_of_life/node_info", {"ott_id": ott_of[lat], "include_lineage": True})
    chain = [info] + info["lineage"]
    leaf_info[info["node_id"]] = (lat, ru, ott_of[lat])
    for child, par in zip(chain, chain[1:]):
        parent[child["node_id"]] = par["node_id"]
    for node in chain:
        raw.setdefault(node["node_id"], node)

children = collections.defaultdict(list)
for child, par in parent.items():
    children[par].append(child)


def taxon_name(node_id):
    return raw[node_id].get("taxon", {}).get("name")


def dict_name(node_id):
    """Название узла, если оно есть в нашем словаре клад."""
    name = taxon_name(node_id)
    return name if name in clade_dict else None


root_ids = [n for n in raw if taxon_name(n) == ROOT_CLADE]
if len(root_ids) != 1:
    sys.exit(f"Не нашёл корень {ROOT_CLADE}")
for leaf in leaf_info:
    n = leaf
    while n != root_ids[0]:
        if n not in parent:
            sys.exit(f"{leaf_info[leaf][0]} не входит в кладу {ROOT_CLADE}")
        n = parent[n]


def studies_of(node_id, field="supported_by"):
    """Исследования, связанные с узлом в OToL.

    supported_by    - в дереве исследования есть именно эта ветвь (прямое подтверждение);
    partial_path_of - дерево исследования согласуется с этой ветвью, но видов в нём было
                      слишком мало, чтобы отличить её от соседних (косвенное подтверждение).
    """
    return {key.split("@")[0] for key in raw[node_id].get(field, {}) if "@" in key}


nodes = []  # итоговые узлы


def add_node(par, **fields):
    fields.update(id=len(nodes), parent=par)
    nodes.append(fields)
    return fields["id"]


def clade_fields(label_node, naming, support_nodes):
    lat = taxon_name(label_node)
    ru, rank, desc = clade_dict[lat]
    studies, indirect = set(), set()
    for n in support_nodes:
        studies |= studies_of(n)
        indirect |= studies_of(n, "partial_path_of")
    return dict(kind="clade", lat=lat, ru=ru, rank=rank, desc=desc, naming=naming,
                ott=raw[label_node]["taxon"]["ott_id"], studies=studies, indirect=indirect - studies)


def count_leaves(node_id):
    if node_id in leaf_info:
        return 1
    return sum(count_leaves(c) for c in children[node_id])


def build(node_id, par):
    """Добавляет в итоговое дерево узел node_id (дочерний для уже добавленного par)."""
    chain = []  # промежуточные узлы с единственным потомком
    while node_id not in leaf_info and len(children[node_id]) == 1:
        chain.append(node_id)
        node_id = children[node_id][0]
    named_chain = [n for n in chain if dict_name(n)]
    is_leaf = node_id in leaf_info
    merged = None
    if not is_leaf and not dict_name(node_id) and named_chain:
        # Точка ветвления без своего названия лежит внутри названной клады,
        # и других наших видов в этой кладе нет: подписываем ветвление её именем.
        merged = named_chain.pop()
    for n in named_chain:  # «узелки»: названные клады на ветви без ветвления
        par = add_node(par, synth=n, **clade_fields(n, "exact", [n]))
    if is_leaf:
        lat, ru, ott = leaf_info[node_id]
        add_node(par, kind="leaf", lat=lat, ru=ru, ott=ott)
        return
    if dict_name(node_id):
        me = add_node(par, synth=node_id, **clade_fields(node_id, "exact", [node_id]))
    elif merged:
        me = add_node(par, synth=node_id, **clade_fields(merged, "within", [merged, node_id]))
    else:
        me = add_node(par, kind="clade", synth=node_id, lat="", ru="", rank="", desc="",
                      naming="none", ott=None, studies=studies_of(node_id),
                      indirect=studies_of(node_id, "partial_path_of") - studies_of(node_id))
    for child in sorted(children[node_id], key=lambda c: (count_leaves(c), taxon_name(c) or c)):
        build(child, me)


build(root_ids[0], None)

# --- клады, названные вручную (extra_clades.tsv)
by_lat = {n["lat"]: n for n in nodes}


def ancestors(node):
    out = []
    while node is not None:
        out.append(node)
        node = nodes[node]["parent"]
    return out


def mrca(a, b):
    seen = set(ancestors(a))
    return next(n for n in ancestors(b) if n in seen)


for sp1, sp2, lat, ru, rank, precision, desc in extra:
    if sp1 not in by_lat or sp2 not in by_lat:
        warn(f"extra_clades.tsv: нет вида {sp1} или {sp2}, строка пропущена")
        continue
    node = nodes[mrca(by_lat[sp1]["id"], by_lat[sp2]["id"])]
    if node["naming"] != "none":
        warn(f"extra_clades.tsv: узел для {lat} уже назван «{node['ru']}», строка пропущена")
        continue
    node.update(lat=lat, ru=ru, rank=rank, desc=desc, naming="exact" if precision == "=" else "within")

for lat, text in notes.items():
    target = [n for n in nodes if n["kind"] == "clade" and n["lat"] == lat]
    if not target:
        warn(f"notes.tsv: клады {lat} нет в дереве")
    for n in target:
        n["note"] = text

unused = sorted(set(clade_dict) - {n["lat"] for n in nodes})
if unused:
    print("  Клады из словаря, не попавшие в дерево:", ", ".join(unused))

# ---------------------------------------------------------------- 4. исследования
print("Скачиваю сведения об исследованиях…")
study_ids = sorted({s for n in nodes if n["kind"] == "clade" for s in n["studies"] | n["indirect"]})
studies = {}
for sid in study_ids:
    found = otol("studies/find_studies", {"property": "ot:studyId", "value": sid, "verbose": True})
    match = [s for s in found.get("matched_studies", []) if s.get("ot:studyId") == sid]
    if not match or not match[0].get("ot:studyYear"):
        warn(f"нет года публикации у исследования {sid}, оно не учитывается")
        continue
    meta = match[0]
    ref = re.sub(r"\s+", " ", meta.get("ot:studyPublicationReference") or "").strip()
    ref = ref.replace("\u2014", "-")  # длинное тире заменяем обычным дефисом
    url = (meta.get("ot:studyPublication") or "").strip()
    studies[sid] = {"year": int(meta["ot:studyYear"]), "ref": ref,
                    "url": url.replace("http://dx.doi.org/", "https://doi.org/")}
for n in nodes:
    if n["kind"] == "clade":
        for field in ("studies", "indirect"):
            n[field] = sorted((s for s in n[field] if s in studies),
                              key=lambda s: (-studies[s]["year"], s))

# ---------------------------------------------------------------- 5. картинки (OneZoom)
print("Скачиваю картинки через API OneZoom…")
IMG = ROOT / "img"
IMG.mkdir(exist_ok=True)
leaves = [n for n in nodes if n["kind"] == "leaf"]
for i in range(0, len(leaves), 5):  # публичный ключ OneZoom: не более 5 таксонов за запрос
    batch = leaves[i:i + 5]
    res = onezoom("node_images", "otts=" + ",".join(str(n["ott"]) for n in batch))
    head = res.get("headers", {})
    for n in batch:
        row = res.get("images", {}).get(str(n["ott"]))
        if not row:
            continue
        target = IMG / f"{n['ott']}.jpg"
        if not target.exists():
            try:
                req = urllib.request.Request(row[head["url"]], headers={"User-Agent": "school-clade-tree/1.0"})
                target.write_bytes(urllib.request.urlopen(req, timeout=60).read())
            except OSError as err:
                warn(f"не скачалась картинка для {n['lat']}: {err}")
                continue
        clean = lambda s: re.sub(r"[\x00-\x1f\x7f-\x9f]", "", s or "").strip()
        n["img"] = {"rights": clean(row[head["rights"]]), "licence": clean(row[head["licence"]])}

# ---------------------------------------------------------------- 6. запись
data = {
    "meta": {
        "built": datetime.date.today().isoformat(),
        "synth": about["synth_id"],
        "synthDate": about["date_created"][:10],
        "taxonomy": about["taxonomy_version"],
        "leaves": len(leaves),
        "clades": sum(n["kind"] == "clade" for n in nodes),
    },
    "nodes": nodes,
    "studies": studies,
}
out = ROOT / "data" / "tree-data.js"
out.parent.mkdir(exist_ok=True)
out.write_text(
    "// Файл создан скриптом tools/build_data.py - не редактируйте вручную.\n"
    "window.CLADE_DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n",
    encoding="utf-8")

# ---------------------------------------------------------------- отчёт
clades = [n for n in nodes if n["kind"] == "clade"]
no_study = [n for n in clades if not n["studies"]]
print(f"\nГотово: {len(leaves)} видов, {len(clades)} клад "
      f"({sum(n['naming'] == 'none' for n in clades)} без названия), {len(studies)} исследований.")
print(f"Клад без исследований в базе: {len(no_study)}; картинок: {sum('img' in n for n in leaves)}")
print(f"Записано в {out.relative_to(ROOT)} ({out.stat().st_size // 1024} КБ)")

if "--print" in sys.argv:
    kids = collections.defaultdict(list)
    for n in nodes:
        kids[n["parent"]].append(n)

    def show(n, depth):
        if n["kind"] == "leaf":
            print("  " * depth + f"• {n['ru']} ({n['lat']})")
            return
        mark = {"exact": "", "within": " [ветвь внутри]", "none": ""}[n["naming"]]
        years = [studies[s]["year"] for s in n["studies"]]
        label = n["ru"] or "- без названия -"
        print("  " * depth + f"{label}{mark} {n['lat']} {n['rank']} "
              f"[{max(years) if years else 'нет'}; {len(years)} иссл.]")
        for c in kids[n["id"]]:
            show(c, depth + 1)

    show(nodes[0], 0)
