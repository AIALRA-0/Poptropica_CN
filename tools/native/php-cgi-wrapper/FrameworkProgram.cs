using System;
using System.Diagnostics;
using System.IO;
using System.Threading;

// Small .NET Framework fallback for hosts that have no .NET SDK/runtime
// matching the managed wrapper. It is compiled as a WinExe, so Flashpoint's
// per-request CGI workers never create visible console windows.
internal static class FrameworkProgram
{
    private static void Copy(Stream source, Stream destination, bool closeDestination)
    {
        try
        {
            source.CopyTo(destination);
            destination.Flush();
        }
        catch
        {
            // Broken CGI pipes are expected when the browser closes a request.
        }
        finally
        {
            if (closeDestination)
            {
                try { destination.Close(); } catch { }
            }
        }
    }

    public static int Main(string[] args)
    {
        string baseDir = AppDomain.CurrentDomain.BaseDirectory;
        string realExe = Path.Combine(baseDir, "php-cgi-real.exe");
        if (!File.Exists(realExe))
        {
            return 127;
        }

        var startInfo = new ProcessStartInfo
        {
            FileName = realExe,
            WorkingDirectory = baseDir,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        foreach (string arg in args)
        {
            startInfo.Arguments += (startInfo.Arguments.Length == 0 ? "" : " ")
                + QuoteArgument(arg);
        }

        using (var child = new Process { StartInfo = startInfo })
        {
            if (!child.Start())
            {
                return 126;
            }

            Thread stdin = new Thread(() =>
                Copy(Console.OpenStandardInput(), child.StandardInput.BaseStream, true));
            Thread stdout = new Thread(() =>
                Copy(child.StandardOutput.BaseStream, Console.OpenStandardOutput(), false));
            Thread stderr = new Thread(() =>
                Copy(child.StandardError.BaseStream, Console.OpenStandardError(), false));
            stdin.IsBackground = true;
            stdout.IsBackground = true;
            stderr.IsBackground = true;
            stdin.Start();
            stdout.Start();
            stderr.Start();

            child.WaitForExit();
            stdin.Join(5000);
            stdout.Join(5000);
            stderr.Join(5000);
            return child.ExitCode;
        }
    }

    private static string QuoteArgument(string value)
    {
        if (value == null) return "\"\"";
        if (value.Length == 0) return "\"\"";
        if (value.IndexOfAny(new[] { ' ', '\t', '"' }) < 0) return value;
        return "\"" + value.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";
    }
}
