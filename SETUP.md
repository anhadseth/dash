# Dash setup

## 1. Put it on GitHub (replaces the speedometer)
1. Open your `speedo` repo on github.com.
2. Delete the old files (index.html, sw.js, manifest.webmanifest). Keep the icons or overwrite them.
3. Add file > Upload files. Drag in everything from this folder except SETUP.md. Commit.
4. Your link stays the same: `https://YOUR-USERNAME.github.io/speedo/`

## 2. Google Maps key (live traffic ETAs + the map)
1. Go to console.cloud.google.com and sign in. Create a project called "Dash".
2. Turn on billing (needs a card; your use stays inside the free monthly amount).
3. APIs & Services > Library. Enable **Maps JavaScript API** and **Routes API**.
4. APIs & Services > Credentials > Create credentials > API key.
5. Edit the key:
   - Application restrictions: **Websites**. Add `https://YOUR-USERNAME.github.io/*`
   - API restrictions: **Restrict key** to Maps JavaScript API and Routes API.
6. Optional but smart: Billing > Budgets & alerts > make a $1 budget so you get an email if anything ever costs money.
7. Copy the key. In Dash: gear > Google Maps > API key. Paste.

## 3. Spotify (now playing, controls, playlists)
1. Go to developer.spotify.com/dashboard and log in with your Spotify account.
2. Create app. Name: Dash. Description: anything.
3. Redirect URI: paste exactly what Dash shows under Settings > Spotify (`https://YOUR-USERNAME.github.io/speedo/`). Tick **Web API**. Save.
4. Open the app's Settings and copy the **Client ID**.
5. In Dash: gear > Spotify > Client ID. Paste, then tap **Connect** and log in.
6. If the login finishes in Safari instead of the Home Screen app, Dash copies a code for you. Open the Home Screen app > Settings > Paste code.

## 4. Everything else (gear icon)
- Home address, second place (UBC), three people with numbers
- Speed limit: auto on, manual fallback
- Standby clock delay, Light / Dark / Auto

Everything you type in Settings is saved only on the iPad, never in your GitHub code.

After any future update: change `dash-v1` at the top of sw.js to `dash-v2` (and so on) so the iPad picks it up.
