; electron-builder NSIS hook - ensure app.asar.unpacked is rebuilt on every install/update.
; First-run data location: app Settings → Data folder (portable suggest on alternate fixed drive).
; Do not hard-code D: — profiles-location.cjs chooses per machine.

!macro customInit
  ClearErrors
  IfFileExists "$INSTDIR\resources\app.asar" 0 +2
    RMDir /r "$INSTDIR\resources\app.asar.unpacked"
!macroend

!macro customInstall
  ; Seed first-run prompt only when no profiles-location.json exists yet.
  IfFileExists "$APPDATA\stealth-browser-console\data\profiles-location.json" skip_profiles_hint 0
    CreateDirectory "$APPDATA\stealth-browser-console\data"
    FileOpen $0 "$APPDATA\stealth-browser-console\data\profiles-location.json" w
    FileWrite $0 '{"version":1,"profilesRoot":null,"promptPending":true,"source":"nsis-install","suggestedProfilesRoot":null}$\r$\n'
    FileClose $0
  skip_profiles_hint:
!macroend
