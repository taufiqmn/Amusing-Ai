<p align="center"><img src="logo.svg" alt="Amusing AI logo" width="96"></p>

# Amusing AI + Amusing Studio

**By Md Taufiqur Rahman** · open source (MIT)

Two free apps that run **entirely in the visitor's browser**. No server, no account, no API key.

- **Amusing AI** (`index.html`): private chatbot using WebGPU and open-source models (WebLLM). Short human answers with an "Explain in detail" button, charts, picture questions, saved chats (local + file). Ask it for a video or an edit and it sends you to Studio with your idea filled in. "Make a poster" draws a designed graphic in the chat (not an AI photo).
- **Amusing Studio** (`studio.html`): text-based video editor. Simple mode (describe a video) and Advanced mode (timeline, per-scene mood and text instruction). Cinematic, documentary, SaaS-animation and more moods; logos and free photos from the web (Wikimedia, Openverse, simple-icons) or your own uploads; voiceover with pause tightening; video clips; pen tool (circle something and say what to change); guide bot; export to MP4/WebM (real-time).
- **SDK** (`gyan.js`): add the same in-browser AI to any site.

## Run locally
```bash
npx serve
```
Open `http://localhost:3000` in Chrome or Edge. WebGPU needs `localhost` or https.

## Optional image/video generation
Settings → Extras (off by default). Needs your own ComfyUI started with `--enable-cors-header "*"`.

## Limits (honest)
Export runs in real time. MP4 vs WebM depends on the browser. The pen cannot move things. Free photo search needs internet. AI picture generation needs ComfyUI.

## Deploy
Push to GitHub and import into Vercel (static site, no build).
