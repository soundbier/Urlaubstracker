# Urlaubstracker

Ein persönlicher Urlaubsplaner als installierbare **Progressive Web App (PWA)** für gemeinsame Reisen.

Tagesplanung, Packliste und Reisekasse an einem Ort – **offlinefähig, ohne Abo und ohne eigenen Server**.

## Funktionen

* **Tagesplanung** – Aktivitäten, Orte, Uhrzeiten, Notizen und Kosten
* **Packliste** – Kategorien, Mengen, Status sowie Hand-/Aufgabegepäck
* **Packlisten-Übersicht** – kompakte Übersicht nach Kategorie und Sorte
* **Reisekasse** – Ausgaben, Einzahlungen, Bargeld, Tagesbudget und Endabrechnung
* **Reisegruppe** – 1–8 Personen mit flexibler Kostenaufteilung
* **Gemeinsame Nutzung** – Synchronisation mehrerer Geräte über Firebase
* **Offline-Modus** – App und lokale Daten funktionieren auch ohne Internet
* **Sicherheit** – lokale Daten werden AES-256-GCM-verschlüsselt
* **Export** – CSV und JSON
* **App-Sperre** – Code bzw. Biometrie
* **Dark Mode**

## Nutzung

Die App direkt im Browser öffnen und eine Reise anlegen.

Als PWA kann sie auf Android und iOS zum Startbildschirm hinzugefügt werden.

Ohne Firebase bleiben sämtliche Daten lokal auf dem Gerät.

## Mehrgeräte-Sync

Für die gemeinsame Nutzung wird ein eigenes **Firebase-Projekt mit Firestore und Anonymous Authentication** benötigt.

Die Firestore-Regeln befinden sich in:

```text
firestore.rules
```

Bei einer öffentlichen Bereitstellung sollte zusätzlich **Firebase App Check** aktiviert und für Firestore sowie Authentication erzwungen werden.

## Entwicklung

```bash
npm test
npm start
```

Lokaler Server:

```text
http://localhost:8080
```

Die Anwendung besteht aus reinem JavaScript, HTML und CSS und benötigt für die normale Entwicklung keinen Build-Schritt.

## Veröffentlichung

Das Projekt ist für **Cloudflare Pages** ausgelegt.

```text
Build command: npm run build
Build output: /
```

Firebase-Konfiguration und App-Check können über Cloudflare Environment Variables eingebunden werden.

## Datenschutz

Ohne Firebase werden keine Daten an einen Server übertragen.

Mit Firebase liegen die gemeinsam synchronisierten Reisedaten im eigenen Firestore-Projekt. Die App verwendet keinen eigenen Backend-Server und kein Tracking.

Weitere Informationen finden sich direkt in der App unter **Mehr → Datenschutz**.

---

**Marie & Lukas Urlaubstracker**
