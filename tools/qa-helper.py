import argparse
import json
import math
import os
import re
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import psutil
import soundcard as sc
import win32api
import win32con
import win32gui
import win32process
from PIL import Image, ImageDraw, ImageGrab
from pywinauto import mouse


SHELL_PROCESS_NAMES = {"cmd.exe", "powershell.exe", "pwsh.exe", "conhost.exe", "wscript.exe", "cscript.exe"}
TERMINAL_HOST_PROCESS_NAMES = {"windowsterminal.exe", "opconsole.exe", "openconsole.exe", "wt.exe"}
OCR_ENGINE = None
RUNTIME_WINDOW_PROCESS_NAMES = {
    "flashpointnavigator.exe",
    "fpnavigator.exe",
    "basilisk.exe",
    "basiliskii.exe",
    "firefox.exe",
    "flashpointsecureplayer.exe",
}
RUNTIME_BROWSER_PROCESS_NAMES = {
    "flashpointnavigator.exe",
    "fpnavigator.exe",
    "basilisk.exe",
    "basiliskii.exe",
    "firefox.exe",
}
KNOWN_MODEL_SIZE_HINTS = {
    "g32qc": (2560, 1440),
    "g32qc a": (2560, 1440),
    "34gp950g": (2752, 1152),
    "b226hql": (1920, 1080),
}
RUNTIME_RESIZE_CHILD_CLASSES = {
    "mozillawindowclass",
    "geckopluginwindow",
    "geckofpsandboxchildwindow",
}

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime())


def to_json(payload):
    sys.stdout.write(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")


def write_json_if_needed(payload, output_path):
    if not output_path:
        return
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def get_ocr_engine():
    global OCR_ENGINE
    if OCR_ENGINE is None:
        from rapidocr_onnxruntime import RapidOCR

        OCR_ENGINE = RapidOCR()
    return OCR_ENGINE


def normalize_token(value):
    return re.sub(r"[^a-z0-9]+", "", str(value or "").lower())


def rect_payload(rect):
    left, top, right, bottom = [int(item) for item in rect]
    return {
        "left": left,
        "top": top,
        "right": right,
        "bottom": bottom,
        "width": max(0, right - left),
        "height": max(0, bottom - top),
    }


def read_active_monitor_models():
    script = (
        "Get-CimInstance -Namespace root\\wmi -ClassName WmiMonitorID | "
        "Where-Object { $_.Active } | "
        "Select-Object InstanceName,"
        "@{Name='UserFriendlyName';Expression={($_.UserFriendlyName | Where-Object {$_ -ne 0} | ForEach-Object {[char]$_}) -join ''}},"
        "@{Name='ManufacturerName';Expression={($_.ManufacturerName | Where-Object {$_ -ne 0} | ForEach-Object {[char]$_}) -join ''}},"
        "@{Name='ProductCodeID';Expression={($_.ProductCodeID | Where-Object {$_ -ne 0} | ForEach-Object {[char]$_}) -join ''}},"
        "@{Name='SerialNumberID';Expression={($_.SerialNumberID | Where-Object {$_ -ne 0} | ForEach-Object {[char]$_}) -join ''}} | "
        "ConvertTo-Json -Compress"
    )
    try:
        result = subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                script,
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=8,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            check=False,
        )
    except Exception:
        return []
    if result.returncode != 0 or not result.stdout.strip():
        return []
    try:
        payload = json.loads(result.stdout)
    except Exception:
        return []
    rows = payload if isinstance(payload, list) else [payload]
    return [
        {
            "instanceName": row.get("InstanceName"),
            "userFriendlyName": row.get("UserFriendlyName"),
            "manufacturerName": row.get("ManufacturerName"),
            "productCodeId": row.get("ProductCodeID"),
            "serialNumberId": row.get("SerialNumberID"),
        }
        for row in rows
        if isinstance(row, dict)
    ]


def enum_monitors():
    rows = []
    models = read_active_monitor_models()
    for index, (handle, _hdc, _rect) in enumerate(win32api.EnumDisplayMonitors(), start=1):
        info = win32api.GetMonitorInfo(handle)
        device = str(info.get("Device") or "")
        match = re.search(r"DISPLAY\d+", device, flags=re.IGNORECASE)
        device_short = match.group(0).upper() if match else device
        monitor_rect = rect_payload(info["Monitor"])
        work_rect = rect_payload(info["Work"])
        row = {
            "index": index,
            "deviceName": device,
            "deviceShortName": device_short,
            "primary": bool(info.get("Flags", 0) & 1),
            "rect": monitor_rect,
            "workArea": work_rect,
            "modelHint": None,
        }
        row["aliases"] = monitor_aliases(row)
        rows.append(row)

    for model in models:
        name = str(model.get("userFriendlyName") or "")
        normalized_name = normalize_token(name)
        size_hint = next(
            (size for key, size in KNOWN_MODEL_SIZE_HINTS.items() if normalize_token(key) in normalized_name),
            None,
        )
        if not size_hint:
            continue
        width, height = size_hint
        candidates = [
            row for row in rows
            if row["rect"]["width"] == width and row["rect"]["height"] == height
        ]
        if "g32qc" in normalized_name:
            candidates = [row for row in candidates if not row["primary"]] or candidates
        if "34gp950g" in normalized_name:
            candidates = [row for row in candidates if row["primary"]] or candidates
        if "b226hql" in normalized_name:
            candidates = sorted(candidates, key=lambda row: (row["rect"]["top"], row["rect"]["left"]), reverse=True)
        else:
            candidates = sorted(candidates, key=lambda row: (row["primary"], row["rect"]["left"]))
        if candidates:
            candidates[0]["modelHint"] = model

    for row in rows:
        row["aliases"] = monitor_aliases(row)
    return rows


def monitor_aliases(row):
    rect = row["rect"]
    aliases = {
        str(row.get("index") or ""),
        str(row.get("deviceName") or ""),
        str(row.get("deviceShortName") or ""),
    }
    aliases.add("primary" if row.get("primary") else "nonprimary")
    aliases.add("main" if row.get("primary") else "side")
    if rect["left"] < 0:
        aliases.update({"left", "leftmonitor"})
    if rect["top"] > 0:
        aliases.update({"bottom", "lower", "below"})
    model = row.get("modelHint") or {}
    for value in model.values():
        if value:
            aliases.add(str(value))
    return sorted({alias for alias in aliases if alias})


def resolve_monitor_target(target):
    requested = str(target or os.environ.get("POPTROPICA_QA_MONITOR") or "").strip()
    if not requested:
        return None

    rows = enum_monitors()
    normalized_requested = normalize_token(requested)
    if not rows:
        raise RuntimeError(f"No monitors were reported by Windows while resolving target monitor {requested!r}.")

    for row in rows:
        for alias in row.get("aliases") or []:
            if normalize_token(alias) == normalized_requested:
                return {
                    "requested": requested,
                    "matchReason": "alias",
                    "monitor": row,
                    "availableMonitors": rows,
                }

    for row in rows:
        tokens = [normalize_token(alias) for alias in row.get("aliases") or []]
        if any(normalized_requested and normalized_requested in token for token in tokens):
            return {
                "requested": requested,
                "matchReason": "alias-substring",
                "monitor": row,
                "availableMonitors": rows,
            }

    for model_name, size_hint in KNOWN_MODEL_SIZE_HINTS.items():
        if normalize_token(model_name) not in normalized_requested:
            continue
        width, height = size_hint
        candidates = [
            row for row in rows
            if row["rect"]["width"] == width and row["rect"]["height"] == height
        ]
        if "g32qc" in normalize_token(model_name):
            candidates = [row for row in candidates if not row["primary"]] or candidates
            candidates = sorted(candidates, key=lambda row: (row["rect"]["left"], row["rect"]["top"]))
        elif "34gp950g" in normalize_token(model_name):
            candidates = [row for row in candidates if row["primary"]] or candidates
        else:
            candidates = sorted(candidates, key=lambda row: (row["rect"]["top"], row["rect"]["left"]), reverse=True)
        if candidates:
            return {
                "requested": requested,
                "matchReason": f"known-size:{model_name}",
                "monitor": candidates[0],
                "availableMonitors": rows,
            }

    available = ", ".join(row["deviceShortName"] for row in rows)
    raise RuntimeError(f"Target monitor {requested!r} was not found. Available monitor devices: {available}.")


def command_list_monitors(args):
    target = getattr(args, "target_monitor", None)
    payload = {
        "ok": True,
        "generatedAt": now_iso(),
        "targetMonitor": target or None,
        "monitors": enum_monitors(),
    }
    if target:
        payload["resolvedTarget"] = resolve_monitor_target(target)
    write_json_if_needed(payload, args.output)
    to_json(payload)


def position_window_on_target_monitor(hwnd, target, width=None, height=None, maximize=False):
    resolved = resolve_monitor_target(target)
    monitor = resolved["monitor"]
    work_area = monitor["workArea"]
    before = window_row(hwnd)
    if not before:
        raise RuntimeError(f"Window handle {hwnd} is not valid.")

    try:
        win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
        time.sleep(0.1)
    except Exception:
        pass

    rect = win32gui.GetWindowRect(hwnd)
    current_width = max(100, int(rect[2] - rect[0]))
    current_height = max(100, int(rect[3] - rect[1]))
    target_width = int(width or current_width)
    target_height = int(height or current_height)
    target_width = max(100, min(target_width, int(work_area["width"])))
    target_height = max(100, min(target_height, int(work_area["height"])))
    target_left = int(work_area["left"]) + max(0, int((int(work_area["width"]) - target_width) / 2))
    target_top = int(work_area["top"]) + max(0, int((int(work_area["height"]) - target_height) / 2))
    flags = win32con.SWP_NOACTIVATE | win32con.SWP_NOZORDER
    if not maximize and target_width >= 1600 and target_height >= 900:
        refresh_width = max(100, target_width - min(220, max(40, int(target_width * 0.08))))
        refresh_height = max(100, target_height - min(140, max(40, int(target_height * 0.08))))
        refresh_left = int(work_area["left"]) + max(0, int((int(work_area["width"]) - refresh_width) / 2))
        refresh_top = int(work_area["top"]) + max(0, int((int(work_area["height"]) - refresh_height) / 2))
        win32gui.SetWindowPos(hwnd, 0, refresh_left, refresh_top, refresh_width, refresh_height, flags)
        time.sleep(0.18)
    win32gui.SetWindowPos(hwnd, 0, target_left, target_top, target_width, target_height, flags)
    time.sleep(0.2)
    sync_runtime_child_windows(hwnd)
    raise_window_no_activate(hwnd)
    if maximize:
        win32gui.ShowWindow(hwnd, win32con.SW_MAXIMIZE)
        time.sleep(0.25)
        sync_runtime_child_windows(hwnd)
        raise_window_no_activate(hwnd)

    return {
        "requested": resolved["requested"],
        "matchReason": resolved["matchReason"],
        "monitor": monitor,
        "windowBeforeMove": before,
        "windowAfterMove": window_row(hwnd),
    }


def safe_process_row(pid):
    try:
        proc = psutil.Process(pid)
        return {
            "pid": pid,
            "processName": proc.name(),
            "exe": proc.exe(),
            "cmdline": proc.cmdline(),
        }
    except Exception:
        return {
            "pid": pid,
            "processName": None,
            "exe": None,
            "cmdline": [],
        }


def window_row(hwnd):
    if not win32gui.IsWindow(hwnd):
        return None
    try:
        title = win32gui.GetWindowText(hwnd) or ""
        class_name = win32gui.GetClassName(hwnd) or ""
        rect = win32gui.GetWindowRect(hwnd)
        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        process_info = safe_process_row(pid)
        width = max(0, rect[2] - rect[0])
        height = max(0, rect[3] - rect[1])
        return {
            "handle": int(hwnd),
            "title": title,
            "className": class_name,
            "rect": {
                "left": rect[0],
                "top": rect[1],
                "right": rect[2],
                "bottom": rect[3],
                "width": width,
                "height": height,
            },
            **process_info,
            "visible": bool(win32gui.IsWindowVisible(hwnd)),
            "minimized": bool(win32gui.IsIconic(hwnd)),
        }
    except Exception:
        return None


def enum_windows(include_untitled=False):
    rows = []

    def callback(hwnd, _):
        if not win32gui.IsWindowVisible(hwnd):
            return
        row = window_row(hwnd)
        if not row:
            return
        rect = row["rect"]
        if rect["width"] < 80 or rect["height"] < 80:
            return
        title = row["title"].strip()
        pname = (row["processName"] or "").lower()
        if not include_untitled and not title and pname not in SHELL_PROCESS_NAMES:
            return
        rows.append(row)

    win32gui.EnumWindows(callback, None)
    rows.sort(key=lambda item: (item["title"] == "", -item["rect"]["width"] * item["rect"]["height"]))
    return rows


def parse_csv(value):
    return {chunk.strip().lower() for chunk in (value or "").split(",") if chunk.strip()}


def match_window(row, process_names, title_contains, pid=None, cmdline_contains=None):
    if is_transient_runtime_wrapper(row):
        return False
    if pid is not None and int(row.get("pid") or -1) != pid:
        return False
    process_name = (row.get("processName") or "").lower()
    title = (row.get("title") or "").lower()
    cmdline = " ".join(str(part) for part in (row.get("cmdline") or [])).lower()
    if process_names and process_name not in process_names:
        return False
    if title_contains and not any(fragment in title for fragment in title_contains):
        return False
    if cmdline_contains and not all(fragment in cmdline for fragment in cmdline_contains):
        return False
    return True


def is_shell_popup_candidate(row):
    process_name = (row.get("processName") or "").lower()
    class_name = (row.get("className") or "").lower()
    title = (row.get("title") or "").lower()

    if process_name in SHELL_PROCESS_NAMES:
        return True

    if process_name in TERMINAL_HOST_PROCESS_NAMES:
        if "php-cgi" in title or "php.exe" in title or "terminal" in title:
            return True

    if "cascadia_hosting_window_class" in class_name and ("terminal" in title or "php-cgi" in title or "php.exe" in title):
        return True

    return False


def best_window_match(rows, process_names, title_contains, pid=None, cmdline_contains=None):
    matches = [row for row in rows if match_window(row, process_names, title_contains, pid, cmdline_contains)]
    if not matches:
        return None
    matches.sort(key=lambda row: (
        is_transient_runtime_wrapper(row),
        row["title"] == "",
        row["minimized"],
        -(row["rect"]["width"] * row["rect"]["height"])
    ))
    return matches[0]


def is_transient_runtime_wrapper(row):
    process_name = (row.get("processName") or "").lower()
    title = (row.get("title") or "").strip().lower()
    class_name = (row.get("className") or "").strip().lower()
    return (
        process_name == "flashpointsecureplayer.exe" and
        (title == "flashpoint secure player" or class_name == "#32770")
    )


