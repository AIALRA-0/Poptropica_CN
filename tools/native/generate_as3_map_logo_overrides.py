import argparse
import json
import math
import os
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont


def run_checked(command):
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout or "command failed").strip())
    return result


def parse_shape_metadata(xml_path):
    tree = ET.parse(xml_path)
    root = tree.getroot()
    for item in root.findall(".//item"):
        item_type = item.attrib.get("type", "")
        if item_type.startswith("DefineShape"):
            bounds = item.find("shapeBounds")
            if bounds is None:
                continue
            shape_id = item.attrib.get("shapeId")
            xmin = int(bounds.attrib.get("Xmin", "0"))
            xmax = int(bounds.attrib.get("Xmax", "0"))
            ymin = int(bounds.attrib.get("Ymin", "0"))
            ymax = int(bounds.attrib.get("Ymax", "0"))
            return {
                "shape_id": int(shape_id),
                "xmin": xmin,
                "xmax": xmax,
                "ymin": ymin,
                "ymax": ymax,
                "width": max(1, xmax - xmin),
                "height": max(1, ymax - ymin),
            }
    raise RuntimeError("No shape metadata found in logo.swf xml export")


def measure_text(draw, font, text):
    bbox = draw.multiline_textbbox((0, 0), text, font=font, spacing=0, stroke_width=0, align="center")
    width = max(0, bbox[2] - bbox[0])
    height = max(0, bbox[3] - bbox[1])
    return bbox, width, height


def wrap_tokens(draw, tokens, font, max_width, max_lines):
    lines = []
    current = ""
    separator = "" if all(len(token) == 1 for token in tokens) else " "
    for token in tokens:
        candidate = token if not current else f"{current}{separator}{token}"
        _bbox, width, _height = measure_text(draw, font, candidate)
        if width <= max_width or not current:
            current = candidate
            continue
        lines.append(current)
        current = token
        if len(lines) >= max_lines:
            return None
    if current:
        lines.append(current)
    if len(lines) > max_lines:
        return None
    return lines


def tokenize_mixed_text(text):
    tokens = []
    index = 0
    while index < len(text):
        char = text[index]
        if char.isspace():
            index += 1
            continue
        if char.isascii() and (char.isalnum() or char in "-_'./:&"):
            end = index + 1
            while end < len(text):
                current = text[end]
                if current.isascii() and (current.isalnum() or current in "-_'./:&"):
                    end += 1
                    continue
                break
            tokens.append(text[index:end])
            index = end
            continue
        tokens.append(char)
        index += 1
    return tokens


def split_text_for_width(draw, text, font, max_width, max_lines=2):
    if not text:
        return [text]

    _bbox, width, _height = measure_text(draw, font, text)
    if width <= max_width:
        return [text]

    word_tokens = [token for token in text.replace("：", " ").replace(":", " ").split(" ") if token]
    if len(word_tokens) > 1:
        wrapped = wrap_tokens(draw, word_tokens, font, max_width, max_lines)
        if wrapped:
            return wrapped

    char_tokens = tokenize_mixed_text(text)
    wrapped = wrap_tokens(draw, char_tokens, font, max_width, max_lines)
    if wrapped:
        return wrapped

    return [text]


