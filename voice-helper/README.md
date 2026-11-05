# KON COFFEE LIVE - Local Hoai My voice helper

This helper runs on the same Windows PC as OBS. The game stays hosted on Render.

## Requirements
- Windows 10/11
- Python 3.10 or newer
- Internet connection while generating speech

## Start
1. Open this folder in File Explorer.
2. Double-click `start-hoaimy.bat`.
3. The first run installs the `edge-tts` package. Keep the opened window running during LIVE.
4. Open the game Browser Source and click **BẬT GIỌNG**. Then click **NGHE THỬ**.

The selected voice is `vi-VN-HoaiMyNeural`.

## Local endpoints
- Health: http://127.0.0.1:8765/health
- Speech: POST http://127.0.0.1:8765/speak

The helper binds only to 127.0.0.1 and accepts browser requests from the KON COFFEE Render site. Do not expose port 8765 to the public internet.

## Notes
Edge TTS uses Microsoft's online speech endpoint through the third-party `edge-tts` Python package. It is not an Azure subscription and does not require an Azure API key or payment card, but it depends on the availability and policies of that endpoint. It is not an official SLA-backed API.
