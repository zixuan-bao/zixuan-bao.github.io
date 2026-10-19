Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
folder = files.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = folder
shell.Run "node " & Chr(34) & folder & "\scripts\start-editor.mjs" & Chr(34), 0, False
