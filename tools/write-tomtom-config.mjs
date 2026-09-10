#!/usr/bin/env node
/**
 * Schreibt tomtom-config.json aus der Umgebungsvariable TOMTOM_API_KEY —
 * gedacht für den Build-Schritt bei Cloudflare Pages, genau wie
 * write-firebase-config.mjs für die Firebase-Werte.
 *
 * Damit landet der Key nie im Git-Repository: er steht bei Cloudflare unter
 * Workers & Pages → Projekt → Settings → Variables and secrets, und wird erst
 * beim Bauen in die Datei geschrieben, die die App zur Laufzeit lädt (siehe
 * js/store.js, loadAmbientTomTomKey) — und zwar nur dann, wenn die
 * Fahrzeitberechnung auf „Heute“ tatsächlich zum ersten Mal angefragt wird.
 *
 * Anders als bei Firebase ist der Key hier kein Geheimnis im technischen
 * Sinn: er steckt danach lesbar im ausgelieferten Bündel, wie bei jeder
 * Karten-API für den Browser üblich (Google Maps, Mapbox, …). Sicherheit
 * kommt aus der Domain-Beschränkung im TomTom-Dashboard, nicht aus
 * Geheimhaltung — die sollte trotzdem gesetzt sein, siehe SETUP.md.
 *
 * Ist TOMTOM_API_KEY nicht gesetzt, tut das Skript nichts: die
 * Fahrzeitberechnung bleibt dann aus, bis jemand von Hand einen Key unter
 * „Mehr → Dieses Gerät“ einträgt (siehe js/views/settings.js). Anders als bei
 * Firebase gibt es hier kein „unvollständig“ — es ist ein einzelnes Feld.
 */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const apiKey = process.env.TOMTOM_API_KEY;

if (!apiKey) {
  console.log('write-tomtom-config: TOMTOM_API_KEY nicht gesetzt — tomtom-config.json bleibt aus.');
  process.exit(0);
}

writeFileSync(join(root, 'tomtom-config.json'), JSON.stringify({ apiKey }, null, 2) + '\n');
console.log('write-tomtom-config: tomtom-config.json geschrieben.');
