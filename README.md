# Spieleabend

Eure eigene Spiele-App für die Gruppe. Läuft als installierbare App auf Android, iPhone und PC, und nur ihr kommt rein.

Drin sind zwei Spiele:

- **Wer bin ich?** – Zettel auf der Stirn, mit Charakteren, die ihr euch gegenseitig aussucht.
- **Quizwand** – Fragen-Board im Jeopardy-Stil mit Buzzer. Du moderierst, die anderen raten.

Weitere Spiele lassen sich später einbauen. Sie erscheinen dann als neue Karte auf der Startseite.

> Dieses Paket ersetzt das frühere `werbinich`-Paket. „Wer bin ich?“ ist hier komplett enthalten, du brauchst nur noch dieses Repository.

---

## So funktioniert die App

Wer die App installiert und einmal den Gruppencode eingegeben hat, ist in der Gruppe. Auf der Startseite stehen alle Spiele. Unter jedem Spiel siehst du die offenen Räume deiner Freunde und kommst mit **Beitreten** rein. Oder du öffnest selbst einen Raum; wer ihn öffnet, leitet das Spiel.

Schließt du die App oder ist das Netz kurz weg, landest du beim nächsten Öffnen wieder in deinem Raum. Verwaiste Räume räumt die App selbst auf.

### Wer bin ich?

1. **Raum öffnen**, die anderen treten bei. Wer den Raum öffnet, ist Admin.
2. Der Admin legt das Thema fest, auf zwei Arten:
   - **Ein Thema für alle:** mit **Thema würfeln** oder selbst eingetippt (die Themenliste schlägt beim Tippen passende Themen vor).
   - **Jede Person ein eigenes:** Für jede Person ein Thema aus der Liste wählen, selbst eintippen oder mit dem Würfel daneben würfeln. Leer gelassen wird beim Start gewürfelt, **Freie Wahl** heißt: alles erlaubt. Wer für jemanden aussucht, sieht dessen Thema, und in der Raterunde steht es unter jedem Zettel.

   Unter „Aus welchen Bereichen gewürfelt wird“ stellst du ein, welche Themen der Würfel nimmt (z. B. nur Gaming und Internet). Ohne Thema ist alles erlaubt.
3. Unter **Wer sucht für wen aus?** sehen alle schon in der Lobby, wer wem einen Charakter gibt. Niemand bekommt sich selbst. Der Admin kann **Jetzt neu auslosen** und einstellen, ob die Zuteilung **jede Runde neu ausgelost** wird oder bleibt.
4. **Runde starten.** Jede Person schreibt einen Charakter auf den Zettel der zugeteilten Person, auf Wunsch mit Hinweis wie „aus Elden Ring“ und mit **Bild** (freiwillig): **Bei Google suchen** öffnet die Bildersuche mit dem Namen. Dort Rechtsklick aufs Bild → **Bild kopieren**, zurück in die App und **Strg+V**. Hineinziehen, **Datei wählen** oder **Bildlink einfügen** gehen auch. Das Bild wird auf deinem Gerät verkleinert und klebt dann auf dem Zettel.
5. Sobald alle ihren Zettel aufgeklebt haben, beginnt die Raterunde. Alle sehen die Zettel der anderen, nur den eigenen nicht. Die Reihenfolge ist zufällig.
6. Der Admin tippt auf **Nächster**, **Zurück** oder **Erraten**. Wer erraten hat, bekommt einen Platz und wird ab dann übersprungen. Wer dran ist, kann den Zug auch selbst beenden.
7. Wenn alle erraten haben oder der Admin die Runde beendet, gibt es die Auflösung mit Platzierung.

Außerdem: Aufgeben, eigene Notizen („männlich? kein Mensch“), Warnung bei doppelten Charakteren, Ton und Vibration, wenn du dran bist. Ist der Admin offline, kann jemand anderes **Admin übernehmen**. Wer mitten in einer Runde dazukommt, schaut zu und spielt ab der nächsten mit. Kommt jemand dazu oder geht, passt sich die Zuteilung an; die übrigen Paare bleiben, wie sie waren.

**Themen für die nächste Runde** lassen sich jederzeit einstellen, auch mitten in einer Runde (Link unten bzw. in der Leiste). Die laufende Runde bleibt dabei, wie sie ist.

**Rechte verteilen:** Tipp in der Lobby auf eine Person. Als Admin kannst du ihr einzeln Rechte geben: **Runden steuern** (starten, abbrechen, beenden, Nächster/Zurück/Erraten), **Themen einstellen** (Themen und Zuteilung) und **Leute entfernen**. Wer Rechte hat, bekommt ein kleines Schild neben dem Namen. Den Raum schließen und Rechte vergeben kann nur der Admin. Die Rechte gelten für diesen Raum.

