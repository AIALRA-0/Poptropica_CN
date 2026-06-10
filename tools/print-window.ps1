param(
  [Parameter(Mandatory = $true)][string]$Path,
  [int]$WindowHandle
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $WindowHandle) {
  throw "WindowHandle is required."
}

Add-Type -AssemblyName System.Drawing

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class NativeMethods {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

  [DllImport("user32.dll")]
  public static extern bool PrintWindow(IntPtr hwnd, IntPtr hdcBlt, uint nFlags);

  [DllImport("user32.dll")]
  public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@

$targetPath = [System.IO.Path]::GetFullPath($Path)
$parent = Split-Path -Parent $targetPath
if ($parent) {
  New-Item -ItemType Directory -Path $parent -Force | Out-Null
}

$handle = [IntPtr]::new($WindowHandle)
[NativeMethods]::ShowWindowAsync($handle, 9) | Out-Null
[NativeMethods]::SetForegroundWindow($handle) | Out-Null
Start-Sleep -Milliseconds 300

$rect = New-Object NativeMethods+RECT
if (-not [NativeMethods]::GetWindowRect($handle, [ref]$rect)) {
  throw "Failed to get window bounds."
}

$width = $rect.Right - $rect.Left
$height = $rect.Bottom - $rect.Top
if ($width -le 0 -or $height -le 0) {
  throw "Window has invalid bounds."
}

$bitmap = New-Object System.Drawing.Bitmap($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)

try {
  $hdc = $graphics.GetHdc()
  try {
    $ok = [NativeMethods]::PrintWindow($handle, $hdc, 0)
  } finally {
    $graphics.ReleaseHdc($hdc)
  }

  if (-not $ok) {
    throw "PrintWindow failed."
  }

  $bitmap.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  $graphics.Dispose()
  $bitmap.Dispose()
}

Write-Output $targetPath
