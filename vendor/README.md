# vendor/

`firebase.js` ist ein gebündeltes ESM-Paket des offiziellen Firebase-Web-SDK
(App + Auth + Firestore + App Check). Es liegt im Repo, damit die App ohne CDN
läuft und der Service Worker sie vollständig offline vorhalten kann.

Daneben liegt `firebase.lock.json`: darin steht, aus welcher Fassung das Bündel
gebaut wurde, wie groß es ist und welchen sha256-Fingerabdruck es hat. `npm
test` vergleicht beides — ein angehobenes `firebase` in `package.json` ohne
neuen Bau fällt damit auf, statt still ein altes SDK auszuliefern.

Neu bauen (z. B. für ein Sicherheitsupdate):

```sh
npm ci                    # genau die Fassungen aus package-lock.json
npm run build:firebase    # schreibt firebase.js und firebase.lock.json
npm test
```

Die Fassung steht in `package.json` unter `devDependencies` und wird von
Dependabot gepflegt (`.github/dependabot.yml`). Nach jedem Bau: `APP_VERSION`
in `sw.js` hochzählen, sonst bekommt kein Gerät das neue SDK.

Was gebündelt wird, steht in `tools/firebase-bundle.mjs` (`ENTRY`) — kommt dort
etwas dazu, muss neu gebaut werden.