def guess_runtime_window(process_names=None, title_contains=None, pid=None, cmdline_contains=None):
    rows = enum_windows(include_untitled=True)
    process_names = process_names or set()
    title_contains = title_contains or []
    cmdline_contains = cmdline_contains or []

    if process_names or title_contains or pid is not None or cmdline_contains:
        exact = best_window_match(rows, process_names, title_contains, pid, cmdline_contains)
        if exact:
            return exact

    candidates = []
    for row in rows:
        if pid is not None and int(row.get("pid") or -1) != pid:
            continue
        if cmdline_contains and not all(fragment in " ".join(str(part) for part in (row.get("cmdline") or [])).lower() for fragment in cmdline_contains):
            continue
        if is_shell_popup_candidate(row) or is_transient_runtime_wrapper(row):
            continue
        process_name = (row.get("processName") or "").lower()
        title = (row.get("title") or "").lower()
        if process_name in RUNTIME_WINDOW_PROCESS_NAMES:
            candidates.append(row)
            continue
        if "poptropica" in title and process_name in RUNTIME_BROWSER_PROCESS_NAMES:
            candidates.append(row)

    if not candidates:
        return None

    candidates.sort(key=lambda row: (
        row["title"] == "",
        row["minimized"],
        -(row["rect"]["width"] * row["rect"]["height"])
    ))
    return candidates[0]


def resolve_window_row(hwnd, process_names=None, title_contains=None, pid=None, cmdline_contains=None):
    process_names = process_names or set()
    title_contains = title_contains or []
    cmdline_contains = cmdline_contains or []
    row = window_row(hwnd)
    if row and match_window(row, process_names, title_contains, pid, cmdline_contains):
        return row

    if not process_names and not title_contains and pid is None and not cmdline_contains:
        return None

    for _ in range(5):
        time.sleep(0.25)
        row = guess_runtime_window(process_names, title_contains, pid, cmdline_contains)
        if row:
            return row

    return None


def child_window_rows(hwnd):
    rows = []

    def callback(child_hwnd, _):
        row = window_row(child_hwnd)
        if row:
            rows.append(row)

    win32gui.EnumChildWindows(int(hwnd), callback, None)
    rows.sort(key=lambda item: (item["rect"]["top"], item["rect"]["left"], item["handle"]))
    return rows


def sync_runtime_child_windows(hwnd):
    if not win32gui.IsWindow(hwnd):
        return {
            "ok": False,
            "reason": "invalid_window",
            "synced": [],
        }

    synced = []
    redraw_flags = (
        getattr(win32con, "RDW_INVALIDATE", 0x0001)
        | getattr(win32con, "RDW_ALLCHILDREN", 0x0080)
        | getattr(win32con, "RDW_UPDATENOW", 0x0100)
        | getattr(win32con, "RDW_FRAME", 0x0400)
    )

    for _pass_index in range(2):
        children = []

        def collect_child(child_hwnd, _extra):
            try:
                class_name = (win32gui.GetClassName(child_hwnd) or "").lower()
                if class_name in RUNTIME_RESIZE_CHILD_CLASSES and win32gui.IsWindowVisible(child_hwnd):
                    children.append(child_hwnd)
            except Exception:
                pass
            return True

        try:
            win32gui.EnumChildWindows(hwnd, collect_child, None)
        except Exception:
            pass

        # Parent content windows must be resized before nested plugin windows.
        children = sorted(set(children), key=lambda child_hwnd: rect_area((window_row(child_hwnd) or {}).get("rect")), reverse=True)
        for child_hwnd in children:
            try:
                class_name = (win32gui.GetClassName(child_hwnd) or "").lower()
                parent_hwnd = win32gui.GetParent(child_hwnd) or hwnd
                client = win32gui.GetClientRect(parent_hwnd)
                width = max(1, int(client[2] - client[0]))
                height = max(1, int(client[3] - client[1]))
                if width < 120 or height < 120:
                    continue
                before = window_row(child_hwnd)
                if class_name in RUNTIME_RESIZE_CHILD_CLASSES:
                    flags = win32con.SWP_NOACTIVATE | win32con.SWP_NOZORDER | getattr(win32con, "SWP_NOOWNERZORDER", 0x0200)
                    win32gui.SetWindowPos(child_hwnd, 0, 0, 0, width, height, flags)
                child_client = win32gui.GetClientRect(child_hwnd)
                child_width = max(1, int(child_client[2] - child_client[0]))
                child_height = max(1, int(child_client[3] - child_client[1]))
                size_param = (child_height << 16) | (child_width & 0xFFFF)
                win32gui.PostMessage(child_hwnd, win32con.WM_SIZE, win32con.SIZE_RESTORED, size_param)
                try:
                    win32gui.RedrawWindow(child_hwnd, None, None, redraw_flags)
                except Exception:
                    pass
                after = window_row(child_hwnd)
                synced.append({
                    "handle": int(child_hwnd),
                    "parentHandle": int(parent_hwnd),
                    "className": before.get("className") if before else None,
                    "before": before.get("rect") if before else None,
                    "after": after.get("rect") if after else None,
                    "targetClient": {
                        "width": width,
                        "height": height,
                    },
                    "postedClient": {
                        "width": child_width,
                        "height": child_height,
                    },
                })
            except Exception as error:
                synced.append({
                    "handle": int(child_hwnd),
                    "error": str(error),
                })

    try:
        win32gui.RedrawWindow(hwnd, None, None, redraw_flags)
    except Exception:
        pass

    return {
        "ok": True,
        "synced": synced,
    }


def rect_area(rect):
    if not rect:
        return 0
    return max(0, int(rect.get("right", 0)) - int(rect.get("left", 0))) * max(
        0,
        int(rect.get("bottom", 0)) - int(rect.get("top", 0)),
    )


def rect_to_bbox(rect):
    return (
        int(rect.get("left", 0)),
        int(rect.get("top", 0)),
        int(rect.get("right", 0)),
        int(rect.get("bottom", 0)),
    )


def set_capture_topmost(hwnd):
    flags = win32con.SWP_NOMOVE | win32con.SWP_NOSIZE | win32con.SWP_NOACTIVATE
    try:
        win32gui.ShowWindow(int(hwnd), win32con.SW_SHOWNOACTIVATE)
        try:
            win32gui.BringWindowToTop(int(hwnd))
        except Exception:
            pass
        win32gui.SetWindowPos(int(hwnd), win32con.HWND_TOPMOST, 0, 0, 0, 0, flags)
        try:
            redraw_flags = (
                getattr(win32con, "RDW_INVALIDATE", 0x0001)
                | getattr(win32con, "RDW_ALLCHILDREN", 0x0080)
                | getattr(win32con, "RDW_UPDATENOW", 0x0100)
                | getattr(win32con, "RDW_FRAME", 0x0400)
            )
            win32gui.RedrawWindow(int(hwnd), None, None, redraw_flags)
        except Exception:
            pass
        time.sleep(0.45)
        return True
    except Exception:
        return False


def restore_capture_topmost(hwnd):
    flags = win32con.SWP_NOMOVE | win32con.SWP_NOSIZE | win32con.SWP_NOACTIVATE
    try:
        win32gui.SetWindowPos(int(hwnd), win32con.HWND_NOTOPMOST, 0, 0, 0, 0, flags)
    except Exception:
        pass


def intersect_bboxes(left_bbox, right_bbox):
    left = max(int(left_bbox[0]), int(right_bbox[0]))
    top = max(int(left_bbox[1]), int(right_bbox[1]))
    right = min(int(left_bbox[2]), int(right_bbox[2]))
    bottom = min(int(left_bbox[3]), int(right_bbox[3]))
    if right <= left or bottom <= top:
        return None
    return (left, top, right, bottom)


def select_child_window(parent_hwnd, child_class_contains="", largest_child=False):
    candidates = [
        child for child in child_window_rows(parent_hwnd)
        if int(child.get("rect", {}).get("width", 0) or 0) > 0
        and int(child.get("rect", {}).get("height", 0) or 0) > 0
        and bool(child.get("visible", False))
    ]
    normalized_class = str(child_class_contains or "").strip().lower()
    if normalized_class:
        candidates = [
            child for child in candidates
            if normalized_class in str(child.get("className") or "").lower()
        ]
    elif not largest_child:
        return None
    if not candidates:
        return None

    parent = window_row(parent_hwnd)
    parent_bbox = rect_to_bbox(parent["rect"]) if parent else None

    def score(child):
        rect = child.get("rect") or {}
        class_name = str(child.get("className") or "").lower()
        class_priority = 0
        if "geckofpsandboxchildwindow" in class_name:
            class_priority = 3
        elif "geckopluginwindow" in class_name:
            class_priority = 2
        elif "mozillawindowclass" in class_name:
            class_priority = 1
        raw_area = rect_area(rect)
        if parent_bbox:
            visible_bbox = intersect_bboxes(rect_to_bbox(rect), parent_bbox)
            visible_area = (
                max(0, visible_bbox[2] - visible_bbox[0]) * max(0, visible_bbox[3] - visible_bbox[1])
                if visible_bbox
                else 0
            )
        else:
            visible_area = raw_area
        overflow_area = max(0, raw_area - visible_area)
        return (class_priority, visible_area, -overflow_area, raw_area)

    candidates.sort(key=score, reverse=True)
    return candidates[0]


def bring_to_front(hwnd):
    if win32gui.IsIconic(hwnd):
        win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
    else:
        try:
            maximized = bool(win32gui.IsZoomed(hwnd))
        except Exception:
            maximized = False
        if not maximized:
            win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
    try:
        win32gui.BringWindowToTop(hwnd)
    except Exception:
        pass
    attached_threads = []
    try:
        current_thread = win32api.GetCurrentThreadId()
        target_thread, _target_pid = win32process.GetWindowThreadProcessId(hwnd)
        foreground_hwnd = win32gui.GetForegroundWindow()
        foreground_thread, _foreground_pid = win32process.GetWindowThreadProcessId(foreground_hwnd) if foreground_hwnd else (0, 0)
        for thread_id in {target_thread, foreground_thread}:
            if thread_id and thread_id != current_thread:
                try:
                    win32process.AttachThreadInput(current_thread, thread_id, True)
                    attached_threads.append((current_thread, thread_id))
                except Exception:
                    pass
    except Exception:
        pass
    try:
        # A short Alt pulse helps Windows accept SetForegroundWindow from a helper process.
        win32api.keybd_event(win32con.VK_MENU, 0, 0, 0)
        win32api.keybd_event(win32con.VK_MENU, 0, win32con.KEYEVENTF_KEYUP, 0)
    except Exception:
        pass
    try:
        win32gui.SetWindowPos(hwnd, win32con.HWND_TOPMOST, 0, 0, 0, 0, win32con.SWP_NOMOVE | win32con.SWP_NOSIZE)
        win32gui.SetWindowPos(hwnd, win32con.HWND_NOTOPMOST, 0, 0, 0, 0, win32con.SWP_NOMOVE | win32con.SWP_NOSIZE)
    except Exception:
        pass
    try:
        win32gui.SetForegroundWindow(hwnd)
    except Exception:
        pass
    for current_thread, attached_thread in reversed(attached_threads):
        try:
            win32process.AttachThreadInput(current_thread, attached_thread, False)
        except Exception:
            pass
    time.sleep(0.4)


def is_monitor_sized_window(hwnd):
    try:
        left, top, right, bottom = win32gui.GetWindowRect(hwnd)
        width = max(1, int(right - left))
        height = max(1, int(bottom - top))
        monitor = win32api.MonitorFromWindow(hwnd, getattr(win32con, "MONITOR_DEFAULTTONEAREST", 2))
        info = win32api.GetMonitorInfo(monitor)
        mon_left, mon_top, mon_right, mon_bottom = info.get("Monitor") or info.get("Work")
        mon_width = max(1, int(mon_right - mon_left))
        mon_height = max(1, int(mon_bottom - mon_top))
        return (
            width >= int(mon_width * 0.94)
            and height >= int(mon_height * 0.88)
            and int(left) <= int(mon_left) + 16
            and int(top) <= int(mon_top) + 32
        )
    except Exception:
        return False


def pulse_runtime_window_layout(hwnd):
    try:
        if not win32gui.IsZoomed(hwnd) and not is_monitor_sized_window(hwnd):
            left, top, right, bottom = win32gui.GetWindowRect(hwnd)
            width = max(1, int(right - left))
            height = max(1, int(bottom - top))
            resize_flags = win32con.SWP_NOACTIVATE | win32con.SWP_NOZORDER
            win32gui.SetWindowPos(hwnd, 0, int(left), int(top), width + 1, height, resize_flags)
            time.sleep(0.08)
            win32gui.SetWindowPos(hwnd, 0, int(left), int(top), width, height, resize_flags)
    except Exception:
        pass
    try:
        sync_runtime_child_windows(hwnd)
    except Exception:
        pass
    try:
        client = win32gui.GetClientRect(hwnd)
        client_width = max(1, int(client[2] - client[0]))
        client_height = max(1, int(client[3] - client[1]))
        size_param = (client_height << 16) | (client_width & 0xFFFF)
        redraw_flags = (
            getattr(win32con, "RDW_INVALIDATE", 0x0001)
            | getattr(win32con, "RDW_ALLCHILDREN", 0x0080)
            | getattr(win32con, "RDW_UPDATENOW", 0x0100)
            | getattr(win32con, "RDW_FRAME", 0x0400)
        )
        targets = [hwnd]

        def collect_child(child_hwnd, _extra):
            targets.append(child_hwnd)
            return True

        try:
            win32gui.EnumChildWindows(hwnd, collect_child, None)
        except Exception:
            pass
        for target_hwnd in targets:
            try:
                win32gui.PostMessage(target_hwnd, win32con.WM_NCACTIVATE, 1, 0)
                win32gui.PostMessage(target_hwnd, win32con.WM_ACTIVATE, getattr(win32con, "WA_ACTIVE", 1), 0)
                win32gui.PostMessage(target_hwnd, win32con.WM_SETFOCUS, 0, 0)
                win32gui.PostMessage(target_hwnd, win32con.WM_SIZE, win32con.SIZE_RESTORED, size_param)
                win32gui.RedrawWindow(target_hwnd, None, None, redraw_flags)
            except Exception:
                pass
    except Exception:
        pass
    time.sleep(0.25)


