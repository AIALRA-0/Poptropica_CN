param(
  [int]$DurationSeconds = 900,
  [int]$IntervalMs = 500
)

$ErrorActionPreference = "Stop"

$code = @'
using System;
using System.Runtime.InteropServices;

namespace PoptropicaAudioMute {
  [ComImport]
  [Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
  internal class MMDeviceEnumerator {}

  internal enum EDataFlow { eRender, eCapture, eAll }
  internal enum ERole { eConsole, eMultimedia, eCommunications }

  [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  internal interface IMMDeviceEnumerator {
    int NotImpl1();
    [PreserveSig]
    int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, out IMMDevice ppDevice);
  }

  [Guid("D666063F-1587-4E43-81F1-B948E807363F")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  internal interface IMMDevice {
    [PreserveSig]
    int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, out IAudioSessionManager2 ppInterface);
  }

  [Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  internal interface IAudioSessionManager2 {
    int NotImpl1();
    int NotImpl2();
    [PreserveSig]
    int GetSessionEnumerator(out IAudioSessionEnumerator SessionEnum);
  }

  [Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  internal interface IAudioSessionEnumerator {
    [PreserveSig]
    int GetCount(out int SessionCount);
    [PreserveSig]
    int GetSession(int SessionCount, out IAudioSessionControl Session);
  }

  [Guid("F4B1A599-7266-4319-A8CA-E70ACB11E8CD")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  internal interface IAudioSessionControl {
    int GetState(out int pRetVal);
    int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string Value, ref Guid EventContext);
    int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string Value, ref Guid EventContext);
    int GetGroupingParam(out Guid pRetVal);
    int SetGroupingParam(ref Guid Override, ref Guid EventContext);
    int RegisterAudioSessionNotification(IntPtr NewNotifications);
    int UnregisterAudioSessionNotification(IntPtr NewNotifications);
  }

  [Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  internal interface IAudioSessionControl2 {
    int GetState(out int pRetVal);
    int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string Value, ref Guid EventContext);
    int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string Value, ref Guid EventContext);
    int GetGroupingParam(out Guid pRetVal);
    int SetGroupingParam(ref Guid Override, ref Guid EventContext);
    int RegisterAudioSessionNotification(IntPtr NewNotifications);
    int UnregisterAudioSessionNotification(IntPtr NewNotifications);
    [PreserveSig]
    int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    [PreserveSig]
    int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    [PreserveSig]
    int GetProcessId(out uint pRetVal);
    int IsSystemSoundsSession();
    int SetDuckingPreference(bool optOut);
  }

  [Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  internal interface ISimpleAudioVolume {
    [PreserveSig]
    int SetMasterVolume(float fLevel, ref Guid EventContext);
    [PreserveSig]
    int GetMasterVolume(out float pfLevel);
    [PreserveSig]
    int SetMute(bool bMute, ref Guid EventContext);
    [PreserveSig]
    int GetMute(out bool pbMute);
  }

  public static class RuntimeSessionMute {
    public static int MuteProcessIds(uint[] pids) {
      Guid iid = typeof(IAudioSessionManager2).GUID;
      IMMDeviceEnumerator enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumerator());
      IMMDevice device;
      if (enumerator.GetDefaultAudioEndpoint(EDataFlow.eRender, ERole.eMultimedia, out device) != 0 || device == null) {
        return 0;
      }
      IAudioSessionManager2 manager;
      if (device.Activate(ref iid, 23, IntPtr.Zero, out manager) != 0 || manager == null) {
        return 0;
      }
      IAudioSessionEnumerator sessionEnumerator;
      if (manager.GetSessionEnumerator(out sessionEnumerator) != 0 || sessionEnumerator == null) {
        return 0;
      }
      int count;
      sessionEnumerator.GetCount(out count);
      int changed = 0;
      Guid ctx = Guid.Empty;
      for (int i = 0; i < count; i++) {
        IAudioSessionControl control;
        if (sessionEnumerator.GetSession(i, out control) != 0 || control == null) {
          continue;
        }
        IAudioSessionControl2 control2 = control as IAudioSessionControl2;
        ISimpleAudioVolume volume = control as ISimpleAudioVolume;
        if (control2 == null || volume == null) {
          continue;
        }
        uint pid;
        if (control2.GetProcessId(out pid) != 0) {
          continue;
        }
        foreach (uint targetPid in pids) {
          if (pid == targetPid) {
            volume.SetMute(true, ref ctx);
            volume.SetMasterVolume(0.0f, ref ctx);
            changed++;
            break;
          }
        }
      }
      return changed;
    }
  }
}
'@

Add-Type -TypeDefinition $code

function Get-PoptropicaAudioTarget {
  Get-CimInstance Win32_Process | Where-Object {
    $name = [string]$_.Name
    $path = [string]$_.ExecutablePath
    $commandLine = [string]$_.CommandLine

    $knownRuntimeShell =
      $name -match '^(?i)(FPNavigator|flashpointnavigator|fpnavigator|FlashpointSecurePlayer|BasiliskII|Basilisk|Basilisk-Portable)\.exe$' -or
      $name -match '^(?i)(plugin-container|FlashPlayerPlugin.*|FlashPlayer|flashplayer.*)\.exe$' -or
      $name -match '^(?i)(ruffle|ruffle_desktop|chrome|chromium|msedge|firefox|electron|nw)\.exe$'
    if (-not $knownRuntimeShell) {
      return $false
    }

    # Generic browser names are allowed only when the process is clearly tied to
    # this managed Poptropica/Flashpoint runtime. This avoids muting user apps.
    return $path -match '(?i)\\Flashpoint\\|\\POPTROPICA_FLASH\\|\\FPSoftware\\|\\BrowserPlugins\\|\\runtime-data\\workspaces\\flashpoint-' -or
      $commandLine -match '(?i)poptropica|flashpoint|fpnavigator|FlashpointSecurePlayer|Basilisk|www\.poptropica\.com|127\.0\.0\.1:22[0-9]{3}'
  }
}

$deadline = (Get-Date).AddSeconds([Math]::Max(1, $DurationSeconds))
$seen = @{}
$changedSessions = 0

do {
  $targets = @(Get-PoptropicaAudioTarget)
  foreach ($target in $targets) {
    $seen[[string]$target.ProcessId] = [pscustomobject]@{
      ProcessId = $target.ProcessId
      Name = $target.Name
      ExecutablePath = $target.ExecutablePath
    }
  }
  $pids = @($targets | ForEach-Object { [uint32]$_.ProcessId })
  if ($pids.Count -gt 0) {
    $changedSessions += [PoptropicaAudioMute.RuntimeSessionMute]::MuteProcessIds($pids)
  }
  Start-Sleep -Milliseconds ([Math]::Max(100, $IntervalMs))
} while ((Get-Date) -lt $deadline)

[pscustomobject]@{
  ok = $true
  muted = $true
  durationSeconds = $DurationSeconds
  targetProcessCount = $seen.Count
  changedAudioSessions = $changedSessions
  targets = @($seen.Values)
} | ConvertTo-Json -Depth 4
