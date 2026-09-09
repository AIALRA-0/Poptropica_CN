using System.Diagnostics;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

namespace PhpCgiWrapper;

internal static partial class NativeMethods
{
    public const int StdInputHandle = -10;
    public const int StdOutputHandle = -11;
    public const int StdErrorHandle = -12;

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr GetStdHandle(int nStdHandle);
}

internal static class Program
{
    private static FileStream? OpenInheritedStream(int handleKind, FileAccess access)
    {
        var rawHandle = NativeMethods.GetStdHandle(handleKind);
        if (rawHandle == IntPtr.Zero || rawHandle == new IntPtr(-1))
        {
            return null;
        }

        var safeHandle = new SafeFileHandle(rawHandle, ownsHandle: false);
        return new FileStream(safeHandle, access, bufferSize: 4096, isAsync: false);
    }

    private static async Task LogAsync(string logPath, string message)
    {
        try
        {
            await File.AppendAllTextAsync(logPath, $"[{DateTime.UtcNow:O}] {message}{Environment.NewLine}");
        }
        catch
        {
            // Ignore logging failures so CGI output still flows.
        }
    }

    public static async Task<int> Main(string[] args)
    {
        var baseDir = AppContext.BaseDirectory;
        var realExe = Path.Combine(baseDir, "php-cgi-real.exe");
        var wrapperLogPath = Path.Combine(baseDir, "php-cgi-wrapper.log");

        if (!File.Exists(realExe))
        {
            await LogAsync(wrapperLogPath, $"php-cgi-real.exe missing: {realExe}");
            return 127;
        }

        var startInfo = new ProcessStartInfo
        {
            FileName = realExe,
            WorkingDirectory = Path.GetDirectoryName(realExe) ?? baseDir,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };

        foreach (var arg in args)
        {
            startInfo.ArgumentList.Add(arg);
        }

        using var child = new Process { StartInfo = startInfo, EnableRaisingEvents = true };

        try
        {
            child.Start();
        }
        catch (Exception error)
        {
            await LogAsync(wrapperLogPath, $"Failed to start php-cgi-real.exe: {error}");
            return 126;
        }

        await using var inheritedInput = OpenInheritedStream(NativeMethods.StdInputHandle, FileAccess.Read);
        await using var inheritedOutput = OpenInheritedStream(NativeMethods.StdOutputHandle, FileAccess.Write);
        await using var inheritedError = OpenInheritedStream(NativeMethods.StdErrorHandle, FileAccess.Write);

        var stdinTask = Task.Run(async () =>
        {
            try
            {
                if (inheritedInput is not null)
                {
                    await inheritedInput.CopyToAsync(child.StandardInput.BaseStream);
                }
            }
            catch
            {
                // Ignore broken pipe and missing stdin cases.
            }
            finally
            {
                try
                {
                    child.StandardInput.Close();
                }
                catch
                {
                    // Ignore close failures.
                }
            }
        });

        var stdoutTask = Task.Run(async () =>
        {
            try
            {
                if (inheritedOutput is not null)
                {
                    await child.StandardOutput.BaseStream.CopyToAsync(inheritedOutput);
                    await inheritedOutput.FlushAsync();
                }
            }
            catch
            {
                // Ignore broken pipe cases.
            }
        });

        var stderrTask = Task.Run(async () =>
        {
            try
            {
                if (inheritedError is not null)
                {
                    await child.StandardError.BaseStream.CopyToAsync(inheritedError);
                    await inheritedError.FlushAsync();
                }
            }
            catch
            {
                // Ignore broken pipe cases.
            }
        });

        await Task.WhenAll(stdinTask, stdoutTask, stderrTask, child.WaitForExitAsync());

        if (child.ExitCode != 0)
        {
            await LogAsync(wrapperLogPath, $"php-cgi-real exited with code {child.ExitCode}");
        }

        return child.ExitCode;
    }
}