**Themenliste:** Unter **Themenliste** (auf der Startseite bei Wer bin ich oder in der Lobby) siehst du alle Themen. Als Gruppenbesitzer kannst du dort Themen hinzufügen, ändern, löschen und neue Bereiche anlegen. Die Liste liegt in eurer Datenbank und gilt dauerhaft für alle. Ein selbst eingetipptes Thema übernimmst du mit **Dieses Thema dauerhaft in die Themenliste aufnehmen** direkt in den Bereich „Eigene Themen“. **Eingebaute Liste wiederherstellen** holt die ursprünglichen Themen zurück.

Den eigenen Zettel kann man auch mit Tricks nicht auslesen. Die Datenbank gibt ihn erst heraus, wenn du erraten oder aufgegeben hast.

### Quizwand

Du bist Host und moderierst, die anderen spielen. Als Host spielst du nicht mit, weil du die Lösungen siehst.

**Quiz vorbereiten**

Startseite → Quizwand → **Quiz hosten**. Unter **Meine Quizze** kannst du:

- **Neues Quiz** anlegen und im Editor füllen,
- eine Quiz-Datei mit **Datei importieren** laden,
- das **Beispiel-Quiz** laden, um alles einmal auszuprobieren.

Im Editor:

- **Boards** stehen oben als Reiter. Ein Quiz kann mehrere haben, die nacheinander gespielt werden (z. B. erst ein LoL-Board, dann eins zu Gaming allgemein). Über **⋮ Board** kopierst, verschiebst oder löschst du ein Board. Ein Board kann normale, doppelte oder dreifache Punkte geben.
- **Größe:** Bei „Kategorien“ und „Fragen pro Kategorie“ stellst du mit − und + ein, wie groß das Board ist (bis 8 × 10). Neue Boards starten mit 5 Kategorien und den Punkten 100, 200, 300, 400.
- **Punkte:** Die Zahl links neben jeder Zeile gilt für die ganze Zeile. Einzelne Fragen kannst du in der Frage selbst anders bewerten.
- **Kategorien** benennst du direkt im Kopf der Spalte; über **⋮** verschiebst oder entfernst du sie.
- Jedes Feld zeigt, was drin ist: Art der Frage, Modus, Timer, Medium. Fehlt noch etwas (z. B. die Antwort), ist es orange markiert.

Tipp auf ein Feld, um die Frage zu schreiben:

- **Freitext** (die anderen tippen die Antwort), **Auswahl** (2 bis 6 Antworten, eine richtig) oder **Schätzfrage** (eine Zahl, siehe unten),
- weitere Antworten, die auch zählen (z. B. „UdSSR“ neben „Sowjetunion“),
- wer antwortet (siehe Fragemodi) und auf Wunsch ein **Timer** für diese Frage,
- **Bild, Video oder Ton** als eigene Datei oder als Link, auch YouTube (siehe unten),
- eine Notiz, die nur du siehst, und ein Medium, das mit der Lösung erscheint.

Mit **Nächste Frage** (oder Strg + Enter) springst du gleich zum Feld darunter. Gespeichert wird automatisch, auch beim Schließen.

**Spielen**

1. Bei deinem Quiz auf **Hosten**. Der Raum erscheint bei deinen Freunden auf der Startseite.
2. Alle treten bei. Du siehst den Ping jeder Person, kannst die Reihenfolge mischen oder per Hand ändern und die Regeln einstellen.
3. **Spiel starten.** Ab jetzt merkt sich die App, wer dran ist, und zählt die Punkte.
4. Wer dran ist, wählt auf dem eigenen Gerät ein Feld. Du kannst auch selbst eins für die Person antippen.
5. Die Frage erscheint bei allen. Bei dir steht zusätzlich **Lösung (nur du)**.
6. Je nach Modus antwortet eine Person oder alle. Die Antwort kann eingetippt, ausgewählt oder einfach im Discord gesagt werden. Im letzten Fall tippst du direkt auf **Richtig** oder **Falsch**.
7. Bei eingetippten Antworten zeigt die App erst einen Vorschlag: wer richtig liegt und wie sich die Punkte ändern würden. Du kannst jedes Häkchen umdrehen oder auf die Punktzahl tippen und selbst Punkte festlegen. Erst mit **Übernehmen** zählt es.
8. Danach auf Wunsch **Lösung allen zeigen**, dann **Zurück zum Board**. Die nächste Person ist automatisch dran.

Ist ein Board durch, geht es mit **Nächstes Board** weiter. **Spiel beenden** zeigt den Endstand mit Platzierung. Mit **Weiterspielen** geht es danach doch noch weiter.

**Fragemodi** – pro Frage einstellbar. Fragen ohne eigenen Modus nutzen den Standard des Quiz.

