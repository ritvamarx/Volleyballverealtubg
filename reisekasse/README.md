# 🇸🇪 Reisekasse Schweden – EUR ⇄ SEK mit Ausgabenprotokoll

Eine Web-App für die ganze Familie: **Euro und Schwedische Kronen umrechnen**
und alle **Reise-Ausgaben gemeinsam protokollieren**. Die App verhält sich wie
eine normale iPhone-App (Vollbild, eigenes Icon, offline nutzbar) – ganz ohne
App Store.

## ✨ Funktionen

| Bereich | Beschreibung |
|---|---|
| **💱 Umrechner** | Zwei verknüpfte Felder (€ und kr) – Eingabe in einem Feld rechnet live ins andere um. Tagesaktueller **EZB-Kurs** (automatisch geladen), Schnellübersichts-Tabelle, eigener Kurs einstellbar. |
| **🧾 Ausgaben** | Ausgaben in € **oder** kr erfassen – der jeweils andere Betrag wird zum Kurs des Eintragstags mitgespeichert. Beschreibung, Kategorie, Datum und **wer bezahlt hat**. Nach Tagen gruppiert, mit Tages- und Gesamtsummen, filterbar nach Person und Kategorie. |
| **📊 Statistik** | Gesamtsumme, Einträge, Ø pro Tag sowie Balken pro **Person** und pro **Kategorie**. |
| **👨‍👩‍👧‍👦 Familie** | Mitglieder der Familiengruppe verwalten, „Das bin ich“-Auswahl pro Gerät, Daten teilen/zusammenführen, Kurs-Einstellungen. |
| **📴 Offline** | Dank Service Worker funktioniert die App auch ohne Internet (der zuletzt geladene Kurs wird weiterverwendet). |

## 📱 So nutzt die Apple-Familiengruppe die App

1. **App veröffentlichen (einmalig):** Im GitHub-Repository unter
   **Settings → Pages → Branch auswählen → Ordner „/ (root)“ → Save** aktivieren.
   Die App ist danach unter
   `https://ritvamarx.github.io/Volleyballverealtubg/reisekasse/` erreichbar.
2. **Link an die Familie schicken** – z. B. per iMessage in die Familiengruppe.
3. Jedes Familienmitglied öffnet den Link in **Safari** und wählt
   **Teilen-Symbol → „Zum Home-Bildschirm“**. Ab jetzt startet die Reisekasse
   wie eine normale App mit eigenem Icon.
4. Beim ersten Start legt man einmal die **Namen der Familienmitglieder** an und
   wählt unter *Familie*, wer man selbst ist.

> Alternative ohne Hosting: `index.html` ist komplett eigenständig (CSS und
> JavaScript sind eingebettet). Die Datei kann auch per AirDrop/E-Mail verteilt
> und direkt im Browser geöffnet werden – Icons/Offline-Modus gibt es dann
> allerdings nicht.

## 🔄 Gemeinsame Daten (Teilen & Synchronisieren)

Die App speichert die Daten **lokal auf jedem Gerät** (`localStorage`) – es gibt
bewusst keinen Server und kein Konto, daher werden **keine persönlichen Daten
irgendwohin übertragen**.

Damit trotzdem alle denselben Stand haben:

- **Familie → 📤 Daten teilen** öffnet das iOS-Teilen-Menü (iMessage, AirDrop …)
  und verschickt den kompletten Stand als kleine Datei.
- Der Empfänger tippt auf **📥 Daten empfangen** und wählt die Datei aus.
- Die Stände werden **intelligent zusammengeführt**: neue Einträge kommen dazu,
  geänderte Einträge gewinnen mit dem neueren Stand, gelöschte Einträge bleiben
  gelöscht, gleichnamige Mitglieder werden vereinigt. Es geht nichts verloren –
  die Reihenfolge des Austauschs ist egal.
- **📝 Zusammenfassung als Text teilen** verschickt die aktuellen Summen
  (gesamt und pro Person) als einfache Nachricht.

Tipp für unterwegs: Abends teilt einfach die Person, die zuletzt Ausgaben
eingetragen hat, ihren Stand in die Familien-iMessage-Gruppe – alle anderen
lesen ihn mit einem Tipp ein.

## 💱 Wechselkurs

- Live-Kurs von der [Frankfurter-API](https://frankfurter.dev) (Daten der
  **Europäischen Zentralbank**, börsentäglich aktualisiert).
- Der Kurs wird lokal gepuffert und offline weiterverwendet; über das Badge oben
  rechts oder „↻ aktualisieren“ lässt er sich manuell neu laden.
- Unter *Familie → Wechselkurs* kann ein **eigener fester Kurs** hinterlegt
  werden (z. B. der tatsächliche Kartenkurs der Bank).
- Jede Ausgabe speichert den **Kurs vom Eintragstag** – die Summen bleiben also
  auch später korrekt.

## 🗂️ Projektstruktur

```
reisekasse/
  index.html            komplette App (HTML + CSS + JavaScript in einer Datei)
  manifest.webmanifest  PWA-Manifest (Name, Farben, Icons, Standalone-Modus)
  sw.js                 Service Worker (Offline-Cache der App-Shell)
  icons/                App-Icons (180/192/512 px)
  make_icons.py         erzeugt die Icons neu (benötigt Pillow)
```

## 🛠️ Lokal testen

```bash
cd reisekasse
python3 -m http.server 8000
# dann http://localhost:8000 im Browser öffnen
```
