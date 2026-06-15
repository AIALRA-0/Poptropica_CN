import argparse
import json
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
from PIL import Image, ImageGrab
from pywinauto import mouse
from rapidocr_onnxruntime import RapidOCR


SHELL_PROCESS_NAMES = {"cmd.exe", "powershell.exe", "pwsh.exe", "conhost.exe", "wscript.exe", "cscript.exe"}
TERMINAL_HOST_PROCESS_NAMES = {"windowsterminal.exe", "opconsole.exe", "openconsole.exe", "wt.exe"}
OCR_ENGINE = RapidOCR()
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
    win32gui.SetWindowPos(hwnd, 0, target_left, target_top, target_width, target_height, flags)
    time.sleep(0.2)
    if maximize:
        win32gui.ShowWindow(hwnd, win32con.SW_MAXIMIZE)
        time.sleep(0.25)

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


def match_window(row, process_names, title_contains, pid=None):
    if is_transient_runtime_wrapper(row):
        return False
    if pid is not None and int(row.get("pid") or -1) != pid:
        return False
    process_name = (row.get("processName") or "").lower()
    title = (row.get("title") or "").lower()
    if process_names and process_name not in process_names:
        return False
    if title_contains and not any(fragment in title for fragment in title_contains):
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


def best_window_match(rows, process_names, title_contains, pid=None):
    matches = [row for row in rows if match_window(row, process_names, title_contains, pid)]
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


def guess_runtime_window(process_names=None, title_contains=None, pid=None):
    rows = enum_windows(include_untitled=True)
    process_names = process_names or set()
    title_contains = title_contains or []

    if process_names or title_contains or pid is not None:
        exact = best_window_match(rows, process_names, title_contains, pid)
        if exact:
            return exact

    candidates = []
    for row in rows:
        if pid is not None and int(row.get("pid") or -1) != pid:
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


def resolve_window_row(hwnd, process_names=None, title_contains=None, pid=None):
    process_names = process_names or set()
    title_contains = title_contains or []
    row = window_row(hwnd)
    if row and match_window(row, process_names, title_contains, pid):
        return row

    if not process_names and not title_contains and pid is None:
        return None

    for _ in range(5):
        time.sleep(0.25)
        row = guess_runtime_window(process_names, title_contains, pid)
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


def bring_to_front(hwnd):
    win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
    try:
        win32gui.BringWindowToTop(hwnd)
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
    time.sleep(0.4)


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


