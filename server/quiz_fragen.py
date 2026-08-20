"""Kanonische Quiz-Fragen (Server ist die Wahrheit).

Diese Datei ist die EINZIGE Quelle der Fragen samt richtiger Antwort (r) und
Punktwerten. Der Client bekommt die Fragen ohne r; die Auswertung und die
Punktevergabe passieren serverseitig (siehe app.py /api/portal/quiz).
Eigene Trainer-Fragen kommen zusätzlich aus dem App-State (quizFragen).
"""

# Punkte je Schwierigkeitsstufe: (Erstversuch, nach Fehlversuch)
STUFEN_PUNKTE = {1: (5, 3), 2: (10, 5), 3: (15, 8)}

KAPITEL = [
    {
        "key": 'feld',
        "titel": '📐 Feld, Netz & Ball',
        "fragen": [
            {"id": 'q05', "stufe": 1, "f": 'Wie groß ist das Volleyballfeld?',
             "a": ['20 × 10 Meter', '18 × 9 Meter', '16 × 8 Meter'], "r": 1},
            {"id": 'q06', "stufe": 1, "f": 'Wie hoch hängt das Netz bei den Damen?',
             "a": ['2,24 m', '2,43 m', '2,10 m'], "r": 0},
            {"id": 'q07', "stufe": 1, "f": 'Wie hoch hängt das Netz bei den Herren?',
             "a": ['2,24 m', '2,35 m', '2,43 m'], "r": 2},
            {"id": 'q19', "stufe": 1, "f": 'Der Ball landet genau auf der Linie. Was gilt?',
             "a": ['Aus', 'In – Linien gehören zum Feld', 'Wiederholung des Ballwechsels'], "r": 1},
            {"id": 'q20', "stufe": 2, "f": 'Der Ball berührt die Antenne am Netz. Was gilt?',
             "a": ['Weiterspielen', 'Der Ball ist aus', 'Nur beim Aufschlag ein Fehler'], "r": 1},
            {"id": 'q21', "stufe": 3, "f": 'Wo wird die Netzhöhe gemessen?',
             "a": ['An den Pfosten', 'Über der Feldmitte', 'An den Antennen'], "r": 1},
            {"id": 'q22', "stufe": 3, "f": 'Wie schwer ist ein offizieller Volleyball ungefähr?',
             "a": ['160–180 g', '260–280 g', '400–450 g'], "r": 1},
            {"id": 'q60', "stufe": 3, "f": 'Wie weit ragt die Antenne über die Netzoberkante hinaus?',
             "a": ['60 cm', '80 cm', '1 Meter'], "r": 1},
            {"id": 'q61', "stufe": 3, "f": 'Wie hoch ist der vorgeschriebene Innendruck eines Volleyballs?',
             "a": ['0,300–0,325 kg/cm²', '0,400–0,450 kg/cm²', '0,200–0,225 kg/cm²'], "r": 0},
            {"id": 'q63', "stufe": 3, "f": 'Wie breit ist das Netz von der Ober- bis zur Unterkante?',
             "a": ['80 cm', '1 Meter', '1,20 Meter'], "r": 1},
            {"id": 'q64', "stufe": 3, "f": 'Wie hoch muss der freie Raum über dem Spielfeld im nationalen Spielbetrieb mindestens sein?',
             "a": ['5 Meter', '7 Meter', '10 Meter'], "r": 1},
        ],
    },
    {
        "key": 'punkte',
        "titel": '🔢 Zählweise & Sätze',
        "fragen": [
            {"id": 'q02', "stufe": 1, "f": 'Bis wie viele Punkte geht ein normaler Satz?',
             "a": ['15', '21', '25'], "r": 2},
            {"id": 'q03', "stufe": 1, "f": 'Wie viele gewonnene Sätze braucht ein Team für den Sieg?',
             "a": ['2', '3', '4'], "r": 1},
            {"id": 'q04', "stufe": 1, "f": 'Bis wie viele Punkte geht der Entscheidungssatz (Tie-Break)?',
             "a": ['15', '20', '25'], "r": 0},
            {"id": 'q18', "stufe": 2, "f": '„Rally-Point-System“ bedeutet …',
             "a": ['Nur das aufschlagende Team kann punkten', 'Jeder Ballwechsel bringt einen Punkt', 'Punkte zählen nur im Tie-Break'], "r": 1},
            {"id": 'q23', "stufe": 2, "f": 'Es steht 24:24. Wie geht der Satz zu Ende?',
             "a": ['Golden Point – der nächste Punkt entscheidet', 'Es wird gespielt, bis ein Team 2 Punkte Vorsprung hat', 'Der Satz endet immer bei 25'], "r": 1},
            {"id": 'q24', "stufe": 2, "f": 'Wie viele Auszeiten hat jedes Team pro Satz?',
             "a": ['1', '2', '3'], "r": 1},
            {"id": 'q25', "stufe": 3, "f": 'Wann werden im Tie-Break die Seiten gewechselt?',
             "a": ['Bei 5 Punkten', 'Bei 8 Punkten', 'Gar nicht'], "r": 1},
        ],
    },
    {
        "key": 'team',
        "titel": '👥 Team & Rotation',
        "fragen": [
            {"id": 'q26', "stufe": 1, "f": 'Wie viele Spieler:innen stehen pro Team auf dem Feld?',
             "a": ['5', '6', '7'], "r": 1},
            {"id": 'q08', "stufe": 1, "f": 'Was passiert, wenn ein Team das Aufschlagrecht gewinnt?',
             "a": ['Alle rotieren im Uhrzeigersinn eine Position weiter', 'Alle rotieren gegen den Uhrzeigersinn', 'Nur die aufschlagende Person wechselt'], "r": 0},
            {"id": 'q09', "stufe": 2, "f": 'Welche Position organisiert den Angriff und spielt meist den zweiten Ball?',
             "a": ['Libero', 'Zuspiel (Steller:in)', 'Mittelblock'], "r": 1},
            {"id": 'q17', "stufe": 2, "f": 'Wann gibt es einen Rotationsfehler?',
             "a": ['Wenn jemand beim Aufschlag auf der falschen Position steht', 'Wenn der Ball beim Aufschlag das Netz berührt', 'Wenn zweimal hintereinander gebaggert wird'], "r": 0},
            {"id": 'q27', "stufe": 3, "f": 'Wie viele normale Auswechslungen sind pro Satz erlaubt?',
             "a": ['3', '6', 'Unbegrenzt'], "r": 1},
        ],
    },
    {
        "key": 'libero',
        "titel": '🦺 Libero',
        "fragen": [
            {"id": 'q10', "stufe": 1, "f": 'Wer trägt ein anderes Trikot als der Rest des Teams?',
             "a": ['Kapitän:in', 'Libero', 'Diagonal'], "r": 1},
            {"id": 'q11', "stufe": 2, "f": 'Was darf der Libero NICHT?',
             "a": ['Bälle baggern', 'Im Vorderfeld oberhalb der Netzkante angreifen', 'Eingewechselt werden'], "r": 1},
            {"id": 'q29', "stufe": 2, "f": 'Darf der Libero nach den offiziellen Regeln aufschlagen?',
             "a": ['Ja, immer', 'Nein', 'Nur im Tie-Break'], "r": 1},
            {"id": 'q30', "stufe": 3, "f": 'Zählt ein Libero-Tausch als normale Auswechslung?',
             "a": ['Ja', 'Nein – Libero-Wechsel zählen extra', 'Nur im 5. Satz'], "r": 1},
            {"id": 'q62', "stufe": 3, "f": 'Wie viele Liberos darf ein Team pro Spiel benennen?',
             "a": ['Genau eine:n', 'Bis zu zwei', 'Bis zu drei'], "r": 1},
            {"id": 'q67', "stufe": 3, "f": 'Was muss zwischen zwei Libero-Wechseln liegen?',
             "a": ['Nichts – jederzeit möglich', 'Ein abgeschlossener Ballwechsel', 'Eine Auszeit'], "r": 1},
            {"id": 'q31', "stufe": 3, "f": 'Der Libero pritscht den Ball in der Vorderzone hoch. Was gilt für den Angriff?',
             "a": ['Alles wie immer', 'Der Ball darf nicht oberhalb der Netzkante angegriffen werden', 'Der Ballwechsel wird wiederholt'], "r": 1},
        ],
    },
    {
        "key": 'angriff',
        "titel": '🎯 Aufschlag & Angriff',
        "fragen": [
            {"id": 'q14', "stufe": 1, "f": 'Was ist ein „Ass“?',
             "a": ['Ein geblockter Angriff', 'Ein direkter Punkt durch den Aufschlag', 'Ein Zuspielfehler'], "r": 1},
            {"id": 'q32', "stufe": 2, "f": 'Wie viel Zeit bleibt nach dem Pfiff für den Aufschlag?',
             "a": ['5 Sekunden', '8 Sekunden', '12 Sekunden'], "r": 1},
            {"id": 'q33', "stufe": 2, "f": 'Der Aufschlag berührt die Netzkante und fällt ins gegnerische Feld. Was gilt?',
             "a": ['Fehler – Punkt für den Gegner', 'Der Ball ist gültig, es wird weitergespielt', 'Der Aufschlag wird wiederholt'], "r": 1},
            {"id": 'q34', "stufe": 3, "f": 'Was gilt für Hinterspieler:innen beim Angriff aus der Vorderzone?',
             "a": ['Sie dürfen ganz normal angreifen', 'Sie dürfen den Ball dort nicht oberhalb der Netzkante schlagen', 'Sie dürfen gar nicht angreifen'], "r": 1},
            {"id": 'q35', "stufe": 2, "f": 'Wann ist der Aufschlag ein Fußfehler?',
             "a": ['Wenn die Grundlinie beim Absprung/Schlag berührt oder übertreten wird', 'Wenn man im Sprung aufschlägt', 'Wenn man von unten aufschlägt'], "r": 0},
        ],
    },
    {
        "key": 'netz',
        "titel": '🚫 Netz, Block & Fehler',
        "fragen": [
            {"id": 'q01', "stufe": 1, "f": 'Wie oft darf ein Team den Ball höchstens berühren, bevor er über das Netz muss (Block zählt nicht mit)?',
             "a": ['2-mal', '3-mal', '4-mal'], "r": 1},
            {"id": 'q12', "stufe": 1, "f": 'Wie heißt das obere Zuspiel mit den Fingerspitzen?',
             "a": ['Baggern', 'Pritschen', 'Blocken'], "r": 1},
            {"id": 'q13', "stufe": 1, "f": 'Wie heißt die Annahme mit den gestreckten Unterarmen?',
             "a": ['Baggern', 'Pritschen', 'Schmettern'], "r": 0},
            {"id": 'q36', "stufe": 2, "f": 'Zählt die Blockberührung als eine der drei Team-Berührungen?',
             "a": ['Ja', 'Nein', 'Nur beim Doppelblock'], "r": 1},
            {"id": 'q37', "stufe": 2, "f": 'Wann ist eine Netzberührung ein Fehler?',
             "a": ['Immer, sobald man das Netz berührt', 'Wenn man das Netz zwischen den Antennen während der Spielaktion berührt', 'Netzberührungen sind nie ein Fehler'], "r": 1},
            {"id": 'q38', "stufe": 2, "f": 'Wann ist das Übertreten der Mittellinie ein Fehler?',
             "a": ['Schon bei einer Fußspitze', 'Wenn der Fuß vollständig im gegnerischen Feld aufsetzt', 'Nie – die Mittellinie zählt nicht'], "r": 1},
            {"id": 'q40', "stufe": 3, "f": 'Darf die blockende Person den Ball direkt nach dem eigenen Block noch einmal spielen?',
             "a": ['Nein, das wäre eine Doppelberührung', 'Ja, das ist erlaubt', 'Nur wenn der Ball das Netz berührt hat'], "r": 1},
        ],
    },
    {
        "key": 'schiri',
        "titel": '🧑\u200d⚖️ Schiri-Regelquiz',
        "fragen": [
            {"id": 'q50', "stufe": 2, "f": 'Der Ball wird mit dem Fuß gespielt. Was gilt?',
             "a": ['Fehler – nur Arme und Hände sind erlaubt', 'Erlaubt – der Ball darf mit jedem Körperteil gespielt werden', 'Nur in der Abwehr erlaubt'], "r": 1},
            {"id": 'q51', "stufe": 2, "f": 'Eine Spielerin greift unter dem Netz durch und berührt den Ball, bevor die Gegner ihn gespielt haben. Entscheidung?',
             "a": ['Weiterspielen', 'Fehler – Eingriff in das gegnerische Spiel', 'Wiederholung des Ballwechsels'], "r": 1},
            {"id": 'q52', "stufe": 2, "f": 'Darf der gegnerische Aufschlag direkt geblockt werden?',
             "a": ['Ja, immer', 'Nein – Aufschlag blocken ist verboten', 'Nur im Tie-Break'], "r": 1},
            {"id": 'q53', "stufe": 3, "f": 'Zwei Gegenspieler berühren den Ball gleichzeitig über der Netzkante, der Ball bleibt im Spiel. Entscheidung?',
             "a": ['Doppelfehler, Wiederholung', 'Weiterspielen – das ist erlaubt', 'Punkt für das größere Team'], "r": 1},
            {"id": 'q54', "stufe": 3, "f": 'Wann müssen die Spieler:innen korrekt auf ihren Positionen stehen?',
             "a": ['Während des gesamten Ballwechsels', 'Nur im Moment des Aufschlag-Kontakts', 'Bis der Ball das Netz überquert hat'], "r": 1},
            {"id": 'q55', "stufe": 2, "f": 'Wer darf eine Auszeit beantragen?',
             "a": ['Jede:r auf dem Feld', 'Nur Trainer:in oder Spielkapitän:in', 'Nur die aufschlagende Person'], "r": 1},
            {"id": 'q56', "stufe": 2, "f": 'Der Ball überquert das Netz außerhalb des Raums zwischen den Antennen. Was gilt?',
             "a": ['Weiterspielen, wenn er im Feld landet', 'Fehler – der Ball muss zwischen den Antennen überqueren', 'Nur beim Aufschlag ein Fehler'], "r": 1},
            {"id": 'q57', "stufe": 3, "f": 'Die Haare einer Spielerin streifen beim Abdrehen das Netz. Entscheidung?',
             "a": ['Netzfehler', 'Kein Fehler', 'Verwarnung'], "r": 1},
            {"id": 'q58', "stufe": 3, "f": 'Bei der Annahme eines harten Aufschlags berührt der Ball in EINER Aktion erst die Arme, dann die Brust. Entscheidung?',
             "a": ['Doppelberührung – Fehler', 'Erlaubt: beim ersten Schlag des Teams sind aufeinanderfolgende Kontakte in einer Aktion ok', 'Nur beim Libero erlaubt'], "r": 1},
            {"id": 'q59', "stufe": 3, "f": 'Der Ball berührt die Hallendecke über dem EIGENEN Feld und bleibt auf der eigenen Seite. Was gilt (übliche Hallenregel)?',
             "a": ['Sofort Fehler', 'Weiterspielen, wenn das Team noch Berührungen übrig hat', 'Wiederholung des Ballwechsels'], "r": 1},
        ],
    },
    {
        "key": 'begriffe',
        "titel": '📖 Begriffe & Profi-Wissen',
        "fragen": [
            {"id": 'q15', "stufe": 2, "f": 'Was ist ein „Dig“?',
             "a": ['Die Abwehr eines harten Angriffsballs', 'Ein Sprungaufschlag', 'Ein Rotationsfehler'], "r": 0},
            {"id": 'q16', "stufe": 2, "f": 'Was ist eine Finte (Lob)?',
             "a": ['Ein besonders harter Schmetterschlag', 'Ein angetäuschter Angriff – der Ball wird kurz hinter den Block gelegt', 'Ein Aufschlag von unten'], "r": 1},
            {"id": 'q42', "stufe": 2, "f": 'Was bedeutet „Side-Out“?',
             "a": ['Das annehmende Team gewinnt den Ballwechsel', 'Der Ball landet im Seitenaus', 'Eine Auszeit des Trainerteams'], "r": 0},
            {"id": 'q43', "stufe": 3, "f": 'Was ist eine „Pipe“?',
             "a": ['Ein Aufschlag mit viel Effet', 'Ein Angriff aus dem Hinterfeld über die Mitte (Position 6)', 'Ein besonders hoher Block'], "r": 1},
            {"id": 'q65', "stufe": 3, "f": 'Was ist ein „Kong-Block“?',
             "a": ['Ein Block mit beiden Händen weit über dem Netz', 'Ein einarmiger Block – bekannt aus dem Beachvolleyball', 'Ein Block der kompletten Dreierreihe'], "r": 1},
            {"id": 'q66', "stufe": 3, "f": 'Was ist ein „Golden Set“?',
             "a": ['Ein Satz ohne einen einzigen Gegenpunkt', 'Ein Entscheidungssatz bis 15, wenn nach Hin- und Rückspiel Satzgleichheit herrscht', 'Der fünfte Satz eines normalen Spiels'], "r": 1},
            {"id": 'q41', "stufe": 2, "f": 'Wie lange dauert eine Auszeit?',
             "a": ['30 Sekunden', '60 Sekunden', '90 Sekunden'], "r": 0},
        ],
    },
]


