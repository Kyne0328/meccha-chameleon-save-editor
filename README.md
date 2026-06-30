# Meccha Chameleon Save Editor

Static save editor for Meccha Chameleon.

## Fields

- Player name: `CustomPlayerName`
- Likes received: `eeyan`
- Players found: `ME`

## Deploy to Vercel

1. Push this project to GitHub.
2. Open Vercel.
3. Import the GitHub repository.
4. Use these settings:

```text
Framework Preset: Other
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

5. Deploy.

## Use the app

1. Open the deployed site.
2. Click **Choose .sav file**.
3. Select your Meccha Chameleon save file.
4. Edit the values.
5. Click **Download backup**.
6. Click **Download edited save**.
7. Put the edited save back in the game save folder.

Default save folder on Windows:

```text
%LOCALAPPDATA%\Chameleon\Saved\SaveGames
```

## Local check

```bash
npm install
npm run build
```

The deployable files are generated in `dist`.

## Notes

- The save file is processed in the browser.
- Websites cannot open a visitor's AppData folder directly.
- Player name must stay the same length as the original name.
