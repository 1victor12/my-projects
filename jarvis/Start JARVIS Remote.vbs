Set WshShell = CreateObject("WScript.Shell")
jarvisDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
WshShell.CurrentDirectory = jarvisDir
cfDir = WshShell.ExpandEnvironmentStrings("%USERPROFILE%") & "\.cloudflared"

' Find cloudflared.exe (folder first, then PATH)
cloudflared = jarvisDir & "cloudflared.exe"
If Not CreateObject("Scripting.FileSystemObject").FileExists(cloudflared) Then
  cloudflared = "cloudflared"
End If

' Start JARVIS server if not running
Set objWMIService = GetObject("winmgmts:\\.\root\cimv2")
nodeRunning = False
For Each p In objWMIService.ExecQuery("SELECT * FROM Win32_Process WHERE Name = 'node.exe'")
  If InStr(p.CommandLine, "server.js") > 0 Then nodeRunning = True
Next
If Not nodeRunning Then
  WshShell.Run "cmd /c cd /d """ & jarvisDir & """ && start /min node server.js", 0, False
  WScript.Sleep 2000
End If

' Start the permanent tunnel if not running
tunnelRunning = False
For Each p In objWMIService.ExecQuery("SELECT * FROM Win32_Process WHERE Name = 'cloudflared.exe'")
  If InStr(p.CommandLine, "tunnel run") > 0 Or InStr(p.CommandLine, "tunnel --url") > 0 Then tunnelRunning = True
Next
If Not tunnelRunning And CreateObject("Scripting.FileSystemObject").FileExists(cfDir & "\config.yml") Then
  WshShell.Run """" & cloudflared & """ tunnel run", 0, False
End If

' Open the interface locally
WshShell.Run "https://localhost:8124"
