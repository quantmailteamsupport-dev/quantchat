
' QuantChat Deployment Runner - VBScript
' This runs the deployment without GUI blocking

Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

' Get the script directory
scriptDir = objShell.CurrentDirectory
scriptPath = scriptDir & "\install-and-deploy.bat"

' Check if file exists
If Not objFSO.FileExists(scriptPath) Then
    MsgBox "Error: install-and-deploy.bat not found in " & scriptDir, vbCritical, "Deployment Error"
    WScript.Quit 1
End If

' Run the batch file
objShell.Run scriptPath, 1, False

' Done
MsgBox "Deployment started! Check the command window for progress.", vbInformation, "QuantChat Deployment"
WScript.Quit 0
