"""Prepare Burger House 3 assets from the seventeen current WhatsApp flyers.

Only the WhatsApp JPEG files listed below are active catalog sources. Earlier
PNG flyers stay in referencias as historical material and are never read here.
All food photographs are direct crops, without generative retouching.
Run: python scripts/prepare-assets.py [--source-dir PATH] [--clean]
"""
from argparse import ArgumentParser
from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "images"
ARTIFACTS = ROOT / "artifacts"
SOURCE_FILES = {
    "papas": "WhatsApp Image 2026-10-19 at 9.55.26 PM (1).jpeg",
    "panchos": "WhatsApp Image 2026-10-19 at 9.55.26 PM.jpeg",
    "combo-especial": "WhatsApp Image 2026-10-19 at 9.55.27 PM (1).jpeg",
    "envios": "WhatsApp Image 2026-10-19 at 9.55.27 PM.jpeg",
    "promo-bomba": "WhatsApp Image 2026-10-19 at 9.55.28 PM (1).jpeg",
    "promos-pizzas": "WhatsApp Image 2026-10-19 at 9.55.28 PM.jpeg",
    "la-bajonera": "WhatsApp Image 2026-10-19 at 9.55.29 PM (1).jpeg",
    "cajita-4-personas": "WhatsApp Image 2026-10-19 at 9.55.29 PM.jpeg",
    "combo-familiar": "WhatsApp Image 2026-10-19 at 9.55.30 PM.jpeg",
    "cheese-burger": "WhatsApp Image 2026-10-19 at 9.55.31 PM.jpeg",
    "burgers-clasicas": "WhatsApp Image 2026-10-19 at 9.55.32 PM (1).jpeg",
    "combo-infantil": "WhatsApp Image 2026-10-19 at 9.55.32 PM (2).jpeg",
    "burgers-especiales": "WhatsApp Image 2026-10-19 at 9.55.32 PM.jpeg",
    "empanadas": "WhatsApp Image 2026-10-19 at 9.55.33 PM.jpeg",
    "milanesa-caballo": "WhatsApp Image 2026-10-19 at 9.55.34 PM (1).jpeg",
    "napolitana": "WhatsApp Image 2026-10-19 at 9.55.34 PM (2).jpeg",
    "pizzas": "WhatsApp Image 2026-10-19 at 9.55.34 PM.jpeg",
}

# Pixel bounds refer to the unscaled WhatsApp originals. Every crop uses only
# current material. Classical burger flyers do not contain individual photos;
# representative crops from the current burger imagery are used for them.
CROPS = {
    "hero-bajonera": ("la-bajonera", (0, 450, 610, 990)),
    "la-bajonera": ("la-bajonera", (0, 450, 610, 990)),
    "cheese-burger": ("cheese-burger", (0, 605, 495, 1070)),
    "clasica": ("cheese-burger", (0, 605, 495, 1070)),
    "jamon-queso": ("cheese-burger", (0, 605, 495, 1070)),
    "burger-loca": ("burgers-especiales", (32, 646, 239, 834)),
    "tata-burga": ("burgers-especiales", (553, 646, 752, 834)),
    "bomba-burger": ("burgers-especiales", (33, 859, 242, 1055)),
    "chesse-burger-triple": ("burgers-especiales", (31, 433, 236, 622)),
    "extra-bacon": ("burgers-especiales", (552, 433, 751, 622)),
    "grand-tasty": ("burgers-especiales", (32, 646, 239, 834)),
    "onion-crispy": ("burgers-especiales", (553, 646, 752, 834)),
    "bbq": ("burgers-especiales", (33, 859, 242, 1055)),
    "cuarto-libra": ("burgers-especiales", (554, 860, 750, 1054)),
    "big-bacon": ("burgers-especiales", (32, 1081, 242, 1269)),
    "bomba-chesse-house": ("burgers-especiales", (554, 1081, 752, 1269)),
    "promo-bomba-chesse": ("promo-bomba", (70, 625, 1060, 1110)),
    "combo-familiar": ("combo-familiar", (710, 21, 1080, 509)),
    "combo-infantil": ("combo-infantil", (2, 620, 415, 1000)),
    "current-papas": ("papas", (408, 446, 853, 680)),
    "current-papas-individuales": ("papas", (463, 797, 694, 931)),
    "current-nuggets": ("papas", (394, 679, 563, 785)),
    "current-bastoncitos": ("papas", (570, 683, 849, 839)),
    "current-dips": ("papas", (350, 936, 690, 1011)),
    "current-bandeja-mixta": ("papas", (482, 995, 853, 1172)),
    "current-panchos": ("panchos", (0, 596, 290, 878)),
    "current-pancho-cheddar": ("panchos", (0, 887, 276, 1197)),
    "current-combo-especial": ("combo-especial", (7, 489, 1080, 844)),
    "current-combo-pizzas": ("promos-pizzas", (555, 479, 1056, 675)),
    "current-cajita-4-personas": ("cajita-4-personas", (0, 495, 720, 799)),
    "current-empanadas": ("empanadas", (212, 469, 436, 735)),
    "current-empanada-carne": ("empanadas", (212, 469, 436, 735)),
    "current-empanada-pollo": ("empanadas", (638, 470, 854, 738)),
    "current-empanada-jamon-queso": ("empanadas", (216, 813, 436, 1080)),
    "current-empanada-cuchillo": ("empanadas", (641, 839, 854, 1090)),
    "current-milanesa-caballo": ("milanesa-caballo", (0, 279, 389, 615)),
    "current-napolitana": ("napolitana", (8, 300, 379, 579)),
    "current-pizza": ("pizzas", (479, 40, 899, 395)),
    "current-pizza-muzza": ("pizzas", (479, 40, 899, 395)),
    "current-pizza-morron": ("pizzas", (405, 404, 700, 690)),
    "current-pizza-calabresa": ("pizzas", (567, 574, 899, 926)),
    "current-pizza-huevo": ("pizzas", (497, 1270, 888, 1599)),
}


