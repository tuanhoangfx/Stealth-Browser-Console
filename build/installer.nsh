; electron-builder NSIS hook — rebuild app.asar.unpacked on every install/update.

!macro customInit
  ClearErrors
  IfFileExists "$INSTDIR\resources\app.asar" 0 +2
    RMDir /r "$INSTDIR\resources\app.asar.unpacked"
!macroend