def _stufe(frage) -> int:
    s = frage.get("stufe")
    return s if s in STUFEN_PUNKTE else 2


def punkte_fuer(frage, erstversuch: bool) -> int:
    """Punkte einer Frage – Erstversuch voll, nach Fehlversuch reduziert."""
    erst, folge = STUFEN_PUNKTE[_stufe(frage)]
    return erst if erstversuch else folge


def custom_kapitel(custom_fragen):
    """State-eigene Trainer-Fragen (quizFragen) nach Kapitel-Key gruppiert."""
    aus = {}
    for q in custom_fragen or []:
        if not q.get("id") or q.get("kapitel") is None:
            continue
        aus.setdefault(q.get("kapitel"), []).append(q)
    return aus


def index_by_id(custom_fragen):
    """Alle Fragen (statisch + eigene) als {id: frage} – für die Server-Auswertung."""
    idx = {}
    for k in KAPITEL:
        for q in k["fragen"]:
            idx[q["id"]] = q
    for q in custom_fragen or []:
        if q.get("id"):
            idx[q["id"]] = q
    return idx


def kapitel_public(custom_fragen):
    """Kapitel + Fragen für den Client – OHNE richtige Antwort (r), mit Punkten
    des Erstversuchs. Eigene Fragen werden ihrem Kapitel zugeordnet."""
    custom = custom_kapitel(custom_fragen)
    aus = []
    for k in KAPITEL:
        fragen = list(k["fragen"]) + custom.get(k["key"], [])
        aus.append({
            "key": k["key"], "titel": k["titel"],
            "fragen": [{"id": q["id"], "stufe": _stufe(q), "f": q.get("f") or "",
                        "a": q.get("a") or [], "punkte": STUFEN_PUNKTE[_stufe(q)][0]}
                       for q in fragen],
        })
    return aus