def raise_window_no_activate(hwnd):
    if win32gui.IsIconic(hwnd):
        win32gui.ShowWindow(hwnd, win32con.SW_SHOWNOACTIVATE)
    flags = win32con.SWP_NOMOVE | win32con.SWP_NOSIZE | win32con.SWP_NOACTIVATE
    try:
        win32gui.SetWindowPos(hwnd, win32con.HWND_TOPMOST, 0, 0, 0, 0, flags)
        win32gui.SetWindowPos(hwnd, win32con.HWND_NOTOPMOST, 0, 0, 0, 0, flags)
    except Exception:
        pass
    try:
        if not win32gui.IsZoomed(hwnd):
            left, top, right, bottom = win32gui.GetWindowRect(hwnd)
            width = max(1, int(right - left))
            height = max(1, int(bottom - top))
            resize_flags = win32con.SWP_NOACTIVATE | win32con.SWP_NOZORDER
            win32gui.SetWindowPos(hwnd, 0, int(left), int(top), width + 1, height, resize_flags)
            time.sleep(0.08)
            win32gui.SetWindowPos(hwnd, 0, int(left), int(top), width, height, resize_flags)
    except Exception:
        pass
    try:
        sync_runtime_child_windows(hwnd)
    except Exception:
        pass
    try:
        client = win32gui.GetClientRect(hwnd)
        client_width = max(1, int(client[2] - client[0]))
        client_height = max(1, int(client[3] - client[1]))
        size_param = (client_height << 16) | (client_width & 0xFFFF)
        targets = [hwnd]

        def collect_child(child_hwnd, _extra):
            targets.append(child_hwnd)
            return True

        try:
            win32gui.EnumChildWindows(hwnd, collect_child, None)
        except Exception:
            pass
        for target_hwnd in targets:
            try:
                win32gui.PostMessage(target_hwnd, win32con.WM_NCACTIVATE, 1, 0)
                win32gui.PostMessage(target_hwnd, win32con.WM_ACTIVATE, getattr(win32con, "WA_ACTIVE", 1), 0)
                win32gui.PostMessage(target_hwnd, win32con.WM_SETFOCUS, 0, 0)
                win32gui.PostMessage(target_hwnd, win32con.WM_SIZE, win32con.SIZE_RESTORED, size_param)
            except Exception:
                pass
    except Exception:
        pass
    try:
        redraw_flags = (
            getattr(win32con, "RDW_INVALIDATE", 0x0001)
            | getattr(win32con, "RDW_ALLCHILDREN", 0x0080)
            | getattr(win32con, "RDW_UPDATENOW", 0x0100)
            | getattr(win32con, "RDW_FRAME", 0x0400)
        )
        win32gui.RedrawWindow(hwnd, None, None, redraw_flags)
        try:
            win32gui.EnumChildWindows(
                hwnd,
                lambda child_hwnd, _extra: (
                    win32gui.RedrawWindow(child_hwnd, None, None, redraw_flags),
                    True
                )[1],
                None
            )
        except Exception:
            pass
    except Exception:
        pass
    for _attempt in range(2):
        time.sleep(0.18)
        try:
            client = win32gui.GetClientRect(hwnd)
            client_width = max(1, int(client[2] - client[0]))
            client_height = max(1, int(client[3] - client[1]))
            size_param = (client_height << 16) | (client_width & 0xFFFF)
            targets = [hwnd]

            def collect_child_for_pulse(child_hwnd, _extra):
                targets.append(child_hwnd)
                return True

            try:
                win32gui.EnumChildWindows(hwnd, collect_child_for_pulse, None)
            except Exception:
                pass
            for target_hwnd in targets:
                try:
                    win32gui.PostMessage(target_hwnd, win32con.WM_NCACTIVATE, 1, 0)
                    win32gui.PostMessage(target_hwnd, win32con.WM_ACTIVATE, getattr(win32con, "WA_ACTIVE", 1), 0)
                    win32gui.PostMessage(target_hwnd, win32con.WM_SETFOCUS, 0, 0)
                    win32gui.PostMessage(target_hwnd, win32con.WM_SIZE, win32con.SIZE_RESTORED, size_param)
                    win32gui.RedrawWindow(target_hwnd, None, None, redraw_flags)
                except Exception:
                    pass
        except Exception:
            pass
    time.sleep(0.25)


def post_synthetic_mouse_focus(parent_hwnd, target_hwnd):
    try:
        client = win32gui.GetClientRect(parent_hwnd)
        client_width = max(1, int(client[2] - client[0]))
        client_height = max(1, int(client[3] - client[1]))
        size_param = (client_height << 16) | (client_width & 0xFFFF)
        targets = []
        for candidate in (parent_hwnd, target_hwnd):
            if candidate and candidate not in targets:
                targets.append(candidate)
        for hwnd in targets:
            try:
                win32gui.PostMessage(hwnd, win32con.WM_NCACTIVATE, 1, 0)
                win32gui.PostMessage(hwnd, win32con.WM_ACTIVATE, getattr(win32con, "WA_ACTIVE", 1), 0)
                win32gui.PostMessage(hwnd, win32con.WM_SETFOCUS, 0, 0)
                win32gui.PostMessage(hwnd, win32con.WM_SIZE, win32con.SIZE_RESTORED, size_param)
            except Exception:
                pass
    except Exception:
        pass


def get_capture_bbox(hwnd, client_only):
    if client_only:
        left_top = win32gui.ClientToScreen(hwnd, (0, 0))
        client_rect = win32gui.GetClientRect(hwnd)
        right_bottom = win32gui.ClientToScreen(hwnd, (client_rect[2], client_rect[3]))
        left = int(left_top[0])
        top = int(left_top[1])
        right = int(right_bottom[0])
        bottom = int(right_bottom[1])
        class_name = (win32gui.GetClassName(hwnd) or "").lower()
        if "mozillawindowclass" in class_name:
            trim_top = 110
            trim_bottom = 24
            if (bottom - top) > (trim_top + trim_bottom + 200):
                top += trim_top
                bottom -= trim_bottom
        return (left, top, right, bottom)

    rect = win32gui.GetWindowRect(hwnd)
    return (int(rect[0]), int(rect[1]), int(rect[2]), int(rect[3]))


def monitor_popup_windows(duration_ms, interval_ms):
    started_at = time.time()
    end_at = started_at + (duration_ms / 1000.0)
    seen_shell = {}
    visible_shell = {}
    samples = []
    baseline_windows = enum_windows(include_untitled=True)
    baseline_keys = {
        f"{row.get('processName')}:{row.get('pid')}:{row.get('title')}:{row.get('handle')}"
        for row in baseline_windows
    }

    while time.time() < end_at:
        windows = enum_windows(include_untitled=True)
        shell_rows = [
            row for row in windows
            if is_shell_popup_candidate(row)
        ]
        samples.append({
            "at": now_iso(),
            "visibleWindowCount": len(windows),
            "shellPopupCount": len(shell_rows),
        })
        for row in shell_rows:
            window_key = f"{row['processName']}:{row['pid']}:{row['title']}:{row['handle']}"
            visible_shell[window_key] = row
            if window_key in baseline_keys:
                continue
            key = f"{row['processName']}:{row['pid']}:{row['title']}"
            if key not in seen_shell:
                seen_shell[key] = {
                    **row,
                    "firstSeenAt": now_iso(),
                }
        time.sleep(interval_ms / 1000.0)

    return {
        "generatedAt": now_iso(),
        "summary": {
            "sampleCount": len(samples),
            "shellPopupCount": len(seen_shell),
            "visibleShellPopupCount": len(visible_shell),
            "shellPopupSeen": bool(seen_shell) or bool(visible_shell),
            "maxVisibleWindowCount": max((sample["visibleWindowCount"] for sample in samples), default=0),
        },
        "baselineWindowCount": len(baseline_windows),
        "visibleShellPopups": list(visible_shell.values()),
        "shellPopups": list(seen_shell.values()),
        "samples": samples,
        "windows": enum_windows(include_untitled=True),
    }


def command_window_audit(args):
    payload = monitor_popup_windows(args.duration_ms, args.interval_ms)
    write_json_if_needed(payload, args.output)
    to_json(payload)


def command_sync_window_layout(args):
    process_names = parse_csv(getattr(args, "process_names", ""))
    title_contains = [fragment.strip().lower() for fragment in (getattr(args, "title_contains", "") or "").split(",") if fragment.strip()]
    cmdline_contains = [fragment.strip().lower() for fragment in (getattr(args, "cmdline_contains", "") or "").split(",") if fragment.strip()]
    pid = int(args.pid) if getattr(args, "pid", None) else None
    hwnd = int(args.handle) if getattr(args, "handle", None) else None
    row = window_row(hwnd) if hwnd else guess_runtime_window(process_names, title_contains, pid, cmdline_contains)
    if row and not match_window(row, process_names, title_contains, pid, cmdline_contains):
        row = guess_runtime_window(process_names, title_contains, pid, cmdline_contains)
    if not row:
        payload = {
            "ok": False,
            "generatedAt": now_iso(),
            "reason": "window_not_found",
            "searched": {
                "handle": hwnd,
                "processNames": sorted(process_names),
                "titleContains": title_contains,
                "cmdlineContains": cmdline_contains,
                "pid": pid,
            },
        }
        write_json_if_needed(payload, args.output)
        to_json(payload)
        sys.exit(2)

    sync = sync_runtime_child_windows(int(row["handle"]))
    payload = {
        "ok": bool(sync.get("ok")),
        "generatedAt": now_iso(),
        "window": window_row(int(row["handle"])) or row,
        "sync": sync,
    }
    write_json_if_needed(payload, args.output)
    to_json(payload)


def runtime_window_size(row):
    rect = row.get("rect") if isinstance(row, dict) else None
    if not rect:
        return None
    width = int(rect.get("width", 0) or 0)
    height = int(rect.get("height", 0) or 0)
    if width <= 0 or height <= 0:
        return None
    return (width, height)


def start_runtime_resize_relaunch(args, row, baseline_size, current_size):
    project_root = Path(__file__).resolve().parents[1]
    script = str(getattr(args, "resize_relaunch_script", "") or (project_root / "tools" / "runtime-resize-relaunch.js"))
    node_binary = os.environ.get("NODE") or "node"
    pid = int(getattr(args, "pid", 0) or row.get("pid") or 0)
    command = [
        node_binary,
        script,
        "--pid",
        str(pid),
        "--width",
        str(int(current_size[0])),
        "--height",
        str(int(current_size[1])),
    ]
    source_group = str(getattr(args, "resize_relaunch_source_group", "") or "").strip()
    if source_group:
        command.extend(["--source-group", source_group])
    target_monitor = os.environ.get("POPTROPICA_QA_MONITOR") or ""
    if target_monitor:
        command.extend(["--target-monitor", target_monitor])

    env = {
        **os.environ,
        "PYTHONIOENCODING": "utf-8",
    }
    creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0) | getattr(subprocess, "DETACHED_PROCESS", 0)
    try:
        child = subprocess.Popen(
            command,
            cwd=str(project_root),
            env=env,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creationflags,
        )
        return {
            "ok": True,
            "pid": child.pid,
            "command": command,
            "baselineSize": {
                "width": int(baseline_size[0]),
                "height": int(baseline_size[1]),
            },
            "currentSize": {
                "width": int(current_size[0]),
                "height": int(current_size[1]),
            },
        }
    except Exception as error:
        return {
            "ok": False,
            "error": str(error),
            "command": command,
            "baselineSize": {
                "width": int(baseline_size[0]),
                "height": int(baseline_size[1]),
            },
            "currentSize": {
                "width": int(current_size[0]),
                "height": int(current_size[1]),
            },
        }


def command_watch_window_layout(args):
    process_names = parse_csv(getattr(args, "process_names", ""))
    title_contains = [fragment.strip().lower() for fragment in (getattr(args, "title_contains", "") or "").split(",") if fragment.strip()]
    cmdline_contains = [fragment.strip().lower() for fragment in (getattr(args, "cmdline_contains", "") or "").split(",") if fragment.strip()]
    pid = int(args.pid) if getattr(args, "pid", None) else None
    hwnd = int(args.handle) if getattr(args, "handle", None) else None
    interval_sec = max(0.1, int(getattr(args, "interval_ms", 300) or 300) / 1000.0)
    duration_sec = max(1, int(getattr(args, "duration_sec", 43200) or 43200))
    start_delay_sec = max(0.0, int(getattr(args, "start_delay_ms", 0) or 0) / 1000.0)
    resize_relaunch = bool(getattr(args, "resize_relaunch", False))
    resize_relaunch_min_delta = max(16, int(getattr(args, "resize_relaunch_min_delta", 24) or 24))
    resize_relaunch_stable_sec = max(0.25, int(getattr(args, "resize_relaunch_stable_ms", 900) or 900) / 1000.0)
    deadline = time.monotonic() + duration_sec
    sync_count = 0
    found_count = 0
    last_payload = None
    baseline_size = None
    pending_size = None
    pending_since = None
    relaunch = None
    exit_reason = "duration_elapsed"

    if start_delay_sec > 0:
        time.sleep(min(start_delay_sec, max(0.0, deadline - time.monotonic())))

    while time.monotonic() < deadline:
        if pid and not psutil.pid_exists(pid):
            exit_reason = "process_exited"
            break

        row = window_row(hwnd) if hwnd else guess_runtime_window(process_names, title_contains, pid, cmdline_contains)
        if row and not match_window(row, process_names, title_contains, pid, cmdline_contains):
            row = guess_runtime_window(process_names, title_contains, pid, cmdline_contains)

        if row:
            found_count += 1
            sync = sync_runtime_child_windows(int(row["handle"]))
            sync_count += 1
            last_payload = {
                "window": window_row(int(row["handle"])) or row,
                "sync": sync,
            }
            current_size = runtime_window_size(last_payload["window"])
            if resize_relaunch and current_size:
                if baseline_size is None:
                    baseline_size = current_size
                else:
                    max_delta = max(abs(current_size[0] - baseline_size[0]), abs(current_size[1] - baseline_size[1]))
                    size_is_large_enough = current_size[0] >= 600 and current_size[1] >= 400
                    if max_delta >= resize_relaunch_min_delta and size_is_large_enough:
                        now = time.monotonic()
                        if pending_size != current_size:
                            pending_size = current_size
                            pending_since = now
                        elif pending_since and now - pending_since >= resize_relaunch_stable_sec:
                            relaunch = start_runtime_resize_relaunch(args, last_payload["window"], baseline_size, current_size)
                            exit_reason = "resize_relaunch_started" if relaunch.get("ok") else "resize_relaunch_failed"
                            break
                    else:
                        pending_size = None
                        pending_since = None
        time.sleep(interval_sec)

    payload = {
        "ok": found_count > 0,
        "generatedAt": now_iso(),
        "exitReason": exit_reason,
        "syncCount": sync_count,
        "foundCount": found_count,
        "last": last_payload,
        "resizeRelaunch": {
            "enabled": resize_relaunch,
            "minDelta": resize_relaunch_min_delta,
            "stableMs": int(resize_relaunch_stable_sec * 1000),
            "baselineSize": {
                "width": int(baseline_size[0]),
                "height": int(baseline_size[1]),
            } if baseline_size else None,
            "pendingSize": {
                "width": int(pending_size[0]),
                "height": int(pending_size[1]),
            } if pending_size else None,
            "launch": relaunch,
        },
        "watched": {
            "handle": hwnd,
            "processNames": sorted(process_names),
            "titleContains": title_contains,
            "cmdlineContains": cmdline_contains,
            "pid": pid,
            "intervalMs": int(interval_sec * 1000),
            "startDelayMs": int(start_delay_sec * 1000),
            "durationSec": duration_sec,
        },
    }
    write_json_if_needed(payload, getattr(args, "output", None))
    if not getattr(args, "quiet", False):
        to_json(payload)


