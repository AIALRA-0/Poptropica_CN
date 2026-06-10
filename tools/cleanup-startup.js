const { spawnSync } = require("node:child_process");

function main() {
  const script = `
    $targets = Get-CimInstance Win32_Process | Where-Object {
      $_.Name -eq 'electron.exe' -and
      $_.CommandLine -like '*POPTROPICA_FLASH*\\tools\\*.js*'
    }
    foreach ($target in $targets) {
      try {
        Stop-Process -Id $target.ProcessId -Force -ErrorAction Stop
      } catch {
      }
    }
  `;

  spawnSync("powershell", ["-NoProfile", "-Command", script], {
    windowsHide: true,
    encoding: "utf8"
  });
}

main();
