Set WshShell = CreateObject("WScript.Shell")
jarvisDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
WshShell.CurrentDirectory = jarvisDir

' Start Ollama brain if not running
Set objWMIService = GetObject("winmgmts:\\.\root\cimv2")
Set procs = objWMIService.ExecQuery("SELECT * FROM Win32_Process WHERE Name = 'ollama.exe'")
If procs.Count = 0 Then
  WshShell.Run """" & WshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Programs\Ollama\ollama.exe"" serve", 0, False
  WScript.Sleep 3000
End If

' Start JARVIS server if not running
Set procs2 = objWMIService.ExecQuery("SELECT * FROM Win32_Process WHERE Name = 'node.exe'")
Dim nodeRunning
nodeRunning = False
For Each p In procs2
  If InStr(p.CommandLine, "server.js") > 0 Then nodeRunning = True
Next
If Not nodeRunning Then
  WshShell.Run "cmd /c cd /d """ & jarvisDir & """ && start /min node server.js", 0, False
  WScript.Sleep 2000
End If

' Open the interface
WshShell.Run "https://localhost:8124"
