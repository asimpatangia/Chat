# AI Chat — Setup Guide

A ChatGPT-like web app supporting OpenAI, Gemini, and Claude. Built with Next.js, deployed on Vercel, database on Supabase.

---

## Step 1 — Supabase Setup (free)

1. Go to [supabase.com](https://supabase.com) and create a free account + new project
2. In your project, open **SQL Editor** and paste the contents of `supabase-schema.sql`, then click **Run**
3. Go to **Settings → API** and copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## Step 2 — Push to GitHub

```bash
cd chatgpt-clone
git init
git add .
git commit -m "Initial commit"
# Create a new repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

---

## Step 3 — Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click **Add New → Project** and import your GitHub repo
3. In **Environment Variables**, add:
   ```
   NEXT_PUBLIC_SUPABASE_URL      = https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY = your-anon-key
   ```
4. Click **Deploy** — done! 🎉

---

## Step 4 — Add Your API Keys (in the app)

Once deployed, open your app URL and click **Settings** (bottom-left):

| Provider | Where to get the key |
|---|---|
| OpenAI | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| Google Gemini | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) |
| Anthropic Claude | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |

Keys are saved **only in your browser's localStorage** — they never leave your device.

---

## Features

- **Multi-provider chat** — OpenAI, Gemini, Claude with model selection
- **Streaming responses** — text streams in real time
- **Speech to text** — click the mic button (uses browser Web Speech API)
- **File uploads** — attach files via button or drag & drop; stored in Supabase Storage
- **Conversation history** — all chats saved to Supabase, persistent across sessions
- **Auto-titled chats** — conversation title set from your first message

---

## Local Development

```bash
cd chatgpt-clone
cp .env.example .env.local
# Fill in your Supabase values in .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)