def command_wait_window(args):
    process_names = parse_csv(args.process_names)
    title_contains = [fragment.strip().lower() for fragment in (args.title_contains or "").split(",") if fragment.strip()]
    pid = int(args.pid) if args.pid else None
    deadline = time.time() + (args.timeout_ms / 1000.0)
    match = None
    placement = None
    while time.time() < deadline:
        match = guess_runtime_window(process_names, title_contains, pid)
        if match:
            break
        time.sleep(args.poll_ms / 1000.0)

    if match and getattr(args, "target_monitor", None):
        placement = position_window_on_target_monitor(
            int(match["handle"]),
            args.target_monitor,
            width=getattr(args, "window_width", None),
            height=getattr(args, "window_height", None),
            maximize=getattr(args, "maximize", False),
        )
        match = placement.get("windowAfterMove") or window_row(int(match["handle"])) or match

    payload = {
        "ok": bool(match),
        "generatedAt": now_iso(),
        "match": match,
        "placement": placement,
        "searched": {
            "processNames": sorted(process_names),
            "titleContains": title_contains,
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
    row = resolve_window_row(hwnd, process_names, title_contains, pid)
    if not row:
        raise RuntimeError(f"Window handle {hwnd} is not valid.")
    hwnd = int(row["handle"])
    bbox = get_capture_bbox(hwnd, args.client_only)
    image = ImageGrab.grab(bbox=bbox, all_screens=True)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output)
    payload = {
        "ok": True,
        "generatedAt": now_iso(),
        "savedTo": str(output),
        "window": row,
        "placement": placement,
        "captureMode": "client" if args.client_only else "window",
        "captureBox": {
            "left": int(bbox[0]),
            "top": int(bbox[1]),
            "right": int(bbox[2]),
            "bottom": int(bbox[3]),
            "width": int(max(0, bbox[2] - bbox[0])),
            "height": int(max(0, bbox[3] - bbox[1])),
        },
        "imageSize": {
            "width": image.width,
            "height": image.height,
        },
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
    pid = int(args.pid) if getattr(args, "pid", None) else None
    placement = None
    if getattr(args, "target_monitor", None):
        placement = position_window_on_target_monitor(
            hwnd,
            args.target_monitor,
            width=getattr(args, "window_width", None),
            height=getattr(args, "window_height", None),
            maximize=getattr(args, "maximize", False),
        )
    if not getattr(args, "post_message", False):
        bring_to_front(hwnd)
    row = resolve_window_row(hwnd, process_names, title_contains, pid)
    if not row:
        raise RuntimeError(f"Window handle {hwnd} is not valid.")
    target_row = row
    hwnd = int(row["handle"])
    point = win32gui.ClientToScreen(hwnd, (int(args.x), int(args.y)))
    hold_ms = max(0, int(getattr(args, "hold_ms", 0) or 0))
    delivery = "post-message" if getattr(args, "post_message", False) else "cursor"
    if getattr(args, "post_message", False):
        lparam = (int(args.y) & 0xFFFF) << 16 | (int(args.x) & 0xFFFF)
        win32gui.PostMessage(hwnd, win32con.WM_MOUSEMOVE, 0, lparam)
        time.sleep(0.03)
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
        time.sleep(0.08)
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
            "relativeX": int(args.x),
            "relativeY": int(args.y),
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
    pid = int(args.pid) if getattr(args, "pid", None) else None
    placement = None
    if getattr(args, "target_monitor", None):
        placement = position_window_on_target_monitor(
            hwnd,
            args.target_monitor,
            width=getattr(args, "window_width", None),
            height=getattr(args, "window_height", None),
            maximize=getattr(args, "maximize", False),
        )
    if not getattr(args, "post_message", False):
        bring_to_front(hwnd)
    row = resolve_window_row(hwnd, process_names, title_contains, pid)
    if not row:
        raise RuntimeError(f"Window handle {hwnd} is not valid.")
    target_row = row
    child_class_contains = str(getattr(args, "child_class_contains", "") or "").strip().lower()
    if getattr(args, "largest_child", False) or child_class_contains:
        candidates = child_window_rows(int(row["handle"]))
        if child_class_contains:
            candidates = [
                child for child in candidates
                if child_class_contains in str(child.get("className") or "").lower()
            ]
        if candidates:
            candidates.sort(key=lambda child: child["rect"]["width"] * child["rect"]["height"], reverse=True)
            target_row = candidates[0]
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
        win32api.keybd_event(vk, 0, 0, 0)
        if hold_ms > 0:
            time.sleep(hold_ms / 1000.0)
        else:
            time.sleep(0.08)
        win32api.keybd_event(vk, 0, win32con.KEYEVENTF_KEYUP, 0)
    payload = {
        "ok": True,
        "generatedAt": now_iso(),
        "window": row,
        "targetWindow": target_row,
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
    raw_result, elapsed = OCR_ENGINE(args.input)
    if raw_result:
        for item in raw_result:
            text = item[1] if len(item) > 1 else ""
            score = item[2] if len(item) > 2 else None
            lines.append({
                "text": text,
                "score": score,
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

    payload = {
        "ok": True,
        "generatedAt": now_iso(),
        "speaker": speaker_name,
        "targetProcesses": sorted(process_names),
        "sessionCount": len(sessions),
        "sessions": sessions,
        "loopback": {
            "durationSec": duration_sec,
            "sampleRate": sample_rate,
            "rms": round(loopback_rms, 6),
            "peak": round(loopback_peak, 6),
        },
        "audioLikelyActive": bool(sessions) and loopback_peak >= float(args.peak_threshold),
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

    wait_parser = subparsers.add_parser("wait-window")
    wait_parser.add_argument("--process-names", default="")
    wait_parser.add_argument("--title-contains", default="")
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
    capture_parser.add_argument("--pid", type=int)
    capture_parser.add_argument("--target-monitor")
    capture_parser.add_argument("--window-width", type=int)
    capture_parser.add_argument("--window-height", type=int)
    capture_parser.add_argument("--no-foreground", action="store_true")
    capture_parser.set_defaults(func=command_capture_window)

    analyze_parser = subparsers.add_parser("analyze-stage")
    analyze_parser.add_argument("--input", required=True)
    analyze_parser.add_argument("--tolerance", type=int, default=18)
    analyze_parser.add_argument("--output")
    analyze_parser.set_defaults(func=command_analyze_stage)

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
    click_parser.add_argument("--pid", type=int)
    click_parser.add_argument("--hold-ms", type=int, default=0)
    click_parser.add_argument("--move-interval-ms", type=int, default=0)
    click_parser.add_argument("--target-monitor")
    click_parser.add_argument("--window-width", type=int)
    click_parser.add_argument("--window-height", type=int)
    click_parser.add_argument("--maximize", action="store_true")
    click_parser.add_argument("--post-message", action="store_true")
    click_parser.set_defaults(func=command_click_window)

    key_parser = subparsers.add_parser("key-window")
    key_parser.add_argument("--handle", required=True)
    key_parser.add_argument("--key", required=True)
    key_parser.add_argument("--output")
    key_parser.add_argument("--process-names", default="")
    key_parser.add_argument("--title-contains", default="")
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
    audio_parser.add_argument("--output")
    audio_parser.set_defaults(func=command_audio_check)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