| Modus | Wer antwortet |
|---|---|
| Reihum | Wer dran ist. Ist die Antwort falsch, geht es so weiter, wie du es eingestellt hast: Buzzer für alle (Standard), nächste Person oder die Frage ist weg. |
| Buzzer | Alle dürfen buzzern, die schnellste Reaktion antwortet. Liegt sie falsch, ist der Buzzer für die anderen wieder offen. |
| Solo | Nur wer dran ist. Niemand kann die Frage wegschnappen. |
| Alle | Alle antworten gleichzeitig, jede richtige Antwort bekommt die Punkte. |

**Zusatzregeln** – alle aus, bis du sie einschaltest. Du kannst sie auch mitten im Spiel ändern; die Mitspieler sehen in der Lobby, was gilt.

- Falsche Antwort kostet Punkte: die Hälfte oder den vollen Wert
- Minuspunkte erlaubt (sonst bleibt niemand unter 0)
- Wegschnappen bringt nur die Hälfte
- Wer richtig antwortet, wählt die nächste Frage (statt einfach reihum)
- Frühstarter am Buzzer kurz sperren
- Antwortzeit: 10, 20 oder 30 Sekunden

**Timer pro Frage** – standardmäßig aus. Stellst du bei einer Frage einen Timer ein (10 bis 120 Sekunden), läuft er bei allen sichtbar mit. Als Host kannst du ihn im Spiel um 10 Sekunden verlängern, ausschalten oder bei Fragen ohne Timer einen starten. Ist die Zeit um, geht es zur Auswertung.

**Schätzfragen** – die Antwort ist eine Zahl („Wie viele Gemälde hat Van Gogh gemalt?“). Die Mitspieler tippen eine Zahl; „1.250“, „3,5“ und „12 Mio“ versteht die App.

- **Antwortet eine Person** (Reihum, Solo, Buzzer), zählt der **Fehlerbereich**: nur genau, ± eine Zahl (z. B. ± 100) oder ± Prozent (z. B. ± 10 %). Wer innerhalb liegt, liegt richtig.
- **Antworten alle** (Modus „Alle“), stellst du ein, wie gewertet wird: **Nächste Schätzung gewinnt** (bei Gleichstand alle gleich nahen), **Weiteste Schätzung verliert** (alle anderen gewinnen) oder **Alle im Fehlerbereich gewinnen**.
- Mit **Lösung allen zeigen** sehen alle die Zahl und alle Schätzungen, sortiert nach Abstand.

**Joker** – stellst du in der Lobby ein (0 bis 3 pro Person und Art, am Anfang alle 0). Dort legst du auch fest, **wann** Joker eingesetzt werden – das gilt dann für das ganze Spiel:

| | Joker-Runde | Auf dem Board |
|---|---|---|
| Wann | nach der Feldwahl, bevor die Frage aufgeht | auf dem Board, bevor jemand ein Feld wählt |
| Was man dabei schon weiß | Kategorie, Wert, Modus und Art der Frage | noch nichts über die nächste Frage |
| Passt ein Joker nicht | ist er gar nicht erst wählbar (steht mit Grund unter „Passen hier nicht“) | Joker, die nie passen können, sind gesperrt. Passt einer beim Aufdecken nicht zur Frage, bekommt die Person ihn automatisch zurück. |
| Zurücknehmen | – | geht, bis ein Feld gewählt ist |
| Neues Feld | ja | gibt es nicht (man wählt ja einfach ein anderes Feld) |

In beiden Arten gilt: **Pro Frage geht nur ein Joker, und pro Person nur einer auf einmal.** Wer zuerst einsetzt, bekommt ihn. Alle sehen eine kurze Ansage, und in der Punkteliste steht, was gerade wirkt (×2, Schild, „setzt aus“).

*Joker-Runde im Detail:* Die Runde dauert 12 Sekunden. Sie endet früher, wenn ein Joker eingesetzt ist (kurze Ansage, dann geht die Frage auf), wenn alle „Ohne Joker weiter“ gewählt haben oder wenn du **Frage jetzt aufdecken** tippst. Mit **+10 s** gibst du mehr Bedenkzeit. Hat niemand einen passenden Joker übrig, gibt es keine Joker-Runde.

*Auf dem Board im Detail:* Unter „Deine Joker“ einen antippen, bei Aussetzen die Person wählen, dann **Für die nächste Frage einsetzen**. Alle sehen sofort, dass für die nächste Frage ein Joker gilt; die anderen können dann keinen mehr einsetzen.

**Du als Host greifst ein** (auf die Person tippen → „Joker von …“):

