# Zenote - Minimalist Cloud Notepad 📝

Zenote is a client-side minimalist web notepad featuring a beautiful responsive layout, dark/light theme options, and category organization. It integrates **Supabase Authentication and Database Synchronization**, enabling multi-user secure registration/login and seamless cloud synchronization of notes.

*If Supabase keys are not configured, the app automatically runs in **"Local Offline Guest Mode"**. All notes are saved to `localStorage` in the user's browser, providing a zero-setup trial experience.*

## ✨ Features

- 👥 **Guest Mode**: Access the notebook immediately without registering. Notes are stored in local browser cache.
- 🔐 **Secure Login/Registration**: Multi-user registration via email and passwords powered by Supabase Auth.
- ☁️ **Cloud Synchronization**: Automatic, real-time syncing of notes between browser and cloud databases (prevents data loss when clearing cookies or switching devices).
- 🎨 **Glassmorphism UI**: Beautiful clean interfaces, dark and light theme toggles, and smooth micro-animations.
- 📂 **Category Tabs**: Filter notes instantly by color-coded categories: "Personal", "Work", "Ideas", and "Todo".
- 🔍 **Live Query Filter**: Search titles and body texts instantly in the sidebar list.
- ⚡ **Auto-save**: Debounced entries are auto-saved to local browser storage and cloud databases on typing.
- 📖 **Markdown Preview**: Toggle a live markdown preview pane (supporting headers, bold/italics, quotes, code blocks, lists, and hr dividers).
- 📊 **Writing Analytics**: Character counts, word counts, and estimated read-time stats.
- 📥 **Backups Export/Import**:
  - Download single note as a plain `.txt` file.
  - Export all notes as a single `JSON` file.
  - Import JSON backups to restore or merge notes.

## 🛠️ Technology Stack

- **Frontend Core**: Vanilla HTML5, CSS3 Custom Variables, ES6 JavaScript (No heavyweight framework dependencies - loading is extremely fast!)
- **Backend & Auth**: Supabase (Serverless Auth & Database)
- **Icons**: Lucide Icons CDN
- **Fonts**: Google Fonts (Inter & JetBrains Mono)
- **Deployment**: Vercel Static Hosting

---

## ⚙️ Cloud Configuration (Supabase Integration)

Follow these steps to activate cloud synchronization and authentication:

### Step 1: Create a Supabase Project
1. Log in to [Supabase](https://supabase.com/) and create a free project.
2. In your project dashboard, navigate to **Settings (gear icon)** -> **API**.
3. Copy the **Project API URL** and the **`anon` `public` API Key**.
4. Open [app.js](file:///D:/K/github/ai_garbage/client-notepad/app.js) and paste them at the top:
   ```javascript
   const SUPABASE_URL = 'PASTE_YOUR_PROJECT_URL_HERE'; 
   const SUPABASE_ANON_KEY = 'PASTE_YOUR_ANON_PUBLIC_KEY_HERE';
   ```

### Step 2: Initialize Database Table & Triggers
To store user notes and handle registration approvals:
1. In the Supabase dashboard, click on the **SQL Editor** tab.
2. Click **"New query"** to open a blank sheet.
3. Open [supabase_schema.sql](file:///D:/K/github/ai_garbage/client-notepad/supabase_schema.sql), copy the entire SQL script, paste it into the editor, and click **"Run"**.
*This creates the database tables, triggers to link profiles on registration, and setup RLS rules.*

---

## 🚀 Local Development

While you can double-click `index.html` to run locally, it is recommended to run a static local server:

Run the following command inside the project directory:
```bash
npx serve .
```
Then open `http://localhost:3000` in your web browser.

---

## ☁️ Deploy to Vercel

### Deploy via Vercel CLI (Fastest)
Run the following command inside the `client-notepad` folder:
```bash
vercel --prod
```
Follow the terminal instructions to link your project and deploy.