def command_wait_window(args):
    process_names = parse_csv(args.process_names)
    title_contains = [fragment.strip().lower() for fragment in (args.title_contains or "").split(",") if fragment.strip()]
    cmdline_contains = [fragment.strip().lower() for fragment in (getattr(args, "cmdline_contains", "") or "").split(",") if fragment.strip()]
    pid = int(args.pid) if args.pid else None
    deadline = time.time() + (args.timeout_ms / 1000.0)
    match = None
    placement = None
    while time.time() < deadline:
        match = guess_runtime_window(process_names, title_contains, pid, cmdline_contains)
        if match:
            if getattr(args, "target_monitor", None):
                try:
                    placement = position_window_on_target_monitor(
                        int(match["handle"]),
                        args.target_monitor,
                        width=getattr(args, "window_width", None),
                        height=getattr(args, "window_height", None),
                        maximize=getattr(args, "maximize", False),
                    )
                    match = placement.get("windowAfterMove") or window_row(int(match["handle"])) or match
                except RuntimeError:
                    match = None
                    placement = None
                    time.sleep(args.poll_ms / 1000.0)
                    continue
            break
        time.sleep(args.poll_ms / 1000.0)

    payload = {
        "ok": bool(match),
        "generatedAt": now_iso(),
        "match": match,
        "placement": placement,
        "searched": {
            "processNames": sorted(process_names),
            "titleContains": title_contains,
            "cmdlineContains": cmdline_contains,
            "pid": pid,
            "timeoutMs": args.timeout_ms,
            "targetMonitor": getattr(args, "target_monitor", None),
        },
    }
    write_json_if_needed(payload, args.output)
    to_json(payload)
    if not match:
        sys.exit(2)


def command_capture_window(args):
    hwnd = int(args.handle)
    process_names = parse_csv(getattr(args, "process_names", ""))
    title_contains = [fragment.strip().lower() for fragment in (getattr(args, "title_contains", "") or "").split(",") if fragment.strip()]
    cmdline_contains = [fragment.strip().lower() for fragment in (getattr(args, "cmdline_contains", "") or "").split(",") if fragment.strip()]
    pid = int(args.pid) if getattr(args, "pid", None) else None
    placement = None
    if getattr(args, "target_monitor", None):
        placement = position_window_on_target_monitor(
            hwnd,
            args.target_monitor,
            width=getattr(args, "window_width", None),
            height=getattr(args, "window_height", None),
            maximize=args.maximize,
        )
    elif args.maximize:
        try:
            win32gui.ShowWindow(hwnd, win32con.SW_MAXIMIZE)
            time.sleep(0.35)
        except Exception:
            pass
    if not getattr(args, "no_foreground", False):
        bring_to_front(hwnd)
        pulse_runtime_window_layout(hwnd)
    else:
        raise_window_no_activate(hwnd)
    row = resolve_window_row(hwnd, process_names, title_contains, pid, cmdline_contains)
    if not row and cmdline_contains:
        row = guess_runtime_window(process_names, title_contains, None, cmdline_contains)
    if not row:
        raise RuntimeError(f"Window handle {hwnd} is not valid.")
    layout_sync = sync_runtime_child_windows(int(row["handle"]))
    time.sleep(0.12)
    row = window_row(int(row["handle"])) or row
    target_row = row
    parent_hwnd = int(row["handle"])
    child_class_contains = str(getattr(args, "child_class_contains", "") or "").strip().lower()
    if getattr(args, "largest_child", False) or child_class_contains:
        target_row = select_child_window(parent_hwnd, child_class_contains, getattr(args, "largest_child", False)) or target_row
    hwnd = int(target_row["handle"])
    raw_bbox = get_capture_bbox(hwnd, args.client_only)
    bbox = raw_bbox
    capture_clip = None
    if int(target_row["handle"]) != parent_hwnd:
        clipped_bbox = intersect_bboxes(raw_bbox, rect_to_bbox(row["rect"]))
        if clipped_bbox:
            bbox = clipped_bbox
            capture_clip = {
                "clippedToParentWindow": bbox != raw_bbox,
                "rawCaptureBox": {
                    "left": int(raw_bbox[0]),
                    "top": int(raw_bbox[1]),
                    "right": int(raw_bbox[2]),
                    "bottom": int(raw_bbox[3]),
                    "width": int(max(0, raw_bbox[2] - raw_bbox[0])),
                    "height": int(max(0, raw_bbox[3] - raw_bbox[1])),
                },
            }
    topmost_applied = False
    try:
        if getattr(args, "no_foreground", False):
            topmost_applied = set_capture_topmost(parent_hwnd)
            sync_runtime_child_windows(parent_hwnd)
        image = ImageGrab.grab(bbox=bbox, all_screens=True)
    finally:
        if topmost_applied:
            restore_capture_topmost(parent_hwnd)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output)
    payload = {
        "ok": True,
        "generatedAt": now_iso(),
        "savedTo": str(output),
        "window": row,
        "targetWindow": target_row,
        "placement": placement,
        "layoutSync": layout_sync,
        "captureMode": "client" if args.client_only else "window",
        "topmostDuringCapture": bool(topmost_applied),
        "captureBox": {
            "left": int(bbox[0]),
            "top": int(bbox[1]),
            "right": int(bbox[2]),
            "bottom": int(bbox[3]),
            "width": int(max(0, bbox[2] - bbox[0])),
            "height": int(max(0, bbox[3] - bbox[1])),
        },
        "captureClip": capture_clip,
        "imageSize": {
            "width": image.width,
            "height": image.height,
        },
    }
    write_json_if_needed(payload, args.metadata_output)
    to_json(payload)


def command_capture_window_sequence(args):
    hwnd = int(args.handle)
    process_names = parse_csv(getattr(args, "process_names", ""))
    title_contains = [fragment.strip().lower() for fragment in (getattr(args, "title_contains", "") or "").split(",") if fragment.strip()]
    cmdline_contains = [fragment.strip().lower() for fragment in (getattr(args, "cmdline_contains", "") or "").split(",") if fragment.strip()]
    pid = int(args.pid) if getattr(args, "pid", None) else None
    delays = []
    for item in parse_csv(getattr(args, "sample_ms", "")):
        try:
            delays.append(max(0, int(float(item))))
        except Exception:
            pass
    delays = sorted(set(delays or [0]))
    placement = None
    if getattr(args, "target_monitor", None):
        placement = position_window_on_target_monitor(
            hwnd,
            args.target_monitor,
            width=getattr(args, "window_width", None),
            height=getattr(args, "window_height", None),
            maximize=args.maximize,
        )
    elif args.maximize:
        try:
            win32gui.ShowWindow(hwnd, win32con.SW_MAXIMIZE)
            time.sleep(0.35)
        except Exception:
            pass
    if not getattr(args, "no_foreground", False):
        bring_to_front(hwnd)
        pulse_runtime_window_layout(hwnd)
    else:
        raise_window_no_activate(hwnd)
    row = resolve_window_row(hwnd, process_names, title_contains, pid, cmdline_contains)
    if not row and cmdline_contains:
        row = guess_runtime_window(process_names, title_contains, None, cmdline_contains)
    if not row:
        raise RuntimeError(f"Window handle {hwnd} is not valid.")
    layout_sync = sync_runtime_child_windows(int(row["handle"]))
    time.sleep(0.12)
    row = window_row(int(row["handle"])) or row
    target_row = row
    parent_hwnd = int(row["handle"])
    child_class_contains = str(getattr(args, "child_class_contains", "") or "").strip().lower()
    if getattr(args, "largest_child", False) or child_class_contains:
        target_row = select_child_window(parent_hwnd, child_class_contains, getattr(args, "largest_child", False)) or target_row
    hwnd = int(target_row["handle"])
    raw_bbox = get_capture_bbox(hwnd, args.client_only)
    bbox = raw_bbox
    capture_clip = None
    if int(target_row["handle"]) != parent_hwnd:
        clipped_bbox = intersect_bboxes(raw_bbox, rect_to_bbox(row["rect"]))
        if clipped_bbox:
            bbox = clipped_bbox
            capture_clip = {
                "clippedToParentWindow": bbox != raw_bbox,
                "rawCaptureBox": {
                    "left": int(raw_bbox[0]),
                    "top": int(raw_bbox[1]),
                    "right": int(raw_bbox[2]),
                    "bottom": int(raw_bbox[3]),
                    "width": int(max(0, raw_bbox[2] - raw_bbox[0])),
                    "height": int(max(0, raw_bbox[3] - raw_bbox[1])),
                },
            }

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    stem = str(getattr(args, "stem", "") or "capture")
    samples = []
    start = time.perf_counter()
    for delay_ms in delays:
        target_time = start + delay_ms / 1000.0
        now = time.perf_counter()
        if target_time > now:
            time.sleep(target_time - now)
        captured_at_ms = int(round((time.perf_counter() - start) * 1000))
        topmost_applied = False
        try:
            if getattr(args, "no_foreground", False):
                topmost_applied = set_capture_topmost(parent_hwnd)
                sync_runtime_child_windows(parent_hwnd)
            image = ImageGrab.grab(bbox=bbox, all_screens=True)
        finally:
            if topmost_applied:
                restore_capture_topmost(parent_hwnd)
        output = output_dir / f"{stem}-{delay_ms}.png"
        image.save(output)
        samples.append({
            "delayMs": delay_ms,
            "capturedAtMs": captured_at_ms,
            "savedTo": str(output),
            "topmostDuringCapture": bool(topmost_applied),
            "imageSize": {
                "width": image.width,
                "height": image.height,
            },
        })

    payload = {
        "ok": True,
        "generatedAt": now_iso(),
        "window": row,
        "targetWindow": target_row,
        "placement": placement,
        "layoutSync": layout_sync,
        "captureMode": "client" if args.client_only else "window",
        "captureBox": {
            "left": int(bbox[0]),
            "top": int(bbox[1]),
            "right": int(bbox[2]),
            "bottom": int(bbox[3]),
            "width": int(max(0, bbox[2] - bbox[0])),
            "height": int(max(0, bbox[3] - bbox[1])),
        },
        "captureClip": capture_clip,
        "sampleMs": delays,
        "samples": samples,
    }
    write_json_if_needed(payload, args.metadata_output)
    to_json(payload)


def _clamp_box(left, top, right, bottom, width, height):
    return (
        max(0, min(width, int(left))),
        max(0, min(height, int(top))),
        max(0, min(width, int(right))),
        max(0, min(height, int(bottom))),
    )


def _find_background_run(ratios, threshold, min_run, start_index):
    run_length = 0
    for index in range(max(0, int(start_index)), len(ratios)):
        if float(ratios[index]) >= float(threshold):
            run_length += 1
            if run_length >= int(min_run):
                return index - run_length + 1
        else:
            run_length = 0
    return len(ratios)


def _find_active_run(ratios, threshold, min_run, start_index):
    run_length = 0
    for index in range(max(0, int(start_index)), len(ratios)):
        if float(ratios[index]) < float(threshold):
            run_length += 1
            if run_length >= int(min_run):
                return index - run_length + 1
        else:
            run_length = 0
    return None


