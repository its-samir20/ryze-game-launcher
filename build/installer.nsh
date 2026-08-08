!ifndef NSDIALOGS_INCLUDED
  !include "nsDialogs.nsh"
!endif

!define GUIDE_TEXT `Welcome to the RYZE Game Launcher setup!$\r$\n$\r$\nThis installer will install everything RYZE Game Launcher needs to run on your PC.$\r$\n$\r$\nWHAT GETS INSTALLED$\r$\n1. RYZE Game Launcher - the app itself (Program Files + shortcuts)$\r$\n2. Visual C++ Redistributable 2015-2022 - required by the app, installed automatically if missing$\r$\n3. Start Menu and Desktop shortcuts$\r$\n$\r$\nHOW TO USE$\r$\n1. Open RYZE Game Launcher from the Start Menu or Desktop.$\r$\n2. The launcher works with your Discord quest tracking.$\r$\n3. Press Play on any game - a fake game window (Discord rich presence) opens and a timer runs.$\r$\n4. Close the window to stop. Your total play time is saved.$\r$\n5. The app stays in the system tray while Discord shows you as Playing.$\r$\n$\r$\nNOTES$\r$\n- The app works offline; no account is needed.$\r$\n- Your game library and stats are stored on your PC.$\r$\n- If Discord does not show you as Playing, restart Discord.$\r$\n- To uninstall, go to Settings > Apps > RYZE Game Launcher > Uninstall.`

!macro customHeader
  Page custom ShowGuidePage
!macroend

Function ShowGuidePage
  nsDialogs::Create 1018
  Pop $0
  ${NSD_CreateLabel} 0 0 100% 22u "Setup Guide"
  Pop $3
  ${NSD_CreateLabel} 0 22u 100% 16u "What gets installed and how to use RYZE Game Launcher"
  Pop $4
  ${NSD_CreateRichEdit} 0 42u 100% -42u ""
  Pop $1
  ${NSD_AddStyle} $1 ${WS_VSCROLL}
  ${NSD_AddStyle} $1 ${ES_READONLY}
  StrCpy $2 "${GUIDE_TEXT}"
  ${NSD_SetText} $1 $2
  nsDialogs::Show
FunctionEnd

!macro customInstall
  ReadRegDWORD $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
  ${If} $0 != 1
    ${If} ${FileExists} "$INSTDIR\vc_redist.x64.exe"
      DetailPrint "Installing Visual C++ Redistributable 2015-2022..."
      ExecWait '"$INSTDIR\vc_redist.x64.exe" /install /quiet /norestart'
      DetailPrint "Visual C++ Redistributable installed."
    ${Else}
      MessageBox MB_OK "Visual C++ Redistributable was not found in the installer. Please install it manually from: https://aka.ms/vs/17/release/vc_redist.x64.exe"
    ${EndIf}
  ${EndIf}
!macroend
