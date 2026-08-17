# Read PKEY_AppUserModel_ID of every live Cloak window.
# Windows groups taskbar buttons by AUMID, so two profiles sharing (or missing) it
# collapse into one button and only the last stamped badge stays visible.
$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;

public static class AumidProbe {
  [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF58"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IPropertyStore {
    int GetCount(out uint cProps);
    int GetAt(uint iProp, out PropertyKey pkey);
    int GetValue(ref PropertyKey key, out PropVariant pv);
    int SetValue(ref PropertyKey key, ref PropVariant pv);
    int Commit();
  }
  [StructLayout(LayoutKind.Sequential, Pack = 4)] public struct PropertyKey { public Guid fmtid; public uint pid; }
  [StructLayout(LayoutKind.Sequential)] public struct PropVariant {
    public ushort vt; public ushort r1; public ushort r2; public ushort r3; public IntPtr p; public int p2;
  }
  [DllImport("shell32.dll")] public static extern int SHGetPropertyStoreForWindow(IntPtr hwnd, ref Guid iid, out IPropertyStore store);
  [DllImport("propsys.dll", CharSet = CharSet.Unicode)] public static extern int PropVariantToStringAlloc(ref PropVariant pv, out IntPtr ppsz);

  public static string GetAumid(IntPtr hwnd) {
    Guid iid = new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF58");
    IPropertyStore store;
    if (SHGetPropertyStoreForWindow(hwnd, ref iid, out store) != 0 || store == null) return "<no-store>";
    var key = new PropertyKey { fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), pid = 5 };
    PropVariant pv;
    if (store.GetValue(ref key, out pv) != 0) return "<get-failed>";
    if (pv.vt == 0) return "<empty>";
    IntPtr str;
    if (PropVariantToStringAlloc(ref pv, out str) != 0) return "<convert-failed>";
    string value = Marshal.PtrToStringUni(str);
    Marshal.FreeCoTaskMem(str);
    return value;
  }
}
"@

Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object {
  $_.CommandLine -match 'stealth-browser-console' -and $_.CommandLine -notmatch '--type=' -and $_.CommandLine -notmatch 'headless'
} | ForEach-Object {
  $p = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue
  if (-not $p -or $p.MainWindowHandle -eq 0) { return }
  [pscustomobject]@{
    Title = $p.MainWindowTitle
    Pid   = $_.ProcessId
    Aumid = [AumidProbe]::GetAumid($p.MainWindowHandle)
  }
}