- **Geben und nehmen** mit − und +.
- **Einsetzen** – für die laufende Frage oder, auf dem Board, für die nächste. Das geht auch, wenn die App den Joker für unpassend hält. Hat die Person keinen mehr, ist er geschenkt.
- **Joker zurückgeben** (Knopf über der Frage bzw. auf dem Board): Der Joker wirkt nicht mehr, und die Person bekommt ihn zurück. Schon vergebene Punkte bleiben – die korrigierst du bei Bedarf selbst.
- Legst du eine Frage zurück, bekommt die Person ihren Joker ebenfalls wieder.

| Joker | Was er tut | Passt nur, wenn … |
|---|---|---|
| Doppelt | Diese Frage zählt für dich doppelt, Gewinn wie Abzug. | du bei der Frage antworten kannst |
| Aussetzen | Eine Person deiner Wahl setzt bei dieser Frage aus. Trifft es die Person, die das Feld gewählt hat, antwortet die nächste. | die Person bei der Frage antworten könnte |
| Spicken | Du siehst **live**, was die anderen gerade eintippen oder auswählen, und wer schon abgegeben hat. Übernommen wird nichts – deine Antwort gibst du selbst ab. | die Frage für alle ist |
| 50:50 | Alle falschen Antworten bis auf eine verschwinden, nur bei dir. | es eine Auswahlfrage mit mindestens 3 Antworten ist |
| Schutzschild | Liegst du daneben, kostet es dich keine Punkte. | falsche Antworten gerade Punkte kosten |
| Neues Feld | Das Feld bleibt offen, du wählst ein anderes (nur Joker-Runde). | du das Feld gewählt hast |

„Bei der Frage antworten können“ heißt: Bei Solo (und Reihum mit „Frage ist weg“) antwortet nur, wer das Feld gewählt hat – sonst kann es jede Person werden.

Was beim Spicken oder bei 50:50 zu sehen ist, bekommt nur die Person selbst – die anderen nicht. Was jemand tippt, geht dafür nur an dein Gerät, und nur solange jemand anderes spickt.

**Am PC:** Leertaste buzzert, bei Auswahlfragen wählen die Tasten 1–6, Enter gibt ab.

**Bilder, Videos und Töne**

