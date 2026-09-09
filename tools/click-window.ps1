param(
  [Parameter(Mandatory = $true)][int]$WindowHandle,
  [Parameter(Mandatory = $true)][int]$X,
  [Parameter(Mandatory = $true)][int]$Y,
  [int]$DelayMs = 250
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class NativeMethods {
  [StructLayout(LayoutKind.Sequential)]
  public struct POINT {
    public int X;
    public int Y;
  }

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
  public static extern bool GetClientRect(IntPtr hWnd, out RECT rect);

  [DllImport("user32.dll")]
  public static extern bool ClientToScreen(IntPtr hWnd, ref POINT point);

  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll")]
  public static extern bool SetCursorPos(int X, int Y);

  [DllImport("user32.dll")]
  public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
}
"@

$handle = [IntPtr]::new($WindowHandle)
[NativeMethods]::ShowWindowAsync($handle, 9) | Out-Null
[NativeMethods]::SetForegroundWindow($handle) | Out-Null
Start-Sleep -Milliseconds 250

$rect = New-Object NativeMethods+RECT
if (-not [NativeMethods]::GetClientRect($handle, [ref]$rect)) {
  throw "Failed to get client bounds."
}

$origin = New-Object NativeMethods+POINT
$origin.X = 0
$origin.Y = 0
if (-not [NativeMethods]::ClientToScreen($handle, [ref]$origin)) {
  throw "Failed to translate client origin."
}

$targetX = $origin.X + $X
$targetY = $origin.Y + $Y
[NativeMethods]::SetCursorPos($targetX, $targetY) | Out-Null
Start-Sleep -Milliseconds 80

$MOUSEEVENTF_LEFTDOWN = 0x0002
$MOUSEEVENTF_LEFTUP = 0x0004
[NativeMethods]::mouse_event($MOUSEEVENTF_LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 40
[NativeMethods]::mouse_event($MOUSEEVENTF_LEFTUP, 0, 0, 0, [UIntPtr]::Zero)

if ($DelayMs -gt 0) {
  Start-Sleep -Milliseconds $DelayMs
}

Write-Output ("Clicked at client ({0},{1}) => screen ({2},{3})" -f $X, $Y, $targetX, $targetY)
