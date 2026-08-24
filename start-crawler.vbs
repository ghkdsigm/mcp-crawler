Dim WshShell, strDir, fso
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

strDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strDir

If Not fso.FolderExists(strDir & "\logs") Then
    fso.CreateFolder(strDir & "\logs")
End If

' 백그라운드 실행 (창 없음), 로그는 logs\crawler.log 에 저장
WshShell.Run "cmd /c node index.js > """ & strDir & "\logs\crawler.log"" 2>&1", 0, False

Set WshShell = Nothing
Set fso = Nothing
