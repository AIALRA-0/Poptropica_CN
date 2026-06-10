import argparse
import json
import re
import sys
import time
from pathlib import Path

import numpy as np
import psutil
import soundcard as sc
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
    while time.time() < deadline:
        match = guess_runtime_window(process_names, title_contains, pid)
        if match:
            break
        time.sleep(args.poll_ms / 1000.0)

    payload = {
        "ok": bool(match),
        "generatedAt": now_iso(),
        "match": match,
        "searched": {
            "processNames": sorted(process_names),
            "titleContains": title_contains,
            "pid": pid,
            "timeoutMs": args.timeout_ms,
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
    if args.maximize:
        try:
            win32gui.ShowWindow(hwnd, win32con.SW_MAXIMIZE)
            time.sleep(0.35)
        except Exception:
            pass
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
    bring_to_front(hwnd)
    row = resolve_window_row(hwnd, process_names, title_contains, pid)
    if not row:
        raise RuntimeError(f"Window handle {hwnd} is not valid.")
    hwnd = int(row["handle"])
    point = win32gui.ClientToScreen(hwnd, (int(args.x), int(args.y)))
    mouse.click(coords=point)
    payload = {
        "ok": True,
        "generatedAt": now_iso(),
        "window": row,
        "point": {
            "x": point[0],
            "y": point[1],
            "relativeX": int(args.x),
            "relativeY": int(args.y),
        },
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
    click_parser.set_defaults(func=command_click_window)

    ocr_parser = subparsers.add_parser("ocr-image")
    ocr_parser.add_argument("--input", required=True)
    ocr_parser.add_argument("--output")
    ocr_parser.set_defaults(func=command_ocr_image)

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
