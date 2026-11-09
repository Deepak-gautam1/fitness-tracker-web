# Fitness Tracker (web, for iPhone)

The Android Fitness Tracker app rebuilt as a web app, so it runs on an iPhone without the App Store. It has the same rules and screens: Today, Workout, Food, Progress and Photos, plus Settings, the workout plan editor and My foods. It can follow the Android app's gym plan or a walking-based plan (see "Pick a plan").

Everything is stored on the phone. There's no account and no server. The app only goes online for the optional ChatGPT features, which use your own OpenAI API key.

## Install it on an iPhone

1. Open the app's link in **Safari**. A link tapped in WhatsApp may open inside WhatsApp: tap the Safari (compass) icon or *Open in Safari*, or copy the link into Safari.
2. Tap **Share**, then **Add to Home Screen**, then **Add**.
3. From now on, open it from the new **Fitness** icon. It opens full screen and works offline.

Use the Home Screen icon every time. The Home Screen app keeps its own data, separate from Safari, so anything logged in a Safari tab doesn't show up in it.

Android phones can use the same link: open it in Chrome and choose *Install app*.

## Pick a plan

The first time the app opens, it asks which plan to follow, plus your sex, height, current weight and target weight. Those numbers stay on the phone. Everything else can be changed later in *Settings*, including switching plans (*Settings › Plan*).

| | Gym: 6-day push/pull/legs | Walking & 3 meals |
| --- | --- | --- |
| Starting targets | 2,100 kcal · 150 g protein · 230 g carbs · 65 g fat | 1,450 kcal (floor 1,400) · 100 g protein · 150 g carbs · 45 g fat · 25–30 g fibre |
| Steps | 8,000–10,000 a day | 5,000 a day in week 1, then 6,000, 7,000, and 8,000–10,000 from week 4 |
| Training | Push A to Legs B, Monday to Saturday; Sunday rest; days off pause the order | Two optional short strength sessions a week (Strength A and B), on any days |
| Food | Six meal slots and the README's plan meals | Breakfast, lunch, dinner and snacks; the plan's three meals as one-tap ideas; a weekly protein rotation (chicken, fish, chicken, eggs + dal, lean mutton, fish, chicken) |
| Today | Today's workout, then the week's workouts | Today's walk against this week's step goal, the week's step days, strength sessions |
| After the goal | Phase 2: lean muscle building | Maintenance: hold the new weight |

Choosing *Female* uses the U.S. Navy body-fat formula for women (waist, hip and neck), and adds a note not to cut calories when weight rises around a period. The walking plan's strength sessions are a suggested starting point; change them under *Settings › Workout plan*.

## Moving data between phones

*Settings › Back up to a file* saves a JSON backup in the **same format as the Android app**. That means:

- **Android to iPhone:** on Android, *Settings › Back up to a file*. Send the file to the iPhone (WhatsApp, email, AirDrop, Files), then in the web app tap *Settings › Restore from a backup* and choose it.
- **iPhone to Android:** the same steps the other way round.
- **Photos:** *Export photos (ZIP)* and *Import photos (ZIP)* also match the Android app's file names (`2026-10-05_side.jpg`).

Deleting the app from the Home Screen deletes its data, so back up to a file now and then.

## What's different from the Android app

A web app on iPhone can't do everything an installed Android app can:

| Android app | Web app |
| --- | --- |
| One plan: the six-day gym cut | The gym plan or the walking & 3 meals plan, chosen on first run |
| Morning, evening and Sunday reminder notifications | No reminders. The Sunday check-in appears as a card on Today every Sunday instead |
| Rest timer buzzes on the lock screen and in other apps | The timer beeps only while the app is on screen, and only with the ringer switch on. It asks the phone to keep the screen awake while you rest |
| Home-screen widget | None |
| Health Connect fills in steps, sleep and weight | Typed in (Apple Health can't be read from a web app) |
| API key encrypted with the Android Keystore | API key encrypted with a browser key that can't be exported |

Everything else carries over: the workout order and days off, "beat last time" targets, personal bests, the weekly-rate rules, the cut progress and Phase 2 switch, maintenance estimate, consistency and habits, strength changes, waist and body fat (U.S. Navy estimate), progress photos and compare, plan meals, My foods, ChatGPT food estimates and day feedback, and CSV exports.

## Putting it online

It's a static site with no build step: host the folder anywhere that serves files over HTTPS. Two free options:

- **GitHub Pages:** push this folder to a *public* GitHub repository, then turn on *Settings › Pages › Deploy from a branch › main / root*. The link is `https://<user>.github.io/<repo>/`. (Pages needs a public repo on a free GitHub plan.)
- **Netlify Drop:** drag the folder onto [app.netlify.com/drop](https://app.netlify.com/drop).

**When you change a file, raise `VERSION` in `sw.js`** (`v1` → `v2`). Phones pick up the new version the next time the app opens and offer *Reload*.

## Run it on the computer

Service workers and storage need `http://localhost` or HTTPS, not a `file://` path. From this folder:

```powershell
npx http-server -p 8080 -c-1     # then open http://localhost:8080
```

## How the code is organised

No build step: plain ES modules plus one vendored file, [Preact](https://preactjs.com) with [htm](https://github.com/developit/htm) (`vendor/preact-htm.js`, MIT).

```text
index.html, manifest.webmanifest, sw.js   page shell, install info, offline cache
css/app.css        the Android app's colours (light and dark) and layout
js/domain.js       plan logic, ported line by line from the Android domain package:
                   7-day averages, weekly-rate rules, progressive overload, the
                   workout order and days off, checklist, Sunday check-in
js/seed.js         the built-in workouts for both plans, foods, plan meals and the
                   walking plan's protein rotation (SeedData.kt)
js/db.js           IndexedDB storage on the phone, kept in memory while the app runs
js/repo.js         every read and write the screens use (FitnessRepository.kt)
js/ai.js           ChatGPT: OpenAI client, prompts, day report, encrypted key
js/backup.js       JSON backup/restore (Android format), CSV, photo ZIPs
js/ui/*.js         the screens and shared components (setup.js is the first-run plan choice)
```
