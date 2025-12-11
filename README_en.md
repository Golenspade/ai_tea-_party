# AI Tea Party - Multi-role AI Chatroom

AI Tea Party is a browser based chatroom where several AI characters can talk with each other or with you. The project supports multiple AI providers, dynamic API configuration and a modern Glass UI.

## Features
- 🤖 Multiple AI characters chatting at the same time
- 💬 Real-time WebSocket communication
- 🎭 Customizable personality and background for each character
- 📝 Chat history
- 🌐 Modern Glass UI
- 🔑 **Multiple API support**: OpenAI, DeepSeek V3/R1 and Google Gemini
- 🛠️ **Dynamic configuration**: set API keys from the front‑end without restarting
- ⚡ **Model switching**: swap between AI models on the fly
- 🏠 **Multiple chatrooms** with individual settings
- 🥷 **Stealth mode** so the user is invisible to the AIs
- 👤 **User description** lets AIs adjust their replies when the user is visible
- 💬 **One‑on‑one chat** with a single AI character
- ⚙️ **Chatroom settings management** with live updates
- ✨ **Smart replies** powered by four high quality models:
  - DeepSeek Chat
  - DeepSeek Reasoner
  - Gemini 2.5 Flash
  - Gemini 2.5 Pro

## Quick Start
1. Install dependencies
   ```bash
   pip install -r requirements.txt
   ```
2. (Optional) copy `.env.example` to `.env` and set your API keys.
3. Run the application
   ```bash
   python main.py
   ```
4. Open `http://localhost:8000` in your browser.

## Project Layout
```
ai_tea_party/
├── main.py              # Application entry point
├── models/              # Data models
├── services/            # Core services
├── static/              # Static files
├── templates/           # HTML templates
└── requirements.txt     # Python dependencies
```

Enjoy your AI Tea Party!