def build_layout(text, font_path, render_width, render_height):
    scratch = Image.new("L", (render_width, render_height), 0)
    draw = ImageDraw.Draw(scratch)
    max_width = int(render_width * 0.88)
    max_height = int(render_height * 0.80)
    chosen = None

    start_size = max(40, int(render_height * 0.58))
    for font_size in range(start_size, 22, -4):
        font = ImageFont.truetype(font_path, font_size)
        lines = split_text_for_width(draw, text, font, max_width, 2)
        multiline = "\n".join(lines)
        bbox = draw.multiline_textbbox((0, 0), multiline, font=font, spacing=max(6, font_size // 10), align="center")
        width = max(0, bbox[2] - bbox[0])
        height = max(0, bbox[3] - bbox[1])
        if width <= max_width and height <= max_height:
            chosen = {
                "font": font,
                "font_size": font_size,
                "lines": lines,
                "spacing": max(6, font_size // 10),
                "bbox": bbox,
                "width": width,
                "height": height,
            }
            break

    if chosen is None:
        font_size = 22
        font = ImageFont.truetype(font_path, font_size)
        lines = split_text_for_width(draw, text, font, max_width, 2)
        multiline = "\n".join(lines)
        bbox = draw.multiline_textbbox((0, 0), multiline, font=font, spacing=max(4, font_size // 10), align="center")
        chosen = {
            "font": font,
            "font_size": font_size,
            "lines": lines,
            "spacing": max(4, font_size // 10),
            "bbox": bbox,
            "width": max(0, bbox[2] - bbox[0]),
            "height": max(0, bbox[3] - bbox[1]),
        }

    return chosen


def render_text_masks(text, font_path, render_width, render_height):
    layout = build_layout(text, font_path, render_width, render_height)
    multiline = "\n".join(layout["lines"])
    stroke_width = max(4, layout["font_size"] // 9)

    outer = Image.new("L", (render_width, render_height), 0)
    inner = Image.new("L", (render_width, render_height), 0)
    outer_draw = ImageDraw.Draw(outer)
    inner_draw = ImageDraw.Draw(inner)

    x = render_width / 2
    y = render_height / 2
    anchor = "mm"

    outer_draw.multiline_text(
        (x, y),
        multiline,
        font=layout["font"],
        fill=255,
        align="center",
        anchor=anchor,
        spacing=layout["spacing"],
        stroke_width=stroke_width,
        stroke_fill=255,
    )
    inner_draw.multiline_text(
        (x, y),
        multiline,
        font=layout["font"],
        fill=255,
        align="center",
        anchor=anchor,
        spacing=layout["spacing"],
        stroke_width=0,
    )

    return np.array(outer), np.array(inner), layout


def contour_mask_to_path(mask, xmin, ymin, width, height):
    binary = np.where(mask > 0, 255, 0).astype(np.uint8)
    contours, _hierarchy = cv2.findContours(binary, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return ""

    render_height, render_width = binary.shape
    path_parts = []
    for contour in contours:
        points = contour[:, 0, :]
        if len(points) < 3:
            continue
        commands = []
        for index, point in enumerate(points):
            px = float(point[0])
            py = float(point[1])
            x = (xmin + (px / max(1.0, render_width)) * width) / 20.0
            y = (ymin + (py / max(1.0, render_height)) * height) / 20.0
            commands.append(f"{'M' if index == 0 else 'L'} {x:.2f} {y:.2f}")
        commands.append("Z")
        path_parts.append(" ".join(commands))
    return " ".join(path_parts)


def build_svg(shape_meta, outer_mask, inner_mask):
    xmin = shape_meta["xmin"]
    ymin = shape_meta["ymin"]
    width = shape_meta["width"]
    height = shape_meta["height"]
    svg_xmin = xmin / 20.0
    svg_ymin = ymin / 20.0
    svg_width = width / 20.0
    svg_height = height / 20.0

    outer_path = contour_mask_to_path(outer_mask, xmin, ymin, width, height)
    inner_path = contour_mask_to_path(inner_mask, xmin, ymin, width, height)
    if not outer_path:
        raise RuntimeError("Failed to build SVG path from rendered logo text")

    svg_lines = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{svg_xmin:.2f} {svg_ymin:.2f} {svg_width:.2f} {svg_height:.2f}">',
        f'  <path d="{outer_path}" fill="#20317D" fill-rule="evenodd"/>'
    ]
    if inner_path:
        svg_lines.append(f'  <path d="{inner_path}" fill="#FFFFFF" fill-rule="evenodd"/>')
    svg_lines.append("</svg>")
    return "\n".join(svg_lines)


def process_entry(entry, ffdec_cli, font_path, temp_root):
    source_swf = entry["sourceSwf"]
    output_swf = entry["outputSwf"]
    text = entry["text"]
    folder = entry["folder"]
    entry_temp = os.path.join(temp_root, folder)
    os.makedirs(entry_temp, exist_ok=True)

    xml_path = os.path.join(entry_temp, "logo.xml")
    svg_path = os.path.join(entry_temp, "logo.svg")

    run_checked([ffdec_cli, "-swf2xml", source_swf, xml_path])
    shape_meta = parse_shape_metadata(xml_path)

    render_width = max(1000, int(math.ceil(shape_meta["width"] / 5.0)))
    render_height = max(420, int(math.ceil(shape_meta["height"] / 5.0)))
    outer_mask, inner_mask, layout = render_text_masks(text, font_path, render_width, render_height)
    svg = build_svg(shape_meta, outer_mask, inner_mask)
    with open(svg_path, "w", encoding="utf8") as handle:
        handle.write(svg)

    os.makedirs(os.path.dirname(output_swf), exist_ok=True)
    run_checked([ffdec_cli, "-replace", source_swf, output_swf, str(shape_meta["shape_id"]), svg_path, "nofill"])

    return {
        "folder": folder,
        "text": text,
        "outputSwf": output_swf,
        "fontSize": layout["font_size"],
        "lineCount": len(layout["lines"]),
        "shapeId": shape_meta["shape_id"],
        "shapeBounds": {
            "xmin": shape_meta["xmin"],
            "xmax": shape_meta["xmax"],
            "ymin": shape_meta["ymin"],
            "ymax": shape_meta["ymax"],
        },
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    args = parser.parse_args()

    with open(args.manifest, "r", encoding="utf8") as handle:
        manifest = json.load(handle)

    ffdec_cli = manifest["ffdecCli"]
    font_path = manifest["fontPath"]
    entries = manifest.get("entries", [])

    if not os.path.exists(ffdec_cli):
        raise RuntimeError(f"FFDec CLI not found: {ffdec_cli}")
    if not os.path.exists(font_path):
        raise RuntimeError(f"Font file not found: {font_path}")

    results = []
    failures = []
    with tempfile.TemporaryDirectory(prefix="as3-map-logo-") as temp_root:
        for entry in entries:
            try:
                results.append(process_entry(entry, ffdec_cli, font_path, temp_root))
            except Exception as error:
                failures.append({
                    "folder": entry.get("folder"),
                    "text": entry.get("text"),
                    "sourceSwf": entry.get("sourceSwf"),
                    "error": str(error),
                })

    payload = {
        "ok": len(failures) == 0,
        "generatedCount": len(results),
        "failureCount": len(failures),
        "results": results,
        "failures": failures,
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
