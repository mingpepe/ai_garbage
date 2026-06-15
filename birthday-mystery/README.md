# Big Bear's Birthday Mystery - Kids Logic Game 🎂🔍

A colorful, interactive logic puzzle game designed for 6-year-old kids. The puzzle uses the principles of elimination to teach logical thinking, observation, and deductive reasoning.

## Story Background
Today is Big Bear's birthday! He has invited three friends to his house for cake:
- **Little Rabbit** 🐰
- **Little Monkey** 🐵
- **Little Kitty** 🐱

Each animal friend is wearing a different color shirt: **Red**, **Yellow**, and **Blue**. 

## Clues
1. **Little Rabbit** says: *"I don't like red, so I am not wearing red."*
2. **Little Monkey** says: *"I am wearing a shirt that is the color of a banana!"* (Yellow)
3. **Little Kitty** says: *"I am looking at my friend in the blue shirt and clapping!"* (Not wearing blue, and monkey is yellow, so kitty must be red. Therefore, rabbit must be blue.)

---

## Game Features
- **Kid-Friendly Interface**: Responsive layouts with soft colors, big shapes, and smooth animations.
- **Dynamic Graphics**: Handcrafted SVG drawings for all characters (Rabbit, Monkey, Kitty, and Birthday Bear) with cute CSS animations (ear wiggling, tail wagging, candle flickering).
- **Chinese Voice Prompts (SpeechSynthesis)**: Voice instructions and hints read aloud in Chinese to guide children who cannot read text.
- **Audio Synthesizer (Web Audio API)**: Self-contained background music (BGM) and custom sound effects (SFX) synthesized in the browser without external asset files.
- **Drag-and-Drop or Click-to-Assign**: Works beautifully on mobile/tablets (touch screens) and desktops (mouse inputs).
- **Celebration Confetti Engine**: A custom particle confetti shower that runs on victory.

---

## File Structure
- `index.html`: Web structure, SVG drawings, game overlays, and layout blocks.
- `style.css`: Visual styling, color system, keyframe animations, and custom CSS effects.
- `app.js`: Game logic, audio synthesizer, speech synthesis control, drag-and-drop actions, and validation logic.
- `package.json`: Vite developer scripts and dev dependencies.

---

## Running Locally
To launch and test the application, you can use any static server or compile it via Vite:

### Option A: Direct Browser Opening
Since the application uses standard Web APIs (SpeechSynthesis, Web Audio API, Canvas), you can double-click and open the `index.html` file directly in any modern browser (Chrome, Safari, Edge, Firefox)!

### Option B: Dev Server (Vite)
If you wish to run it through Vite:
1. Make sure you have [Node.js](https://nodejs.org) installed.
2. In your terminal, navigate to this directory:
   ```bash
   cd birthday-mystery
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Run the development server:
   ```bash
   npm run dev
   ```
5. Open the local address (typically `http://localhost:5173`) in your web browser.
