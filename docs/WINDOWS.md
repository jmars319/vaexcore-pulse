# Windows Desktop

Pulse is intended to run locally on Windows with the same suite protocol and review workflow as macOS. The Windows build is a Tauri desktop app and uses `%APPDATA%\vaexcore\suite` for Studio/Console coordination.

## Windows 11 Build

Prerequisites:

- Node 22 or newer
- pnpm 10.32 or newer
- Rust stable with the MSVC toolchain
- Visual Studio Build Tools with Desktop development with C++
- WebView2 Runtime
- Python 3.11 or newer for the local analyzer bridge
- FFmpeg available on `PATH`, `C:\ffmpeg\bin\ffmpeg.exe`, or `C:\Program Files\ffmpeg\bin\ffmpeg.exe`

Build the installer from this repo on Windows:

```sh
pnpm install
pnpm app:build:windows
```

## Local Paths

- Suite discovery: `%APPDATA%\vaexcore\suite`
- Pulse app data: `%APPDATA%\vaexcore pulse`
- Logs: `%APPDATA%\vaexcore\pulse\logs`

Pulse remains usable without cloud services. FFmpeg and Python are local dependencies for deeper media probing and analysis.
