Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
shell.Run Chr(34) & shell.CurrentDirectory & "\Start-Poptropica-Flash.bat" & Chr(34), 0, False