def _detect_stage_rect(image, tolerance):
    rgb = np.array(image.convert("RGB"))
    if rgb.size == 0:
        return None
    background = rgb[-1, -1].astype(np.int16)
    diff = np.abs(rgb.astype(np.int16) - background)
    bg_mask = np.max(diff, axis=2) <= int(tolerance)
    mask = ~bg_mask
    if not np.any(mask):
        return None
    row_background_ratio = bg_mask.mean(axis=1)
    col_background_ratio = bg_mask.mean(axis=0)
    ignore_top = min(max(24, rgb.shape[0] // 30), max(0, rgb.shape[0] - 1))
    active_run = max(12, rgb.shape[1] // 120)
    bg_run = max(24, rgb.shape[1] // 80)
    trimmed_bg_mask = bg_mask[ignore_top:, :]
    if trimmed_bg_mask.size:
        trimmed_col_background_ratio = trimmed_bg_mask.mean(axis=0)
        left = _find_active_run(trimmed_col_background_ratio, threshold=0.965, min_run=active_run, start_index=0)
        if left is not None:
            right = _find_background_run(trimmed_col_background_ratio, threshold=0.975, min_run=bg_run, start_index=left + active_run)
            if right > left:
                windowed_bg_mask = bg_mask[:, left:right]
                windowed_row_background_ratio = windowed_bg_mask.mean(axis=1)
                top = _find_active_run(windowed_row_background_ratio, threshold=0.965, min_run=max(8, rgb.shape[0] // 120), start_index=ignore_top)
                if top is None:
                    top = 0
                bottom = _find_background_run(
                    windowed_row_background_ratio,
                    threshold=0.975,
                    min_run=max(24, rgb.shape[0] // 80),
                    start_index=top + max(8, rgb.shape[0] // 120),
                )
                if bottom > top:
                    width = max(0, int(right - left))
                    height = max(0, int(bottom - top))
                    if width >= rgb.shape[1] * 0.18 and height >= rgb.shape[0] * 0.18:
                        return {
                            "left": int(left),
                            "top": int(top),
                            "right": int(right),
                            "bottom": int(bottom),
                            "width": width,
                            "height": height,
                        }
    anchored_right = _find_background_run(
        col_background_ratio,
        threshold=0.97,
        min_run=max(24, rgb.shape[1] // 80),
        start_index=max(1, rgb.shape[1] // 5),
    )
    anchored_bottom = _find_background_run(
        row_background_ratio,
        threshold=0.97,
        min_run=max(24, rgb.shape[0] // 80),
        start_index=max(1, rgb.shape[0] // 6),
    )
    if anchored_right < rgb.shape[1] and anchored_bottom < rgb.shape[0]:
        width = max(0, int(anchored_right))
        height = max(0, int(anchored_bottom))
        if width >= rgb.shape[1] * 0.2 and height >= rgb.shape[0] * 0.2:
            return {
                "left": 0,
                "top": 0,
                "right": width,
                "bottom": height,
                "width": width,
                "height": height,
            }
    row_threshold = 0.95
    col_threshold = 0.95
    active_rows = np.where(row_background_ratio < row_threshold)[0]
    active_cols = np.where(col_background_ratio < col_threshold)[0]
    if active_rows.size == 0 or active_cols.size == 0:
        ys, xs = np.where(mask)
        if ys.size == 0 or xs.size == 0:
            return None
        left = int(xs.min())
        right = int(xs.max()) + 1
        top = int(ys.min())
        bottom = int(ys.max()) + 1
    else:
        left = int(active_cols.min())
        right = int(active_cols.max()) + 1
        top = int(active_rows.min())
        bottom = int(active_rows.max()) + 1
    return {
        "left": left,
        "top": top,
        "right": right,
        "bottom": bottom,
        "width": max(0, right - left),
        "height": max(0, bottom - top),
    }


def command_analyze_stage(args):
    image = Image.open(args.input)
    width, height = image.size
    stage_rect = _detect_stage_rect(image, args.tolerance)
    image_area = max(1, width * height)
    stage_area = 0
    coverage = 0.0
    if stage_rect:
        stage_area = max(1, stage_rect["width"] * stage_rect["height"])
        coverage = round(stage_area / image_area, 6)
    payload = {
        "ok": bool(stage_rect),
        "generatedAt": now_iso(),
        "input": args.input,
        "imageSize": {
            "width": width,
            "height": height,
        },
        "stageRect": stage_rect,
        "stageCoverageRatio": coverage,
    }
    write_json_if_needed(payload, args.output)
    to_json(payload)
    if not stage_rect:
        sys.exit(2)


def command_analyze_loading_center(args):
    image = Image.open(args.input).convert("RGB")
    width, height = image.size
    rgb = np.array(image)
    left = int(width * float(args.center_left_ratio))
    right = int(width * float(args.center_right_ratio))
    top = int(height * float(args.center_top_ratio))
    bottom = int(height * float(args.center_bottom_ratio))
    left = max(0, min(width, left))
    right = max(left + 1, min(width, right))
    top = max(0, min(height, top))
    bottom = max(top + 1, min(height, bottom))
    region = rgb[top:bottom, left:right, :].astype(np.int16)
    total = int(max(1, region.shape[0] * region.shape[1]))
    dark_threshold = int(args.dark_threshold)
    dark_mask = np.all(region <= dark_threshold, axis=2)
    dark_pct = round(float(dark_mask.mean() * 100.0), 6)

    red = region[:, :, 0]
    green = region[:, :, 1]
    blue = region[:, :, 2]
    blue_logo_mask = (
        (blue >= int(args.min_blue)) &
        (green >= int(args.min_green)) &
        (blue >= red + int(args.min_blue_red_delta)) &
        (blue >= green - int(args.max_green_blue_delta))
    )
    pale_highlight_mask = (
        (red >= 110) &
        (green >= 155) &
        (blue >= 185) &
        (blue >= red + 25)
    )
    feature_mask = blue_logo_mask | pale_highlight_mask
    feature_pixels = int(feature_mask.sum())
    feature_pct = round(float(feature_pixels / total * 100.0), 6)
    detected = bool(
        dark_pct >= float(args.min_center_dark_pct) and
        feature_pixels >= int(args.min_feature_pixels)
    )

    box = None
    offset = None
    if feature_pixels > 0:
        ys, xs = np.where(feature_mask)
        box_left = int(left + xs.min())
        box_right = int(left + xs.max()) + 1
        box_top = int(top + ys.min())
        box_bottom = int(top + ys.max()) + 1
        center_x = (box_left + box_right) / 2.0
        center_y = (box_top + box_bottom) / 2.0
        dx = center_x - width / 2.0
        dy = center_y - height / 2.0
        box = {
            "left": box_left,
            "top": box_top,
            "right": box_right,
            "bottom": box_bottom,
            "width": int(max(0, box_right - box_left)),
            "height": int(max(0, box_bottom - box_top)),
            "centerX": int(round(center_x)),
            "centerY": int(round(center_y)),
        }
        offset = {
            "x": int(round(dx)),
            "y": int(round(dy)),
            "xRatio": round(float(dx / max(1, width)), 4),
            "yRatio": round(float(dy / max(1, height)), 4),
        }

    payload = {
        "ok": detected,
        "detected": detected,
        "generatedAt": now_iso(),
        "input": args.input,
        "imageSize": {
            "width": width,
            "height": height,
        },
        "centerRegion": {
            "left": left,
            "top": top,
            "right": right,
            "bottom": bottom,
            "width": int(max(0, right - left)),
            "height": int(max(0, bottom - top)),
        },
        "darkPct": dark_pct,
        "featurePixels": feature_pixels,
        "featurePct": feature_pct,
        "box": box,
        "offset": offset,
        "thresholds": {
            "darkThreshold": dark_threshold,
            "minCenterDarkPct": float(args.min_center_dark_pct),
            "minFeaturePixels": int(args.min_feature_pixels),
        },
    }
    write_json_if_needed(payload, args.output)
    to_json(payload)


def _parse_hex_color(value):
    text = str(value or "").strip().lstrip("#")
    if not text:
        return None
    if len(text) == 3:
        text = "".join(ch * 2 for ch in text)
    if not re.fullmatch(r"[0-9a-fA-F]{6}", text):
        raise ValueError(f"Invalid hex color: {value!r}")
    return np.array([int(text[index:index + 2], 16) for index in range(0, 6, 2)], dtype=np.int16)


def _region_payload(rgb, box, args, target_color):
    left, top, right, bottom = box
    region = rgb[top:bottom, left:right, :]
    total = int(max(1, region.shape[0] * region.shape[1]))
    white_threshold = int(args.white_threshold)
    white_mask = np.all(region >= white_threshold, axis=2)
    dark_threshold = int(args.dark_threshold)
    dark_mask = np.all(region <= dark_threshold, axis=2)
    payload = {
        "box": {
            "left": int(left),
            "top": int(top),
            "right": int(right),
            "bottom": int(bottom),
            "width": int(max(0, right - left)),
            "height": int(max(0, bottom - top)),
        },
        "whitePct": round(float(white_mask.mean() * 100.0), 6),
        "darkPct": round(float(dark_mask.mean() * 100.0), 6),
    }
    if target_color is not None:
        tolerance = int(args.target_tolerance)
        diff = np.abs(region.astype(np.int16) - target_color)
        target_mask = np.max(diff, axis=2) <= tolerance
        payload["targetColorPct"] = round(float(target_mask.mean() * 100.0), 6)
    return payload


def command_analyze_visual_guard(args):
    image = Image.open(args.input).convert("RGB")
    width, height = image.size
    rgb = np.array(image)
    sample_step = max(1, int(args.complexity_sample_step))
    sampled = rgb[::sample_step, ::sample_step, :].reshape(-1, 3)
    if sampled.shape[0] > int(args.max_complexity_samples):
        stride = max(1, int(math.ceil(sampled.shape[0] / int(args.max_complexity_samples))))
        sampled = sampled[::stride]
    unique_colors, unique_counts = np.unique(sampled, axis=0, return_counts=True)
    sampled_total = int(max(1, sampled.shape[0]))
    sampled_unique_color_count = int(unique_colors.shape[0])
    dominant_color_pct = round(float(unique_counts.max() / sampled_total * 100.0), 6) if unique_counts.size else 100.0
    edge_ratio = max(0.02, min(0.5, float(args.edge_ratio)))
    edge_width = max(1, int(round(width * edge_ratio)))
    edge_height = max(1, int(round(height * edge_ratio)))
    target_color = _parse_hex_color(args.target_color)
    regions = {
        "topMargin": _region_payload(rgb, (0, 0, width, edge_height), args, target_color),
        "leftMargin": _region_payload(rgb, (0, 0, edge_width, height), args, target_color),
        "rightMargin": _region_payload(rgb, (width - edge_width, 0, width, height), args, target_color),
        "bottomMargin": _region_payload(rgb, (0, height - edge_height, width, height), args, target_color),
        "topLeftCorner": _region_payload(rgb, (0, 0, edge_width, edge_height), args, target_color),
        "topRightCorner": _region_payload(rgb, (width - edge_width, 0, width, edge_height), args, target_color),
        "bottomLeftCorner": _region_payload(rgb, (0, height - edge_height, edge_width, height), args, target_color),
        "bottomRightCorner": _region_payload(rgb, (width - edge_width, height - edge_height, width, height), args, target_color),
    }
    max_white_edge_pct = float(args.max_white_edge_pct)
    max_dark_edge_pct = float(args.max_dark_edge_pct)
    checks = [
        {
            "name": f"{name}_white_pct",
            "ok": float(region["whitePct"]) <= max_white_edge_pct,
            "observedPct": region["whitePct"],
            "maxPct": max_white_edge_pct,
        }
        for name, region in regions.items()
    ]
    checks.extend([
        {
            "name": f"{name}_dark_pct",
            "ok": float(region["darkPct"]) <= max_dark_edge_pct,
            "observedPct": region["darkPct"],
            "maxPct": max_dark_edge_pct,
        }
        for name, region in regions.items()
    ])
    if target_color is not None:
        max_target_edge_pct = float(args.max_target_edge_pct)
        checks.extend([
            {
                "name": f"{name}_target_color_pct",
                "ok": float(region.get("targetColorPct", 0.0)) <= max_target_edge_pct,
                "observedPct": region.get("targetColorPct", 0.0),
                "maxPct": max_target_edge_pct,
            }
            for name, region in regions.items()
        ])
    checks.extend([
        {
            "name": "sampled_unique_color_count",
            "ok": sampled_unique_color_count >= int(args.min_sampled_unique_colors),
            "observed": sampled_unique_color_count,
            "min": int(args.min_sampled_unique_colors),
        },
        {
            "name": "dominant_color_pct",
            "ok": dominant_color_pct <= float(args.max_dominant_color_pct),
            "observedPct": dominant_color_pct,
            "maxPct": float(args.max_dominant_color_pct),
        },
    ])
    payload = {
        "ok": all(check["ok"] for check in checks),
        "generatedAt": now_iso(),
        "input": args.input,
        "imageSize": {
            "width": width,
            "height": height,
        },
        "edgeRatio": edge_ratio,
        "whiteThreshold": int(args.white_threshold),
        "darkThreshold": int(args.dark_threshold),
        "targetColor": str(args.target_color or "").strip() or None,
        "targetTolerance": int(args.target_tolerance),
        "complexity": {
            "sampleStep": sample_step,
            "sampleCount": sampled_total,
            "sampledUniqueColorCount": sampled_unique_color_count,
            "dominantColorPct": dominant_color_pct,
        },
        "regions": regions,
        "checks": checks,
    }
    write_json_if_needed(payload, args.output)
    to_json(payload)


def _connected_components(mask, min_pixels=1):
    height, width = mask.shape
    seen = np.zeros(mask.shape, dtype=bool)
    components = []
    for y in range(height):
        for x in range(width):
            if not mask[y, x] or seen[y, x]:
                continue
            stack = [(x, y)]
            seen[y, x] = True
            xs = []
            ys = []
            count = 0
            while stack:
                cx, cy = stack.pop()
                xs.append(cx)
                ys.append(cy)
                count += 1
                for ny in range(cy - 1, cy + 2):
                    for nx in range(cx - 1, cx + 2):
                        if (
                            nx < 0 or nx >= width or
                            ny < 0 or ny >= height or
                            seen[ny, nx] or
                            not mask[ny, nx]
                        ):
                            continue
                        seen[ny, nx] = True
                        stack.append((nx, ny))
            if count >= min_pixels:
                left = int(min(xs))
                right = int(max(xs)) + 1
                top = int(min(ys))
                bottom = int(max(ys)) + 1
                components.append({
                    "pixels": int(count),
                    "left": left,
                    "top": top,
                    "right": right,
                    "bottom": bottom,
                    "width": int(right - left),
                    "height": int(bottom - top),
                    "centerX": int(round((left + right) / 2.0)),
                    "centerY": int(round((top + bottom) / 2.0)),
                })
    return components


def command_analyze_hud_diff(args):
    image = Image.open(args.input).convert("RGB")
    baseline = Image.open(args.baseline).convert("RGB")
    if image.size != baseline.size:
        raise ValueError(f"HUD diff images must have the same size: {image.size} != {baseline.size}")

    width, height = image.size
    stage_rect = None
    if args.stage_json:
        stage_payload = json.loads(Path(args.stage_json).read_text(encoding="utf-8"))
        stage_rect = stage_payload.get("stageRect") or None
    if not stage_rect:
        stage_rect = {
            "left": 0,
            "top": 0,
            "right": width,
            "bottom": height,
            "width": width,
            "height": height,
        }

    stage_left = int(stage_rect.get("left", 0))
    stage_top = int(stage_rect.get("top", 0))
    stage_right = int(stage_rect.get("right", width))
    stage_bottom = int(stage_rect.get("bottom", height))
    stage_width = max(1, int(stage_rect.get("width", stage_right - stage_left)))
    stage_height = max(1, int(stage_rect.get("height", stage_bottom - stage_top)))

    top_bottom = min(stage_bottom, stage_top + int(round(stage_height * float(args.top_ratio))))
    right_left = max(stage_left, stage_right - int(round(stage_width * float(args.right_ratio))))
    diff_threshold = int(args.diff_threshold)

    rgb = np.array(image).astype(np.int16)
    base = np.array(baseline).astype(np.int16)
    diff = np.max(np.abs(rgb - base), axis=2)
    top_mask = np.zeros((height, width), dtype=bool)
    top_mask[stage_top:top_bottom, stage_left:stage_right] = diff[stage_top:top_bottom, stage_left:stage_right] >= diff_threshold

    all_components = _connected_components(top_mask, min_pixels=int(args.min_component_pixels))
    all_components.sort(key=lambda comp: (comp["left"], comp["top"]))
    hud_components = [
        comp for comp in all_components
        if (
            comp["left"] >= right_left and
            comp["width"] >= int(args.min_icon_width) and
            comp["height"] >= int(args.min_icon_height)
        )
    ]
    unexpected_components = [
        comp for comp in all_components
        if comp["right"] < right_left and comp["pixels"] >= int(args.min_unexpected_pixels)
    ]

    hud_box = None
    right_margin = None
    top_margin = None
    row_spread = None
    gaps = []
    if hud_components:
        left = min(comp["left"] for comp in hud_components)
        right = max(comp["right"] for comp in hud_components)
        top = min(comp["top"] for comp in hud_components)
        bottom = max(comp["bottom"] for comp in hud_components)
        hud_box = {
            "left": int(left),
            "top": int(top),
            "right": int(right),
            "bottom": int(bottom),
            "width": int(right - left),
            "height": int(bottom - top),
            "centerX": int(round((left + right) / 2.0)),
            "centerY": int(round((top + bottom) / 2.0)),
        }
        right_margin = int(stage_right - right)
        top_margin = int(top - stage_top)
        row_spread = int(max(comp["centerY"] for comp in hud_components) - min(comp["centerY"] for comp in hud_components))
        ordered = sorted(hud_components, key=lambda comp: comp["left"])
        for index in range(1, len(ordered)):
            gaps.append(int(ordered[index]["left"] - ordered[index - 1]["right"]))
    hud_width_ratio = None
    if hud_box and stage_width > 0:
        hud_width_ratio = float(hud_box["width"]) / float(stage_width)

    checks = [
        {
            "name": "hud_component_count",
            "ok": len(hud_components) >= int(args.min_hud_components),
            "observed": len(hud_components),
            "min": int(args.min_hud_components),
        },
        {
            "name": "hud_right_margin",
            "ok": right_margin is not None and right_margin >= int(args.min_right_margin) and right_margin <= int(args.max_right_margin),
            "observed": right_margin,
            "min": int(args.min_right_margin),
            "max": int(args.max_right_margin),
        },
        {
            "name": "hud_top_margin",
            "ok": top_margin is not None and top_margin >= int(args.min_top_margin) and top_margin <= int(args.max_top_margin),
            "observed": top_margin,
            "min": int(args.min_top_margin),
            "max": int(args.max_top_margin),
        },
        {
            "name": "hud_row_spread",
            "ok": row_spread is not None and row_spread <= int(args.max_row_spread),
            "observed": row_spread,
            "max": int(args.max_row_spread),
        },
        {
            "name": "hud_width_ratio",
            "ok": hud_width_ratio is not None and hud_width_ratio <= float(args.max_hud_width_ratio),
            "observed": hud_width_ratio,
            "max": float(args.max_hud_width_ratio),
        },
        {
            "name": "hud_icon_gaps",
            "ok": all(gap >= int(args.min_icon_gap) and gap <= int(args.max_icon_gap) for gap in gaps) if gaps else len(hud_components) < 2,
            "observed": gaps,
            "min": int(args.min_icon_gap),
            "max": int(args.max_icon_gap),
        },
        {
            "name": "unexpected_top_diff_components",
            "ok": len(unexpected_components) <= int(args.max_unexpected_components),
            "observed": len(unexpected_components),
            "max": int(args.max_unexpected_components),
        },
    ]

    payload = {
        "ok": all(check["ok"] for check in checks),
        "generatedAt": now_iso(),
        "input": args.input,
        "baseline": args.baseline,
        "imageSize": {
            "width": width,
            "height": height,
        },
        "stageRect": {
            "left": int(stage_left),
            "top": int(stage_top),
            "right": int(stage_right),
            "bottom": int(stage_bottom),
            "width": int(stage_width),
            "height": int(stage_height),
        },
        "analysisRegion": {
            "topBand": {
                "left": int(stage_left),
                "top": int(stage_top),
                "right": int(stage_right),
                "bottom": int(top_bottom),
            },
            "rightHudMinLeft": int(right_left),
        },
        "hudBox": hud_box,
        "hudComponents": hud_components,
        "unexpectedComponents": unexpected_components,
        "metrics": {
            "rightMargin": right_margin,
            "topMargin": top_margin,
            "rowSpread": row_spread,
            "gaps": gaps,
            "hudWidthRatio": hud_width_ratio,
        },
        "thresholds": {
            "diffThreshold": diff_threshold,
            "topRatio": float(args.top_ratio),
            "rightRatio": float(args.right_ratio),
        },
        "checks": checks,
    }
    if getattr(args, "annotated_output", ""):
        annotated = image.convert("RGB")
        draw = ImageDraw.Draw(annotated)
        draw.rectangle((stage_left, stage_top, stage_right, stage_bottom), outline=(255, 255, 0), width=3)
        draw.rectangle((right_left, stage_top, stage_right, top_bottom), outline=(0, 255, 255), width=3)
        if hud_box:
            draw.rectangle((hud_box["left"], hud_box["top"], hud_box["right"], hud_box["bottom"]), outline=(0, 255, 0), width=4)
        for comp in hud_components:
            draw.rectangle((comp["left"], comp["top"], comp["right"], comp["bottom"]), outline=(255, 128, 0), width=2)
        for comp in unexpected_components:
            draw.rectangle((comp["left"], comp["top"], comp["right"], comp["bottom"]), outline=(255, 0, 0), width=3)
        annotated_path = Path(args.annotated_output)
        annotated_path.parent.mkdir(parents=True, exist_ok=True)
        annotated.save(annotated_path)
        payload["annotatedOutput"] = str(annotated_path)
    write_json_if_needed(payload, args.output)
    to_json(payload)
    if not payload["ok"] and not getattr(args, "no_fail_exit", False):
        sys.exit(2)


def _slot_edge_metrics(region):
    if region.size == 0:
        return {
            "edgeDensity": 0.0,
            "darkDensity": 0.0,
            "saturationDensity": 0.0,
            "pixels": 0,
        }
    rgb = np.array(region).astype(np.int16)
    gradient_x = np.zeros(rgb.shape[:2], dtype=np.int16)
    gradient_y = np.zeros(rgb.shape[:2], dtype=np.int16)
    gradient_x[:, 1:] = np.max(np.abs(rgb[:, 1:] - rgb[:, :-1]), axis=2)
    gradient_y[1:, :] = np.max(np.abs(rgb[1:, :] - rgb[:-1, :]), axis=2)
    gradient = np.maximum(gradient_x, gradient_y)
    max_channel = rgb.max(axis=2)
    min_channel = rgb.min(axis=2)
    saturation = max_channel - min_channel
    edge_mask = (gradient > 35) & (saturation > 20) & (max_channel > 45)
    return {
        "edgeDensity": float(edge_mask.sum()) / float(edge_mask.size),
        "darkDensity": float((max_channel < 80).sum()) / float(edge_mask.size),
        "saturationDensity": float((saturation > 45).sum()) / float(edge_mask.size),
        "pixels": int(edge_mask.size),
    }


def command_analyze_hud_row(args):
    image = Image.open(args.input).convert("RGB")
    width, height = image.size
    menu_center_x = float(args.menu_center_x)
    menu_center_y = float(args.menu_center_y)
    logical_width = max(1.0, float(args.logical_width))
    scale = float(width) / logical_width
    slot_spacing = float(args.slot_spacing) if args.slot_spacing else float(args.logical_slot_spacing) * scale
    slot_half_size = int(round(float(args.logical_slot_size) * scale / 2.0))
    slot_half_size = max(int(args.min_slot_half_size), min(int(args.max_slot_half_size), slot_half_size))
    names = [
        entry.strip()
        for entry in str(args.slot_names).split(",")
        if entry.strip()
    ]
    if not names:
        names = ["settings", "audio", "home", "store", "map", "costumizer", "inventory", "menu"]
    slot_count = len(names)
    critical_names = {
        entry.strip()
        for entry in str(args.critical_slots).split(",")
        if entry.strip()
    }
    slots = []
    for index, name in enumerate(names):
        slot_offset = slot_count - 1 - index
        center_x = menu_center_x - slot_spacing * slot_offset
        center_y = menu_center_y + float(args.row_y_offset)
        left, top, right, bottom = _clamp_box(
            int(round(center_x - slot_half_size)),
            int(round(center_y - slot_half_size)),
            int(round(center_x + slot_half_size)),
            int(round(center_y + slot_half_size)),
            width,
            height,
        )
        metrics = _slot_edge_metrics(image.crop((left, top, right, bottom)))
        present = (
            metrics["pixels"] > 0 and
            metrics["edgeDensity"] >= float(args.min_edge_density)
        )
        slots.append({
            "index": int(index),
            "name": name,
            "centerX": float(round(center_x, 3)),
            "centerY": float(round(center_y, 3)),
            "box": {
                "left": int(left),
                "top": int(top),
                "right": int(right),
                "bottom": int(bottom),
                "width": int(right - left),
                "height": int(bottom - top),
            },
            "present": bool(present),
            "metrics": {
                "edgeDensity": float(round(metrics["edgeDensity"], 6)),
                "darkDensity": float(round(metrics["darkDensity"], 6)),
                "saturationDensity": float(round(metrics["saturationDensity"], 6)),
                "pixels": int(metrics["pixels"]),
            },
        })
    present_slots = [slot for slot in slots if slot["present"]]
    critical_missing = [
        slot["name"]
        for slot in slots
        if slot["name"] in critical_names and not slot["present"]
    ]
    row_left = min(slot["box"]["left"] for slot in slots) if slots else None
    row_right = max(slot["box"]["right"] for slot in slots) if slots else None
    row_top = min(slot["box"]["top"] for slot in slots) if slots else None
    row_bottom = max(slot["box"]["bottom"] for slot in slots) if slots else None
    right_inset = float(width - menu_center_x)
    row_left_ratio = float(row_left) / float(width) if row_left is not None and width else None
    checks = [
        {
            "name": "present_slot_count",
            "ok": len(present_slots) >= int(args.min_present_slots),
            "observed": len(present_slots),
            "min": int(args.min_present_slots),
        },
        {
            "name": "critical_slots_present",
            "ok": not critical_missing,
            "missing": critical_missing,
            "criticalSlots": sorted(critical_names),
        },
        {
            "name": "menu_right_anchor",
            "ok": right_inset >= float(args.min_menu_right_inset) and right_inset <= float(args.max_menu_right_inset),
            "observedRightInset": float(round(right_inset, 3)),
            "min": float(args.min_menu_right_inset),
            "max": float(args.max_menu_right_inset),
        },
        {
            "name": "row_left_ratio",
            "ok": row_left_ratio is not None and row_left_ratio >= float(args.min_row_left_ratio),
            "observed": float(round(row_left_ratio, 6)) if row_left_ratio is not None else None,
            "min": float(args.min_row_left_ratio),
        },
        {
            "name": "row_top",
            "ok": row_top is not None and row_top <= int(args.max_row_top),
            "observed": int(row_top) if row_top is not None else None,
            "max": int(args.max_row_top),
        },
    ]
    payload = {
        "ok": all(check["ok"] for check in checks),
        "generatedAt": now_iso(),
        "input": args.input,
        "imageSize": {
            "width": int(width),
            "height": int(height),
        },
        "anchor": {
            "menuCenterX": float(round(menu_center_x, 3)),
            "menuCenterY": float(round(menu_center_y, 3)),
            "rightInset": float(round(right_inset, 3)),
        },
        "layout": {
            "logicalWidth": float(logical_width),
            "scale": float(round(scale, 6)),
            "slotSpacing": float(round(slot_spacing, 3)),
            "slotHalfSize": int(slot_half_size),
            "rowBox": {
                "left": int(row_left) if row_left is not None else None,
                "top": int(row_top) if row_top is not None else None,
                "right": int(row_right) if row_right is not None else None,
                "bottom": int(row_bottom) if row_bottom is not None else None,
            },
            "rowLeftRatio": float(round(row_left_ratio, 6)) if row_left_ratio is not None else None,
        },
        "slots": slots,
        "checks": checks,
    }
    if getattr(args, "annotated_output", ""):
        annotated = image.convert("RGB")
        draw = ImageDraw.Draw(annotated)
        if row_left is not None:
            draw.rectangle((row_left, row_top, row_right, row_bottom), outline=(0, 255, 255), width=3)
        for slot in slots:
            box = slot["box"]
            outline = (0, 255, 0) if slot["present"] else (255, 0, 0)
            draw.rectangle((box["left"], box["top"], box["right"], box["bottom"]), outline=outline, width=3)
        annotated_path = Path(args.annotated_output)
        annotated_path.parent.mkdir(parents=True, exist_ok=True)
        annotated.save(annotated_path)
        payload["annotatedOutput"] = str(annotated_path)
    write_json_if_needed(payload, args.output)
    to_json(payload)
    if not payload["ok"] and not getattr(args, "no_fail_exit", False):
        sys.exit(2)


def command_crop_image(args):
    image = Image.open(args.input)
    width, height = image.size
    if args.relative:
        left = float(args.left)
        top = float(args.top)
        crop_width = float(args.width)
        crop_height = float(args.height)
    else:
        left = int(args.left)
        top = int(args.top)
        crop_width = int(args.width)
        crop_height = int(args.height)

    if args.stage_json:
        stage_payload = json.loads(Path(args.stage_json).read_text(encoding="utf-8"))
        stage_rect = stage_payload.get("stageRect") or {}
        stage_left = int(stage_rect.get("left", 0))
        stage_top = int(stage_rect.get("top", 0))
        stage_width = int(stage_rect.get("width", width))
        stage_height = int(stage_rect.get("height", height))
        if args.relative:
            left = stage_left + round(stage_width * float(args.left))
            top = stage_top + round(stage_height * float(args.top))
            crop_width = round(stage_width * float(args.width))
            crop_height = round(stage_height * float(args.height))
        else:
            left = stage_left + left
            top = stage_top + top

    right = left + crop_width
    bottom = top + crop_height
    left, top, right, bottom = _clamp_box(left, top, right, bottom, width, height)
    cropped = image.crop((left, top, right, bottom))
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    cropped.save(output)
    payload = {
        "ok": True,
        "generatedAt": now_iso(),
        "input": args.input,
        "output": str(output),
        "cropBox": {
            "left": left,
            "top": top,
            "right": right,
            "bottom": bottom,
            "width": max(0, right - left),
            "height": max(0, bottom - top),
        },
    }
    write_json_if_needed(payload, args.metadata_output)
    to_json(payload)


def command_click_window(args):
    hwnd = int(args.handle)
    process_names = parse_csv(getattr(args, "process_names", ""))
    title_contains = [fragment.strip().lower() for fragment in (getattr(args, "title_contains", "") or "").split(",") if fragment.strip()]
    cmdline_contains = [fragment.strip().lower() for fragment in (getattr(args, "cmdline_contains", "") or "").split(",") if fragment.strip()]
    pid = int(args.pid) if getattr(args, "pid", None) else None
    requested_x = int(args.x)
    requested_y = int(args.y)
    placement = None
    row = resolve_window_row(hwnd, process_names, title_contains, pid, cmdline_contains)
    if not row and cmdline_contains:
        row = guess_runtime_window(process_names, title_contains, None, cmdline_contains)
    if not row:
        raise RuntimeError(f"Window handle {hwnd} is not valid.")
    if getattr(args, "target_monitor", None):
        placement = position_window_on_target_monitor(
            int(row["handle"]),
            args.target_monitor,
            width=getattr(args, "window_width", None),
            height=getattr(args, "window_height", None),
            maximize=getattr(args, "maximize", False),
        )
        row = placement.get("windowAfterMove") or window_row(int(row["handle"])) or row
    if not getattr(args, "post_message", False):
        bring_to_front(int(row["handle"]))
    target_row = row
    parent_hwnd = int(row["handle"])
    child_class_contains = str(getattr(args, "child_class_contains", "") or "").strip().lower()
    if getattr(args, "largest_child", False) or child_class_contains:
        target_row = select_child_window(parent_hwnd, child_class_contains, getattr(args, "largest_child", False)) or target_row
    point = win32gui.ClientToScreen(parent_hwnd, (requested_x, requested_y))
    hwnd = int(target_row["handle"])
    target_client_point = win32gui.ScreenToClient(hwnd, point)
    hold_ms = max(0, int(getattr(args, "hold_ms", 0) or 0))
    hover_ms = max(0, int(getattr(args, "hover_ms", 0) or 0))
    delivery = "post-message" if getattr(args, "post_message", False) else "cursor"
    if getattr(args, "post_message", False):
        post_synthetic_mouse_focus(parent_hwnd, hwnd)
        lparam = (int(target_client_point[1]) & 0xFFFF) << 16 | (int(target_client_point[0]) & 0xFFFF)
        win32gui.PostMessage(hwnd, win32con.WM_MOUSEMOVE, 0, lparam)
        time.sleep(max(0.03, hover_ms / 1000.0))
        win32gui.PostMessage(hwnd, win32con.WM_LBUTTONDOWN, win32con.MK_LBUTTON, lparam)
        if hold_ms > 0:
            move_interval_ms = max(0, int(getattr(args, "move_interval_ms", 0) or 0))
            if move_interval_ms > 0:
                deadline = time.monotonic() + (hold_ms / 1000.0)
                interval_sec = max(0.01, move_interval_ms / 1000.0)
                while True:
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        break
                    win32gui.PostMessage(hwnd, win32con.WM_MOUSEMOVE, win32con.MK_LBUTTON, lparam)
                    time.sleep(min(interval_sec, remaining))
            else:
                time.sleep(hold_ms / 1000.0)
        else:
            time.sleep(0.08)
        win32gui.PostMessage(hwnd, win32con.WM_LBUTTONUP, 0, lparam)
    elif hold_ms > 0:
        win32api.SetCursorPos(point)
        time.sleep(max(0.08, hover_ms / 1000.0))
        win32api.mouse_event(win32con.MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
        time.sleep(hold_ms / 1000.0)
        win32api.mouse_event(win32con.MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
    else:
        mouse.click(coords=point)
    payload = {
        "ok": True,
        "generatedAt": now_iso(),
        "window": row,
        "targetWindow": target_row,
        "placement": placement,
        "delivery": delivery,
        "point": {
            "x": point[0],
            "y": point[1],
            "relativeX": requested_x,
            "relativeY": requested_y,
            "targetRelativeX": int(target_client_point[0]),
            "targetRelativeY": int(target_client_point[1]),
            "hoverMs": hover_ms,
            "holdMs": hold_ms,
            "moveIntervalMs": max(0, int(getattr(args, "move_interval_ms", 0) or 0)),
        },
    }
    write_json_if_needed(payload, args.output)
    to_json(payload)


KEY_CODE_ALIASES = {
    "BACKSPACE": win32con.VK_BACK,
    "BKSP": win32con.VK_BACK,
    "BS": win32con.VK_BACK,
    "TAB": win32con.VK_TAB,
    "ENTER": win32con.VK_RETURN,
    "RETURN": win32con.VK_RETURN,
    "SHIFT": win32con.VK_SHIFT,
    "CTRL": win32con.VK_CONTROL,
    "CONTROL": win32con.VK_CONTROL,
    "ALT": win32con.VK_MENU,
    "ESC": win32con.VK_ESCAPE,
    "ESCAPE": win32con.VK_ESCAPE,
    "SPACE": win32con.VK_SPACE,
    "LEFT": win32con.VK_LEFT,
    "RIGHT": win32con.VK_RIGHT,
    "UP": win32con.VK_UP,
    "DOWN": win32con.VK_DOWN,
    "A": ord("A"),
    "D": ord("D"),
    "S": ord("S"),
    "W": ord("W"),
}


def resolve_key_code(value):
    key = str(value or "").strip()
    normalized = key.upper()
    if normalized in KEY_CODE_ALIASES:
        return int(KEY_CODE_ALIASES[normalized])
    if len(key) == 1:
        return int(ord(key.upper()))
    if normalized.startswith("VK_") and hasattr(win32con, normalized):
        return int(getattr(win32con, normalized))
    if normalized.startswith("0X"):
        return int(normalized, 16)
    return int(normalized, 10)


def key_lparam(vk, is_keyup=False):
    scan = int(win32api.MapVirtualKey(int(vk), 0)) & 0xFF
    lparam = 1 | (scan << 16)
    if int(vk) in {win32con.VK_LEFT, win32con.VK_RIGHT, win32con.VK_UP, win32con.VK_DOWN}:
        lparam |= 1 << 24
    if is_keyup:
        lparam |= (1 << 30) | (1 << 31)
    return lparam


def command_key_window(args):
    hwnd = int(args.handle)
    process_names = parse_csv(getattr(args, "process_names", ""))
    title_contains = [fragment.strip().lower() for fragment in (getattr(args, "title_contains", "") or "").split(",") if fragment.strip()]
    cmdline_contains = [fragment.strip().lower() for fragment in (getattr(args, "cmdline_contains", "") or "").split(",") if fragment.strip()]
    pid = int(args.pid) if getattr(args, "pid", None) else None
    placement = None
    row = resolve_window_row(hwnd, process_names, title_contains, pid, cmdline_contains)
    if not row and cmdline_contains:
        row = guess_runtime_window(process_names, title_contains, None, cmdline_contains)
    if not row:
        raise RuntimeError(f"Window handle {hwnd} is not valid.")
    if getattr(args, "target_monitor", None):
        placement = position_window_on_target_monitor(
            int(row["handle"]),
            args.target_monitor,
            width=getattr(args, "window_width", None),
            height=getattr(args, "window_height", None),
            maximize=getattr(args, "maximize", False),
        )
        row = placement.get("windowAfterMove") or window_row(int(row["handle"])) or row
    if not getattr(args, "post_message", False):
        bring_to_front(int(row["handle"]))
    target_row = row
    child_class_contains = str(getattr(args, "child_class_contains", "") or "").strip().lower()
    if getattr(args, "largest_child", False) or child_class_contains:
        target_row = select_child_window(int(row["handle"]), child_class_contains, getattr(args, "largest_child", False)) or target_row
    hwnd = int(target_row["handle"])
    vk = resolve_key_code(args.key)
    hold_ms = max(0, int(getattr(args, "hold_ms", 0) or 0))
    repeat_interval_ms = max(0, int(getattr(args, "repeat_interval_ms", 0) or 0))
    delivery = "post-message" if getattr(args, "post_message", False) else "keyboard-event"
    down_lparam = key_lparam(vk, is_keyup=False)
    up_lparam = key_lparam(vk, is_keyup=True)
    if getattr(args, "post_message", False):
        win32gui.PostMessage(hwnd, win32con.WM_KEYDOWN, vk, down_lparam)
        if hold_ms > 0:
            if repeat_interval_ms > 0:
                deadline = time.monotonic() + (hold_ms / 1000.0)
                interval_sec = max(0.01, repeat_interval_ms / 1000.0)
                while True:
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        break
                    win32gui.PostMessage(hwnd, win32con.WM_KEYDOWN, vk, down_lparam)
                    time.sleep(min(interval_sec, remaining))
            else:
                time.sleep(hold_ms / 1000.0)
        else:
            time.sleep(0.08)
        win32gui.PostMessage(hwnd, win32con.WM_KEYUP, vk, up_lparam)
    else:
        scan = win32api.MapVirtualKey(vk, 0)
        win32api.keybd_event(vk, scan, 0, 0)
        if hold_ms > 0:
            time.sleep(hold_ms / 1000.0)
        else:
            time.sleep(0.08)
        win32api.keybd_event(vk, scan, win32con.KEYEVENTF_KEYUP, 0)
    foreground_hwnd = win32gui.GetForegroundWindow()
    foreground_row = resolve_window_row(foreground_hwnd, [], [], None) if foreground_hwnd else None
    payload = {
        "ok": True,
        "generatedAt": now_iso(),
        "window": row,
        "targetWindow": target_row,
        "foregroundWindow": foreground_row,
        "placement": placement,
        "delivery": delivery,
        "key": {
            "value": str(args.key),
            "vk": vk,
            "holdMs": hold_ms,
            "repeatIntervalMs": repeat_interval_ms,
        },
    }
    write_json_if_needed(payload, args.output)
    to_json(payload)


def command_list_child_windows(args):
    hwnd = int(args.handle)
    process_names = parse_csv(getattr(args, "process_names", ""))
    title_contains = [fragment.strip().lower() for fragment in (getattr(args, "title_contains", "") or "").split(",") if fragment.strip()]
    pid = int(args.pid) if getattr(args, "pid", None) else None
    row = resolve_window_row(hwnd, process_names, title_contains, pid)
    if not row:
        raise RuntimeError(f"Window handle {hwnd} is not valid.")
    children = child_window_rows(int(row["handle"]))
    payload = {
        "ok": True,
        "generatedAt": now_iso(),
        "window": row,
        "children": children,
        "childCount": len(children),
    }
    write_json_if_needed(payload, args.output)
    to_json(payload)


def contains_chinese(text):
    return bool(re.search(r"[\u4e00-\u9fff]", text or ""))


def command_ocr_image(args):
    lines = []
    raw_result, elapsed = get_ocr_engine()(args.input)
    if raw_result:
        for item in raw_result:
            polygon = item[0] if len(item) > 0 else []
            text = item[1] if len(item) > 1 else ""
            score = item[2] if len(item) > 2 else None
            points = [
                {"x": float(point[0]), "y": float(point[1])}
                for point in polygon
                if isinstance(point, (list, tuple)) and len(point) >= 2
            ]
            if points:
                xs = [point["x"] for point in points]
                ys = [point["y"] for point in points]
                box = {
                    "left": round(min(xs), 3),
                    "top": round(min(ys), 3),
                    "right": round(max(xs), 3),
                    "bottom": round(max(ys), 3),
                    "width": round(max(xs) - min(xs), 3),
                    "height": round(max(ys) - min(ys), 3),
                    "centerX": round((min(xs) + max(xs)) / 2, 3),
                    "centerY": round((min(ys) + max(ys)) / 2, 3),
                }
            else:
                box = None
            lines.append({
                "text": text,
                "score": score,
                "box": box,
                "polygon": points,
            })
    joined = " ".join(line["text"] for line in lines if line["text"]).strip()
    if isinstance(elapsed, (list, tuple)):
        elapsed_ms = round(sum(float(item) for item in elapsed if item is not None) * 1000, 2)
    elif elapsed is None:
        elapsed_ms = None
    else:
        elapsed_ms = round(float(elapsed) * 1000, 2)
    payload = {
        "ok": True,
        "generatedAt": now_iso(),
        "input": args.input,
        "lineCount": len(lines),
        "text": joined,
        "containsChinese": contains_chinese(joined),
        "lines": lines,
        "elapsedMs": elapsed_ms,
    }
    write_json_if_needed(payload, args.output)
    to_json(payload)


def command_compare_images(args):
    before_path = Path(args.before)
    after_path = Path(args.after)
    with Image.open(before_path) as before_image:
        before = np.asarray(before_image.convert("RGB"), dtype=np.int16)
    with Image.open(after_path) as after_image:
        after = np.asarray(after_image.convert("RGB"), dtype=np.int16)

    height = min(before.shape[0], after.shape[0])
    width = min(before.shape[1], after.shape[1])
    if height <= 0 or width <= 0:
        raise RuntimeError("Images have no comparable area.")

    before_crop = before[:height, :width]
    after_crop = after[:height, :width]
    diff = np.abs(after_crop - before_crop)
    max_channel_diff = np.max(diff, axis=2)
    threshold = max(0, int(args.threshold))
    changed = max_channel_diff > threshold
    changed_pixel_ratio = float(np.count_nonzero(changed)) / float(width * height)
    mean_abs_diff = float(np.mean(diff))
    max_abs_diff = int(np.max(diff))

    payload = {
        "ok": True,
        "generatedAt": now_iso(),
        "before": str(before_path),
        "after": str(after_path),
        "threshold": threshold,
        "comparedSize": {
            "width": int(width),
            "height": int(height),
        },
        "sameSize": bool(before.shape[0] == after.shape[0] and before.shape[1] == after.shape[1]),
        "changedPixelRatio": round(changed_pixel_ratio, 6),
        "meanAbsDiff": round(mean_abs_diff, 6),
        "maxAbsDiff": max_abs_diff,
    }
    write_json_if_needed(payload, args.output)
    to_json(payload)


def command_audio_check(args):
    from pycaw.pycaw import AudioUtilities

    process_names = parse_csv(args.process_names)
    sessions = []
    for session in AudioUtilities.GetAllSessions():
        process = session.Process
        process_name = process.name().lower() if process else None
        if process_names and process_name not in process_names:
            continue
        sessions.append({
            "processName": process_name,
            "pid": process.pid if process else None,
            "displayName": session.DisplayName,
            "state": int(session.State),
            "volume": round(float(session.SimpleAudioVolume.GetMasterVolume()), 4),
            "muted": bool(session.SimpleAudioVolume.GetMute()),
        })

    duration_sec = float(args.duration_sec)
    sample_rate = int(args.sample_rate)
    loopback_rms = 0.0
    loopback_peak = 0.0
    speaker_name = None

    try:
        speaker = sc.default_speaker()
        speaker_name = speaker.name if speaker else None
        if speaker:
            microphone = sc.get_microphone(speaker.name, include_loopback=True)
            with microphone.recorder(samplerate=sample_rate) as recorder:
                data = recorder.record(numframes=max(1, int(sample_rate * duration_sec)))
            if data.size:
                loopback_rms = float(np.sqrt(np.mean(np.square(data))))
                loopback_peak = float(np.max(np.abs(data)))
    except Exception:
        speaker_name = speaker_name or None

    audible_sessions = [
        session for session in sessions
        if not session["muted"] and float(session["volume"]) > 0.0001 and int(session["state"]) == 1
    ]
    loopback_active = loopback_peak >= float(args.peak_threshold)
    respect_session_mute = bool(getattr(args, "respect_session_mute", False))
    audio_likely_active = bool(sessions) and loopback_active
    if respect_session_mute:
        audio_likely_active = bool(audible_sessions) and loopback_active

    payload = {
        "ok": True,
        "generatedAt": now_iso(),
        "speaker": speaker_name,
        "targetProcesses": sorted(process_names),
        "sessionCount": len(sessions),
        "audibleSessionCount": len(audible_sessions),
        "sessions": sessions,
        "loopback": {
            "durationSec": duration_sec,
            "sampleRate": sample_rate,
            "rms": round(loopback_rms, 6),
            "peak": round(loopback_peak, 6),
            "active": bool(loopback_active),
        },
        "respectSessionMute": bool(respect_session_mute),
        "audioLikelyActive": bool(audio_likely_active),
    }
    write_json_if_needed(payload, args.output)
    to_json(payload)


def main():
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    monitors_parser = subparsers.add_parser("list-monitors")
    monitors_parser.add_argument("--target-monitor")
    monitors_parser.add_argument("--output")
    monitors_parser.set_defaults(func=command_list_monitors)

    audit_parser = subparsers.add_parser("window-audit")
    audit_parser.add_argument("--duration-ms", type=int, default=5000)
    audit_parser.add_argument("--interval-ms", type=int, default=200)
    audit_parser.add_argument("--output")
    audit_parser.set_defaults(func=command_window_audit)

    sync_layout_parser = subparsers.add_parser("sync-window-layout")
    sync_layout_parser.add_argument("--handle")
    sync_layout_parser.add_argument("--process-names", default="")
    sync_layout_parser.add_argument("--title-contains", default="")
    sync_layout_parser.add_argument("--cmdline-contains", default="")
    sync_layout_parser.add_argument("--pid", type=int)
    sync_layout_parser.add_argument("--output")
    sync_layout_parser.set_defaults(func=command_sync_window_layout)

    watch_layout_parser = subparsers.add_parser("watch-window-layout")
    watch_layout_parser.add_argument("--handle")
    watch_layout_parser.add_argument("--process-names", default="")
    watch_layout_parser.add_argument("--title-contains", default="")
    watch_layout_parser.add_argument("--cmdline-contains", default="")
    watch_layout_parser.add_argument("--pid", type=int)
    watch_layout_parser.add_argument("--duration-sec", type=int, default=43200)
    watch_layout_parser.add_argument("--interval-ms", type=int, default=300)
    watch_layout_parser.add_argument("--start-delay-ms", type=int, default=0)
    watch_layout_parser.add_argument("--output")
    watch_layout_parser.add_argument("--quiet", action="store_true")
    watch_layout_parser.add_argument("--resize-relaunch", action="store_true")
    watch_layout_parser.add_argument("--resize-relaunch-source-group", default="")
    watch_layout_parser.add_argument("--resize-relaunch-script", default="")
    watch_layout_parser.add_argument("--resize-relaunch-min-delta", type=int, default=24)
    watch_layout_parser.add_argument("--resize-relaunch-stable-ms", type=int, default=900)
    watch_layout_parser.set_defaults(func=command_watch_window_layout)

    wait_parser = subparsers.add_parser("wait-window")
    wait_parser.add_argument("--process-names", default="")
    wait_parser.add_argument("--title-contains", default="")
    wait_parser.add_argument("--cmdline-contains", default="")
    wait_parser.add_argument("--pid", type=int)
    wait_parser.add_argument("--timeout-ms", type=int, default=30000)
    wait_parser.add_argument("--poll-ms", type=int, default=250)
    wait_parser.add_argument("--output")
    wait_parser.add_argument("--target-monitor")
    wait_parser.add_argument("--window-width", type=int)
    wait_parser.add_argument("--window-height", type=int)
    wait_parser.add_argument("--maximize", action="store_true")
    wait_parser.set_defaults(func=command_wait_window)

    capture_parser = subparsers.add_parser("capture-window")
    capture_parser.add_argument("--handle", required=True)
    capture_parser.add_argument("--output", required=True)
    capture_parser.add_argument("--metadata-output")
    capture_parser.add_argument("--client-only", action="store_true")
    capture_parser.add_argument("--maximize", action="store_true")
    capture_parser.add_argument("--process-names", default="")
    capture_parser.add_argument("--title-contains", default="")
    capture_parser.add_argument("--cmdline-contains", default="")
    capture_parser.add_argument("--pid", type=int)
    capture_parser.add_argument("--target-monitor")
    capture_parser.add_argument("--window-width", type=int)
    capture_parser.add_argument("--window-height", type=int)
    capture_parser.add_argument("--no-foreground", action="store_true")
    capture_parser.add_argument("--largest-child", action="store_true")
    capture_parser.add_argument("--child-class-contains", default="")
    capture_parser.set_defaults(func=command_capture_window)

    capture_sequence_parser = subparsers.add_parser("capture-window-sequence")
    capture_sequence_parser.add_argument("--handle", required=True)
    capture_sequence_parser.add_argument("--output-dir", required=True)
    capture_sequence_parser.add_argument("--stem", default="capture")
    capture_sequence_parser.add_argument("--sample-ms", default="0")
    capture_sequence_parser.add_argument("--metadata-output")
    capture_sequence_parser.add_argument("--client-only", action="store_true")
    capture_sequence_parser.add_argument("--maximize", action="store_true")
    capture_sequence_parser.add_argument("--process-names", default="")
    capture_sequence_parser.add_argument("--title-contains", default="")
    capture_sequence_parser.add_argument("--cmdline-contains", default="")
    capture_sequence_parser.add_argument("--pid", type=int)
    capture_sequence_parser.add_argument("--target-monitor")
    capture_sequence_parser.add_argument("--window-width", type=int)
    capture_sequence_parser.add_argument("--window-height", type=int)
    capture_sequence_parser.add_argument("--no-foreground", action="store_true")
    capture_sequence_parser.add_argument("--largest-child", action="store_true")
    capture_sequence_parser.add_argument("--child-class-contains", default="")
    capture_sequence_parser.set_defaults(func=command_capture_window_sequence)

    analyze_parser = subparsers.add_parser("analyze-stage")
    analyze_parser.add_argument("--input", required=True)
    analyze_parser.add_argument("--tolerance", type=int, default=18)
    analyze_parser.add_argument("--output")
    analyze_parser.set_defaults(func=command_analyze_stage)

    loading_center_parser = subparsers.add_parser("analyze-loading-center")
    loading_center_parser.add_argument("--input", required=True)
    loading_center_parser.add_argument("--output")
    loading_center_parser.add_argument("--dark-threshold", type=int, default=35)
    loading_center_parser.add_argument("--min-center-dark-pct", type=float, default=72.0)
    loading_center_parser.add_argument("--min-feature-pixels", type=int, default=600)
    loading_center_parser.add_argument("--center-left-ratio", type=float, default=0.18)
    loading_center_parser.add_argument("--center-right-ratio", type=float, default=0.82)
    loading_center_parser.add_argument("--center-top-ratio", type=float, default=0.12)
    loading_center_parser.add_argument("--center-bottom-ratio", type=float, default=0.72)
    loading_center_parser.add_argument("--min-blue", type=int, default=120)
    loading_center_parser.add_argument("--min-green", type=int, default=80)
    loading_center_parser.add_argument("--min-blue-red-delta", type=int, default=12)
    loading_center_parser.add_argument("--max-green-blue-delta", type=int, default=45)
    loading_center_parser.set_defaults(func=command_analyze_loading_center)

    visual_guard_parser = subparsers.add_parser("analyze-visual-guard")
    visual_guard_parser.add_argument("--input", required=True)
    visual_guard_parser.add_argument("--output")
    visual_guard_parser.add_argument("--edge-ratio", type=float, default=0.18)
    visual_guard_parser.add_argument("--white-threshold", type=int, default=245)
    visual_guard_parser.add_argument("--max-white-edge-pct", type=float, default=60.0)
    visual_guard_parser.add_argument("--dark-threshold", type=int, default=16)
    visual_guard_parser.add_argument("--max-dark-edge-pct", type=float, default=100.0)
    visual_guard_parser.add_argument("--target-color", default="")
    visual_guard_parser.add_argument("--target-tolerance", type=int, default=2)
    visual_guard_parser.add_argument("--max-target-edge-pct", type=float, default=100.0)
    visual_guard_parser.add_argument("--complexity-sample-step", type=int, default=12)
    visual_guard_parser.add_argument("--max-complexity-samples", type=int, default=50000)
    visual_guard_parser.add_argument("--min-sampled-unique-colors", type=int, default=8)
    visual_guard_parser.add_argument("--max-dominant-color-pct", type=float, default=98.0)
    visual_guard_parser.set_defaults(func=command_analyze_visual_guard)

    hud_diff_parser = subparsers.add_parser("analyze-hud-diff")
    hud_diff_parser.add_argument("--input", required=True)
    hud_diff_parser.add_argument("--baseline", required=True)
    hud_diff_parser.add_argument("--stage-json")
    hud_diff_parser.add_argument("--output")
    hud_diff_parser.add_argument("--diff-threshold", type=int, default=25)
    hud_diff_parser.add_argument("--top-ratio", type=float, default=0.18)
    hud_diff_parser.add_argument("--right-ratio", type=float, default=0.32)
    hud_diff_parser.add_argument("--min-component-pixels", type=int, default=20)
    hud_diff_parser.add_argument("--min-unexpected-pixels", type=int, default=20)
    hud_diff_parser.add_argument("--min-hud-components", type=int, default=3)
    hud_diff_parser.add_argument("--min-icon-width", type=int, default=24)
    hud_diff_parser.add_argument("--min-icon-height", type=int, default=24)
    hud_diff_parser.add_argument("--min-right-margin", type=int, default=8)
    hud_diff_parser.add_argument("--max-right-margin", type=int, default=96)
    hud_diff_parser.add_argument("--min-top-margin", type=int, default=-4)
    hud_diff_parser.add_argument("--max-top-margin", type=int, default=36)
    hud_diff_parser.add_argument("--max-row-spread", type=int, default=10)
    hud_diff_parser.add_argument("--max-hud-width-ratio", type=float, default=0.24)
    hud_diff_parser.add_argument("--min-icon-gap", type=int, default=10)
    hud_diff_parser.add_argument("--max-icon-gap", type=int, default=56)
    hud_diff_parser.add_argument("--max-unexpected-components", type=int, default=0)
    hud_diff_parser.add_argument("--annotated-output")
    hud_diff_parser.set_defaults(func=command_analyze_hud_diff)

    hud_row_parser = subparsers.add_parser("analyze-hud-row")
    hud_row_parser.add_argument("--input", required=True)
    hud_row_parser.add_argument("--output")
    hud_row_parser.add_argument("--annotated-output")
    hud_row_parser.add_argument("--menu-center-x", required=True, type=float)
    hud_row_parser.add_argument("--menu-center-y", required=True, type=float)
    hud_row_parser.add_argument("--logical-width", type=float, default=960.0)
    hud_row_parser.add_argument("--logical-slot-spacing", type=float, default=86.0)
    hud_row_parser.add_argument("--slot-spacing", type=float, default=0.0)
    hud_row_parser.add_argument("--logical-slot-size", type=float, default=76.0)
    hud_row_parser.add_argument("--min-slot-half-size", type=int, default=28)
    hud_row_parser.add_argument("--max-slot-half-size", type=int, default=70)
    hud_row_parser.add_argument("--row-y-offset", type=float, default=0.0)
    hud_row_parser.add_argument("--slot-names", default="settings,audio,home,store,map,costumizer,inventory,menu")
    hud_row_parser.add_argument("--critical-slots", default="settings,audio,home,menu")
    hud_row_parser.add_argument("--min-edge-density", type=float, default=0.025)
    hud_row_parser.add_argument("--min-present-slots", type=int, default=7)
    hud_row_parser.add_argument("--min-menu-right-inset", type=float, default=8.0)
    hud_row_parser.add_argument("--max-menu-right-inset", type=float, default=150.0)
    hud_row_parser.add_argument("--min-row-left-ratio", type=float, default=0.22)
    hud_row_parser.add_argument("--max-row-top", type=int, default=90)
    hud_row_parser.add_argument("--no-fail-exit", action="store_true")
    hud_row_parser.set_defaults(func=command_analyze_hud_row)

    crop_parser = subparsers.add_parser("crop-image")
    crop_parser.add_argument("--input", required=True)
    crop_parser.add_argument("--output", required=True)
    crop_parser.add_argument("--metadata-output")
    crop_parser.add_argument("--left", required=True)
    crop_parser.add_argument("--top", required=True)
    crop_parser.add_argument("--width", required=True)
    crop_parser.add_argument("--height", required=True)
    crop_parser.add_argument("--stage-json")
    crop_parser.add_argument("--relative", action="store_true")
    crop_parser.set_defaults(func=command_crop_image)

    click_parser = subparsers.add_parser("click-window")
    click_parser.add_argument("--handle", required=True)
    click_parser.add_argument("--x", required=True)
    click_parser.add_argument("--y", required=True)
    click_parser.add_argument("--output")
    click_parser.add_argument("--process-names", default="")
    click_parser.add_argument("--title-contains", default="")
    click_parser.add_argument("--cmdline-contains", default="")
    click_parser.add_argument("--pid", type=int)
    click_parser.add_argument("--hover-ms", type=int, default=0)
    click_parser.add_argument("--hold-ms", type=int, default=0)
    click_parser.add_argument("--move-interval-ms", type=int, default=0)
    click_parser.add_argument("--target-monitor")
    click_parser.add_argument("--window-width", type=int)
    click_parser.add_argument("--window-height", type=int)
    click_parser.add_argument("--maximize", action="store_true")
    click_parser.add_argument("--post-message", action="store_true")
    click_parser.add_argument("--largest-child", action="store_true")
    click_parser.add_argument("--child-class-contains", default="")
    click_parser.set_defaults(func=command_click_window)

    key_parser = subparsers.add_parser("key-window")
    key_parser.add_argument("--handle", required=True)
    key_parser.add_argument("--key", required=True)
    key_parser.add_argument("--output")
    key_parser.add_argument("--process-names", default="")
    key_parser.add_argument("--title-contains", default="")
    key_parser.add_argument("--cmdline-contains", default="")
    key_parser.add_argument("--pid", type=int)
    key_parser.add_argument("--hold-ms", type=int, default=0)
    key_parser.add_argument("--repeat-interval-ms", type=int, default=0)
    key_parser.add_argument("--target-monitor")
    key_parser.add_argument("--window-width", type=int)
    key_parser.add_argument("--window-height", type=int)
    key_parser.add_argument("--maximize", action="store_true")
    key_parser.add_argument("--post-message", action="store_true")
    key_parser.add_argument("--largest-child", action="store_true")
    key_parser.add_argument("--child-class-contains", default="")
    key_parser.set_defaults(func=command_key_window)

    child_parser = subparsers.add_parser("list-child-windows")
    child_parser.add_argument("--handle", required=True)
    child_parser.add_argument("--output")
    child_parser.add_argument("--process-names", default="")
    child_parser.add_argument("--title-contains", default="")
    child_parser.add_argument("--pid", type=int)
    child_parser.set_defaults(func=command_list_child_windows)

    ocr_parser = subparsers.add_parser("ocr-image")
    ocr_parser.add_argument("--input", required=True)
    ocr_parser.add_argument("--output")
    ocr_parser.set_defaults(func=command_ocr_image)

    compare_parser = subparsers.add_parser("compare-images")
    compare_parser.add_argument("--before", required=True)
    compare_parser.add_argument("--after", required=True)
    compare_parser.add_argument("--threshold", type=int, default=20)
    compare_parser.add_argument("--output")
    compare_parser.set_defaults(func=command_compare_images)

    audio_parser = subparsers.add_parser("audio-check")
    audio_parser.add_argument("--process-names", default="")
    audio_parser.add_argument("--duration-sec", type=float, default=2.0)
    audio_parser.add_argument("--sample-rate", type=int, default=16000)
    audio_parser.add_argument("--peak-threshold", type=float, default=0.0005)
    audio_parser.add_argument("--respect-session-mute", action="store_true")
    audio_parser.add_argument("--output")
    audio_parser.set_defaults(func=command_audio_check)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