- **Eigene Dateien** wählst du im Editor mit **Datei wählen**. Bilder werden automatisch verkleinert. Ein Video darf höchstens 20 MB groß sein, ein Ton 8 MB. Für längere Videos nimm lieber einen YouTube-Link.
- **Links:** YouTube oder eine direkte Adresse zu einem Bild, Video oder Ton (muss mit https:// anfangen). Bei Videos und Tönen legst du Start und Ende fest, z. B. 1:20 bis 1:35. Bei YouTube-Links mit Zeitangabe (…&t=42) wird der Start übernommen.
- **Im Spiel** erscheint das Medium bei allen mit der Frage. Video und Ton starten von selbst, sobald alle Geräte bereit sind (spätestens nach 8 Sekunden). Du siehst, wie viele bereit sind, und steuerst mit **Abspielen**, **Pause** und **Von vorn** für alle gleichzeitig. Bei Buzzer-Fragen mit Video oder Ton geht der Buzzer erst auf, wenn die Wiedergabe läuft.
- Blockiert ein Handy das automatische Abspielen, erscheint dort **Zum Abspielen tippen**. Bei YouTube auf dem iPhone muss man manchmal selbst aufs Video tippen.

**Korrigieren, wenn etwas schiefgeht**

- Tipp in deiner Spielerliste auf eine Person: Punkte setzen, Punkte dazu oder abziehen, **Ist jetzt dran**, in der Reihenfolge verschieben oder **Aus dem Raum entfernen**.
- **Rückgängig** nimmt die letzte Wertung zurück. Auf dem Knopf steht, welche (z. B. „Rückgängig: Videospiele 200 (Mia +200)“).
- Ein erledigtes Feld antippen öffnet es wieder.
- **Frage zurücklegen** legt eine Frage unbenutzt zurück aufs Board, solange noch niemand gewertet wurde. **Niemand weiß es** schließt sie ohne Punkte.

**So bleibt der Buzzer fair, auch bei langsamem Internet**

- Bevor der Buzzer aufgeht, läuft ein kurzer Countdown, damit alle die Frage zu Ende lesen können.
- Jedes Gerät misst selbst, wie schnell du drückst, ab dem Moment, in dem der Buzzer auf *deinem* Bildschirm aufleuchtet. Es gewinnt die schnellste Reaktion, nicht die schnellste Leitung.
- Nach dem ersten Drücken wartet die App noch kurz auf die anderen, bevor sie entscheidet. Wie lange, hängt vom schlechtesten Ping im Raum ab (0,3 bis 1,5 Sekunden). Den Ping misst die App laufend.
- Wer vor dem Aufleuchten oder unmenschlich schnell (unter 0,09 Sekunden) drückt, hat einen Frühstart.
- Du siehst als Host die Reaktionszeiten aller und kannst mit **Jetzt öffnen** den Countdown abkürzen.

### Deine Quizze bleiben bei dir

Deine Quizze liegen nur auf dem Gerät, auf dem du sie erstellst, nicht in der Datenbank. In die Datenbank kommt nur das Board-Gerüst (Kategorien und Punktwerte). Eine Frage wird erst gesendet, wenn sie im Spiel aufgedeckt wird, und die Lösung erst, wenn du auf **Lösung allen zeigen** tippst. Auch bei Auswahlfragen bleibt bis dahin geheim, welche Option richtig ist. Was die anderen eintippen, sieht bis zum Auswerten nur der Host. Erst dann sehen alle, wer was geantwortet hat.

Eigene Bilder, Videos und Töne lädt deine App schon in der Lobby hoch, damit sie im Spiel sofort da sind – aber **verschlüsselt**. Den Schlüssel bekommen die anderen erst, wenn du die Frage aufdeckst. Vorher kann niemand etwas damit anfangen, auch nicht mit Tricks. Schließt du den Raum, wird alles gelöscht.

Weil die Quizze nur in deinem Browser-Speicher liegen: **Exportier sie ab und zu als Datei** (bei einem Quiz auf **Mehr** → **Als Datei exportieren**). Eigene Medien kommen mit in die Datei. Löschst du Browser-Daten oder wechselst den PC, importierst du die Datei einfach wieder. Am besten hostest du immer vom selben Gerät aus.

---

## Einrichtung (einmalig, ca. 15 Minuten)

Du brauchst deinen Google-Account (für Firebase) und deinen GitHub-Account. Beides kostet nichts.

### 1. Firebase-Projekt anlegen

1. Öffne <https://console.firebase.google.com> und klicke **Create a new Firebase project** (bzw. **Add project**).
2. Name: `spieleabend` (oder etwas anderes). Google Analytics brauchst du nicht – ausschalten.
3. Nimm ein **neues** Projekt, nicht das von Treffpunkt („Stalker“). Die Regeln aus Schritt 3 würden sonst die von Treffpunkt ersetzen.

### 2. Datenbank anlegen

1. Links im Menü: **Databases & Storage → Realtime Database** → **Create Database**.
2. Location: **Belgium (europe-west1)**.
3. Security rules: **Start in locked mode** → **Enable**.

### 3. Regeln einfügen

1. In der Realtime Database oben den Tab **Rules** öffnen.
2. Alles im Editor löschen und den kompletten Inhalt von `database.rules.json` einfügen.
3. **Publish** klicken.

### 4. Anonyme Anmeldung einschalten

Niemand braucht ein Konto, jedes Gerät bekommt automatisch eine unsichtbare Kennung.

1. Links: **Security → Authentication** → **Get started**.
2. Tab **Sign-in method** → **Anonymous** → einschalten → **Save**.

### 5. Web-App registrieren und `config.js` ausfüllen

1. Oben links auf das Zahnrad → **Project settings** → Reiter **General**.
2. Unten bei **Your apps** auf das Web-Symbol **`</>`** klicken.
3. App nickname: `Spieleabend`. Firebase Hosting **nicht** ankreuzen. **Register app**.
4. Es erscheint ein Code-Block mit `const firebaseConfig = { … }`. Übertrage die Werte in `config.js` (die Anführungszeichen bleiben stehen).
5. Prüfe, dass `databaseURL` dabei ist und so ähnlich aussieht wie
   `https://spieleabend-xxxxx-default-rtdb.europe-west1.firebasedatabase.app`.
   Falls die Zeile fehlt: Die URL steht oben im Tab **Data** der Realtime Database.

Die Firebase-Werte sind nicht geheim, sie stehen bei jeder Firebase-Web-App öffentlich im Code. Den Zugang schützen der Gruppencode und die Regeln aus Schritt 3.

### 6. Auf GitHub Pages hochladen

1. Auf GitHub ein neues Repository `spieleabend` anlegen (**Public**, sonst geht GitHub Pages im Gratis-Tarif nicht).
2. **Add file → Upload files** und den kompletten Inhalt dieses Ordners hineinziehen, inklusive der Ordner `core`, `games`, `fonts`, `icons`, `vendor` und `vorlagen`. **Commit changes**.
3. **Settings → Pages** → Source: **Deploy from a branch** → Branch **main**, Ordner **/ (root)** → **Save**.
4. Nach 1–2 Minuten ist die App erreichbar unter `https://shizuniii.github.io/spieleabend/`.

Achte darauf, dass die Ordnerstruktur erhalten bleibt (`games/quiz/game.js` muss im Repository auch genau so liegen). Ziehst du den Ordner-Inhalt per Drag & Drop ins Upload-Fenster, klappt das automatisch.

### 7. App installieren und Gruppe einrichten

1. Öffne die Adresse auf deinem PC in **Chrome oder Edge** bzw. auf dem Handy.
2. Die Seite zeigt dir, wie du die App installierst (am PC: Installieren-Symbol in der Adressleiste; Android: **App installieren**; iPhone: in Safari **Teilen → Zum Home-Bildschirm**).
3. Öffne die installierte App. Weil du die erste Person bist, siehst du **Gruppe einrichten**: Tipp auf **Code würfeln** (oder denk dir einen mit mindestens 10 Zeichen aus) und gib deinen Namen ein. Merken musst du ihn nicht: Er steht in der Einladung, und du kannst ihn im Menü jederzeit ansehen.

Richte die Gruppe direkt nach dem Hochladen ein. Wer zuerst **Gruppe einrichten** drückt, wird Besitzer der Gruppe.

### 8. Freunde einladen

Menü (☰) → **Freunde einladen**. Das öffnet z. B. WhatsApp oder Discord mit Link und Gruppencode (am PC wird der Text kopiert). Deine Freunde öffnen den Link, installieren die App und geben den Code ein.

---

## Wer darf was?

| | Gruppenbesitzer (du) | Wer den Raum leitet | Alle |
|---|---|---|---|
| Gruppencode sehen und ändern, Mitglieder entfernen | ✓ | | |
| Räume öffnen und beitreten | ✓ | ✓ | ✓ |
| Wer bin ich: Thema, Zuteilung auslosen, Runde starten, Nächster/Zurück/Erraten, Leute entfernen | | ✓ (und wem der Admin das Recht gibt) | |
| Wer bin ich: Rechte vergeben, Admin übergeben, Raum schließen | | ✓ | |
| Wer bin ich: Themenliste der Gruppe ändern | ✓ | | ansehen |
| Wer bin ich: Admin übernehmen, wenn der Admin offline ist | | | ✓ |
| Quizwand: Fragen und Lösungen sehen, werten, Punkte korrigieren, Joker geben/einsetzen/zurückgeben, Medien steuern | | ✓ | |
| Quizwand: Feld wählen, Joker einsetzen, antworten, buzzern | | | ✓ |

Ändert der Besitzer den Gruppencode, bleiben alle bisherigen Mitglieder drin. Neue Leute brauchen ab dann den neuen Code. Wer draußen bleiben soll: erst entfernen, dann den Code ändern.

---

## Eigene Quizze als Datei

Quizze lassen sich als `.json`-Datei austauschen. In `vorlagen/quiz-vorlage.json` steht ein Beispiel mit jeder Fragenart und kurzen Erklärungen. So sieht eine Frage aus:

```json
{ "value": 200, "question": "In welchem Land wurde Tetris entwickelt?", "answer": "Sowjetunion", "accept": ["UdSSR"] }
{ "value": 300, "type": "choice", "question": "Hauptstadt von Australien?", "options": ["Sydney", "Canberra", "Melbourne", "Perth"], "correct": 1 }
```

```json
{ "value": 400, "type": "estimate", "question": "Wie viele Gemälde hat Van Gogh gemalt?", "number": 860, "unit": "Gemälde", "tolerance": "10%", "mode": "solo" }
{ "value": 200, "question": "Aus welchem Spiel ist diese Musik?", "answer": "Zelda", "time": 30, "media": { "src": "https://www.youtube.com/watch?v=…", "start": 12, "end": 27 } }
```

- `correct` zählt ab 0, also ist `1` die zweite Option.
- `mode` ist `turn` (Reihum), `buzzer`, `solo` oder `all`. Ohne `mode` gilt `defaultMode` des Quiz.
- `type`: `text`, `choice` oder `estimate`. Bei Schätzfragen: `number`, optional `unit`, `tolerance` („10%“ oder eine Zahl) und `scoring` (`closest`, `farthest`, `range`).
- `time`: Timer in Sekunden. `media` / `solutionMedia`: Link mit optional `start`, `end` und `autoplay`.
- `multiplier` bei einem Board: `2` für doppelte Punkte.
- Beim Import prüft die App die Datei und sagt dir, wenn etwas fehlt (z. B. eine Frage ohne Antwort).

Denk dran, wo die Datei liegt: In einem öffentlichen Repository kann sie jeder lesen. Lade echte Quizze **nicht** ins Repository hoch, sondern bewahr sie nur bei dir auf.

---

## Probleme und Lösungen

**„Firebase fehlt noch“** – `config.js` enthält noch die Platzhalter (Schritt 5).

**„Anmeldung ist in Firebase noch aus“** – Schritt 4 fehlt.

**„Keine Verbindung“ obwohl Internet da ist** – Meist stimmt `databaseURL` in `config.js` nicht. Vergleiche sie mit der URL im Tab **Data** der Realtime Database.

**„Etwas ist schiefgelaufen“ und in der Meldung steht „permission denied“** – Die Regeln aus Schritt 3 fehlen oder sind veraltet. Füge `database.rules.json` noch einmal komplett ein und klicke **Publish**.

**Die App lässt sich nicht installieren** – Am PC klappt es am zuverlässigsten mit Chrome oder Edge. Firefox kann Web-Apps je nach Version nicht oder nur eingeschränkt installieren – nimm dann Chrome oder Edge. Auf dem iPhone über Safari (Teilen → Zum Home-Bildschirm).

**Bild lässt sich nicht einfügen** – Manche Seiten erlauben das Kopieren über den Link nicht. Nimm in der Bildersuche **Bild kopieren** (nicht „Bildadresse kopieren“) und drück in der App Strg+V, oder speichere das Bild und nimm **Datei wählen**.

**Der Buzzer reagiert nicht** – Erst wenn er aufleuchtet, zählt das Drücken. Vorher ist es ein Frühstart. Am PC geht auch die Leertaste.

**„Du moderierst diesen Raum schon in einem anderen Fenster“** – Die App ist bei dir zweimal offen. Mach im anderen Fenster weiter oder schließ es, dann übernimmt dieses hier nach ein paar Sekunden.

**Video oder Ton startet nicht** – Erscheint **Zum Abspielen tippen**, hat der Browser das automatische Abspielen blockiert: einmal tippen, dann läuft es an der richtigen Stelle mit. Bei YouTube aufs Video tippen. Hilft das nicht, kurz **Von vorn** drücken.

**„Medien werden vorbereitet“ dauert lange** – Die eigenen Dateien gehen über deine Internetleitung raus. Große Videos brauchen etwas. Lass den Raum in der Lobby kurz offen, bevor ihr startet; was gebraucht wird, kommt zuerst dran.

**Meine Quizze sind weg** – Sie liegen nur im Browser-Speicher des Geräts, auf dem du sie erstellt hast. Öffne die App dort, oder importier deine exportierte Datei.

**Neues Handy oder App-Daten gelöscht** – Einfach mit dem Gruppencode wieder beitreten.
Betrifft das dein Gerät als Gruppenbesitzer: Tritt mit dem Code wieder bei, öffne Menü (☰) und lies unten deine neue **Geräte-ID** ab. Trag sie in der Firebase Console unter **Realtime Database → Data → config → owner** ein. Danach bist du wieder Besitzer.

**Jemand Fremdes hat den Code** – Menü → **Mitglieder verwalten** → entfernen, danach Menü → **Gruppencode ansehen oder ändern**.

**Testen im normalen Browser-Tab** – Hänge `?dev` an die Adresse (`…/spieleabend/?dev`). Das überspringt nur den Installations-Hinweis; der Gruppencode wird trotzdem verlangt. In einem **Inkognito-Fenster** kannst du so am PC als zweite Person mitspielen und z. B. dein eigenes Quiz testen. (Ein normales zweites Fenster gilt als dieselbe Person.) Die Test-Person entfernst du danach unter **Mitglieder verwalten**.

**Updates** – Geänderte Dateien einfach wieder ins Repository hochladen. Die App holt sich beim nächsten Öffnen die neue Version. Hat sich `database.rules.json` geändert (zuletzt in Version 2.4.0), füge die Regeln wie in Schritt 3 neu ein und klicke **Publish** – sonst funktionieren neue Funktionen wie Rechte, Bilder oder die Themenliste nicht.

---

## Probelauf vor dem ersten Spieleabend

Hier in der Entwicklung lief alles gegen eine nachgebaute Datenbank mit euren echten Regeln. Die echte Firebase-Verbindung und eure Geräte kann nur ein echter Test prüfen. 15 Minuten reichen:

1. Regeln neu einfügen und **Publish** (Schritt 3).
2. App am PC öffnen, dazu ein **Inkognito-Fenster** mit `?dev` als zweite Person (oder ein Handy).
3. **Wer bin ich:** Raum öffnen, zweite Person beitreten lassen, ihr **Runden steuern** geben, Themen pro Person einstellen, Runde starten, ein Bild per Strg+V einfügen, raten, Runde beenden.
4. **Quizwand:** Beispiel-Quiz hosten, eine Frage mit Buzzer, eine Frage für alle, einen Joker.
5. Themenliste öffnen, ein Thema hinzufügen, speichern, in der Lobby wiederfinden.
6. Danach die Test-Person unter **Mitglieder verwalten** entfernen.

Tipp für den Quiz-Abend: Lass das Host-Fenster sichtbar (nicht minimiert). Die App hält ihre Uhren zwar auch im Hintergrund am Laufen, aber manche Rechner drosseln versteckte Fenster stark oder schicken sie schlafen.

---

## Grenzen

- **Schutz gegen Fremde:** Rein kommt nur, wer den Gruppencode kennt. Neue Codes müssen mindestens 10 Zeichen haben; ein gewürfelter Code hat rund 2 Milliarden Möglichkeiten – durch Ausprobieren findet ihn niemand.
- **Schummeln in der Gruppe:** Die Datenbank-Regeln verhindern das Naheliegende, auch mit Browser-Werkzeugen: Bei Wer bin ich kann niemand den eigenen Zettel schreiben, fremde Zettel ändern, „erraten“ oder „aufgegeben“ zurückdrehen oder heimlich Admin werden, solange der Admin online ist. Beim Quiz sieht niemand Fragen, Lösungen oder Antworten der anderen vor der Zeit, und nur dein Gerät schreibt Punkte. Eingaben haben feste Formen und Größen, damit niemand die Datenbank mit Unsinn füllt.
- **Was sich nicht verhindern lässt** (dafür bräuchte es einen eigenen Server): Die Reaktionszeit am Buzzer misst jedes Gerät selbst – wer sich mit Browser-Werkzeugen auskennt, könnte sie fälschen. Bei Wer bin ich könnte jemand mit solchen Werkzeugen die Runde für alle sichtbar vorzeitig beenden. Beides fällt sofort auf; unter Freunden passt das.
- Der Host muss die App während des Quiz offen haben, denn sein Gerät führt das Spiel. Geht er kurz offline, pausiert das Spiel und läuft weiter, sobald er zurück ist. Bei Fragen für alle wartet die App nicht auf Leute, deren Verbindung weg ist: Haben alle, die online sind, abgegeben, geht es nach ein paar Sekunden zur Auswertung.
- Schließt du den Browser, ohne den Quiz-Raum zu schließen, räumt die App ihn auf, sobald du das nächste Quiz hostest – samt hochgeladener Medien.
- **Bilder bei Wer bin ich** werden verkleinert in eurer Datenbank gespeichert (meist 20–80 KB) und mit dem Raum wieder gelöscht. Lässt eine Seite das Umwandeln nicht zu, wird nur der Link gespeichert; das Bild lädt dann bei jedem direkt von dieser Seite und kann verschwinden, wenn die Seite es löscht.
- **Rechte** gelten bei Wer bin ich. Bei der Quizwand bleibt die Leitung absichtlich bei dir allein, weil nur dein Gerät Fragen und Lösungen kennt – ein Mit-Host würde die Lösungen sehen.

## Kosten

Firebase im kostenlosen Spark-Tarif reicht locker: bis zu 100 Geräte gleichzeitig verbunden, 1 GB Speicher, 10 GB Download im Monat. Ohne eigene Medien fallen pro Spielabend nur ein paar Kilobyte an. Eigene Dateien lädt jedes Gerät einmal herunter: Ein Quiz mit 20 MB Medien und 5 Leuten braucht etwa 100 MB – damit gehen viele Spielabende im Monat. YouTube-Links kosten nichts davon. GitHub Pages ist für öffentliche Repositories kostenlos.

---

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html`, `style.css` | Seite und Aussehen |
| `app.js` | Plattform: Gruppe, Startseite, Räume, Menü |
| `core/backend.js` | Verbindung zu Firebase, Online-Status, Ping |
| `core/ui.js` | Gemeinsame Bausteine (Zettel, Fenster, Töne) |
| `games/index.js` | Liste der Spiele – hier wird ein neues Spiel eingetragen |
| `games/werbinich/` | Wer bin ich? (`logic.js` Spielregeln und Rechte, `game.js` Bildschirme, `topics.js` eingebaute Themen, `catalog.js` Themenliste bearbeiten, `images.js` Bilder für Zettel) |
| `games/quiz/` | Quizwand (`logic.js` Spielregeln und Joker, `library.js` deine Quizze, `studio.js` Editor, `media.js` Bilder/Videos/Töne, `game.js` Bildschirme und Host-Steuerung) |
| `config.js` | Deine Firebase-Daten |
| `database.rules.json` | Sicherheitsregeln für die Datenbank |
| `manifest.webmanifest`, `sw.js`, `icons/` | Installierbarkeit als App |
| `vorlagen/quiz-vorlage.json` | Vorlage für Quiz-Dateien |
| `vendor/firebase.js` | Firebase-Bibliothek 13.4.0 (Apache-2.0), gebündelt |
| `fonts/` | Bricolage Grotesque (OFL) und Permanent Marker (Apache-2.0) |

Ein neues Spiel ist ein eigener Ordner unter `games/` mit einer `game.js`, die in `games/index.js` eingetragen wird. Die Plattform kümmert sich um Gruppe, Räume, Online-Status und Startseite.