def contained_file(path: Path, parent: Path) -> bool:
    return path.resolve().is_relative_to(parent.resolve()) and path.is_file()


def contact_sheet(entries, destination: Path, width=1500, height=320, columns=5):
    rows = (len(entries) + columns - 1) // columns
    sheet = Image.new("RGB", (width, rows * height), "#e8e2d7")
    draw = ImageDraw.Draw(sheet)
    cell = width // columns
    for index, (name, picture) in enumerate(entries):
        thumb = ImageOps.contain(picture, (cell - 20, height - 43))
        x = index % columns * cell + (cell - thumb.width) // 2
        y = index // columns * height
        sheet.paste(thumb, (x, y))
        draw.text((index % columns * cell + 8, y + height - 35), name, fill="#18140d")
        draw.text((index % columns * cell + 8, y + height - 19), f"{picture.width} x {picture.height}", fill="#71634d")
    sheet.save(destination, quality=91)


def main():
    parser = ArgumentParser(description=__doc__)
    default = ROOT / "referencias" if (ROOT / "referencias").is_dir() else ROOT.parent / "referencias"
    parser.add_argument("--source-dir", type=Path, default=default)
    parser.add_argument("--clean", action="store_true", help="Remove previous generated image files, inside public/images only")
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    refs = OUT / "references"
    refs.mkdir(exist_ok=True)
    pictures = {}
    manifest = []
    for index, (key, filename) in enumerate(SOURCE_FILES.items(), start=1):
        source = args.source_dir / filename
        if not source.is_file():
            raise SystemExit(f"Missing current source: {source}")
        picture = Image.open(source).convert("RGB")
        pictures[key] = picture
        reference_name = f"current-{index:02d}-{key}.webp"
        picture.save(refs / reference_name, "WEBP", quality=90, method=6)
        manifest.append({"key": key, "source": filename, "reference": f"/images/references/{reference_name}", "width": picture.width, "height": picture.height})
    # New dark-background logo from the current Cheese Burger flyer.
    logo = pictures["cheese-burger"].crop((210, 9, 608, 403))
    logo.quantize(colors=256).save(OUT / "logo.png", optimize=True)
    prepared = []
    for key, (source_key, bounds) in CROPS.items():
        picture = pictures[source_key].crop(bounds)
        picture.thumbnail((1200, 1200), Image.Resampling.LANCZOS)
        picture.save(OUT / f"{key}.webp", "WEBP", quality=91, method=6)
        prepared.append((key, picture))
    (refs / "current-sources.json").write_text(json.dumps({"activeSource": "Seventeen WhatsApp JPEG flyers supplied 2026-10-19", "historicalSource": "Earlier PNG flyers in referencias are archival material only", "references": manifest, "crops": {key: {"source": source, "bounds": list(bounds), "representative": key in {"clasica", "jamon-queso", "burger-loca", "tata-burga", "bomba-burger"}} for key, (source, bounds) in CROPS.items()}}, indent=2, ensure_ascii=False), encoding="utf-8")
    if args.clean:
        expected = {f"{key}.webp" for key in CROPS}
        expected_refs = {Path(entry["reference"]).name for entry in manifest}
        for path in OUT.glob("*.webp"):
            if path.name not in expected and contained_file(path, OUT):
                path.unlink()
        for path in refs.glob("*.webp"):
            if path.name not in expected_refs and contained_file(path, refs):
                path.unlink()
    contact_sheet([(f"{index:02d} {key}", pictures[key]) for index, key in enumerate(SOURCE_FILES, 1)], ARTIFACTS / "current-source-contact-sheet.jpg", height=430)
    contact_sheet(prepared, ARTIFACTS / "current-asset-contact-sheet.jpg")
    print(f"Prepared {len(CROPS)} current crops, a new logo and {len(manifest)} current references in {OUT}")
    print(f"Contact sheets: {ARTIFACTS}")


if __name__ == "__main__":
    main()
