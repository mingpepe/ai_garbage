# Zenfocus - Pomodoro Focus Dashboard ⏱️

Zenfocus is a sleek, minimalist Pomodoro Focus Dashboard and Task Tracker designed to help you organize work intervals, track tasks, and monitor daily analytics. 
It shares the same **Supabase Backend** authentication as the Zenote Notepad app, meaning approved accounts on Zenote are automatically authorized to access Zenfocus.

*If Supabase keys are not configured, the app automatically falls back to **"Local Offline Guest Mode"**, running completely within your browser via `localStorage` with offline capabilities.*

## ✨ Features

- ⏱️ **Interactive Pomodoro Timer**: Standard focus (25m), short break (5m), and long break (15m) interval timers with circular visual SVG progress feedback.
- 🎵 **Synthesized Audio Chimes**: Alert bells sound upon focus completion using browser audio oscillators (completely local, zero audio files loaded over network!).
- 📋 **Integrated Task Tracker**: Add tasks and prioritize items. Focus directly on active tasks from the tracker (integrates task names into active focus cycles).
- 📊 **Analytics Dashboard**: Tracks total focus duration, completed session counts, and daily goal progress. Stores a persistent session logs table.
- 🔐 **Shared Authentication**: Synchronized with Zenote's `profiles` table to manage admin approvals. Unapproved users are blocked until approved.
- 📱 **PWA Support**: Can be installed as a standalone application on mobile devices and desktop systems with offline execution capabilities.

## 🛠️ Tech Stack

- **Core**: HTML5, CSS3 Variables, ES6 JavaScript (No heavyweight frameworks)
- **Database & Auth**: Supabase (shared user table)
- **Icons**: Lucide Icons
- **Deployment**: Vercel Static Hosting

---

## ⚙️ Database Configuration

Since this dashboard shares the same Supabase database and authentication profiles as Zenote, you only need to create the tasks and focus history tables.

### Execution steps:
1. Go to your **Supabase Dashboard** -> click on **SQL Editor**.
2. Click **"New query"** to create a blank query tab.
3. Open [supabase_schema.sql](file:///D:/K/github/ai_garbage/focus-dashboard/supabase_schema.sql), copy the code, paste it into the editor, and click **"Run"**.
*This creates the `focus_tasks` and `focus_sessions` tables and configures RLS security.*

### Key Setup:
Open [app.js](file:///D:/K/github/ai_garbage/focus-dashboard/app.js) and paste the exact same URL and Anon Key that you used in Zenote at the top of the file:
```javascript
const SUPABASE_URL = 'YOUR_SUPABASE_PROJECT_URL'; 
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_PUBLIC_KEY';
```

---

## 🚀 Local Running
Run a local static server:
```bash
npx serve .
```
Then open `http://localhost:3000` in your browser.

---

## ☁️ Deploy to Vercel
Deploy the focus dashboard directly to Vercel:
```bash
vercel --prod
```
Follow the CLI instructions to bind the project and push to production!
