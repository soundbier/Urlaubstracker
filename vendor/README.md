# vendor/

`firebase.js` ist ein gebündeltes ESM-Paket des offiziellen Firebase-Web-SDK
(App + Auth + Firestore). Es liegt im Repo, damit die App ohne CDN läuft und
der Service Worker sie vollständig offline vorhalten kann.

Neu bauen (z. B. für ein SDK-Update):

```sh
npm run build:firebase
```

Das Skript liegt in `tools/build-firebase.mjs` und braucht nur `npx`.
