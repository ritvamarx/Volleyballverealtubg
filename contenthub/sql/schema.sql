-- Content-Hub – Datenmodell (Datenbank "contenthub")
-- Redaktionelle Wahrheit des Systems: Themen, Fakten, Pakete, Beiträge,
-- Veröffentlichungen, Metriken, Medien, Learnings. n8n schreibt in jedem
-- Schritt hierher; NocoDB (Stufe 2) zeigt diese Tabellen als Board.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE themen_status AS ENUM (
  'idee', 'recherche', 'produktion', 'freigabe', 'geplant', 'veroeffentlicht', 'ausgewertet', 'verworfen'
);
CREATE TYPE beitrag_typ AS ENUM (
  'reel', 'carousel', 'story', 'post', 'artikel', 'newsletter', 'faq', 'app_meldung'
);
CREATE TYPE beitrag_status AS ENUM (
  'entwurf', 'geprueft', 'wartet_freigabe', 'freigegeben', 'aenderung', 'abgelehnt'
);
CREATE TYPE kanal AS ENUM (
  'instagram', 'facebook', 'website', 'newsletter', 'app', 'youtube', 'linkedin', 'mastodon', 'bluesky'
);
CREATE TYPE einwilligung AS ENUM ('ja', 'nein', 'unbekannt', 'nicht_noetig');

-- ---------------------------------------------------------------- Mandanten
CREATE TABLE mandanten (
  id            text PRIMARY KEY,                 -- z. B. 'werkhaus', 'spd-waren'
  name          text NOT NULL,
  typ           text NOT NULL,                    -- verein | initiative | partei | unternehmen | person
  profil        jsonb NOT NULL,                   -- komplette YAML als JSON (Design, Ton, Säulen, Regeln, Kanäle)
  learnings     text NOT NULL DEFAULT '',         -- vom Analyse-Schritt gepflegt, fließt in jeden Prompt
  aktiv         boolean NOT NULL DEFAULT true,
  aktualisiert  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- Themenboard
CREATE TABLE themen (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_id    text NOT NULL REFERENCES mandanten(id),
  titel         text NOT NULL,
  status        themen_status NOT NULL DEFAULT 'idee',
  relevanz      smallint CHECK (relevanz BETWEEN 1 AND 5),
  anlass        text,                             -- 'termin_in_5_tagen' | 'ergebnis_neu' | 'briefing' | 'rss' | …
  begruendung   text,                             -- "warum relevant" (Themen-Agent)
  quelle_ref    jsonb,                            -- Feed-Item, RSS-URL, Upload-Pfade, Briefing
  briefing      jsonb,                            -- Felder aus contenthub/briefing.md
  deadline      date,
  erstellt      timestamptz NOT NULL DEFAULT now(),
  aktualisiert  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX themen_mandant_status ON themen (mandant_id, status);

-- ---------------------------------------------------------------- Faktenblatt
CREATE TABLE faktenblaetter (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thema_id          uuid NOT NULL REFERENCES themen(id) ON DELETE CASCADE,
  fakten            jsonb NOT NULL,               -- [{aussage, quelle_nr, datum}]
  quellen           jsonb NOT NULL,               -- [{nr, titel, url, abgerufen, art}]
  offene_fragen     jsonb NOT NULL DEFAULT '[]',
  nicht_verifiziert jsonb NOT NULL DEFAULT '[]',
  version           int NOT NULL DEFAULT 1,
  erstellt          timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- Content-Paket (Redaktion)
CREATE TABLE content_pakete (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thema_id      uuid NOT NULL REFERENCES themen(id) ON DELETE CASCADE,
  kernbotschaft text NOT NULL,
  serie         jsonb NOT NULL,                   -- geplante Formate mit Arbeitstitel und Reihenfolge
  risiken       jsonb NOT NULL DEFAULT '[]',
  erstellt      timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- Beiträge (je Format)
CREATE TABLE beitraege (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paket_id        uuid NOT NULL REFERENCES content_pakete(id) ON DELETE CASCADE,
  thema_id        uuid NOT NULL REFERENCES themen(id) ON DELETE CASCADE,
  mandant_id      text NOT NULL REFERENCES mandanten(id),
  typ             beitrag_typ NOT NULL,
  inhalt          jsonb NOT NULL,                 -- Schema je Typ, siehe prompts/04*.md
  medien_ids      uuid[] NOT NULL DEFAULT '{}',
  pruefbericht    jsonb,                          -- Ausgabe des Qualitäts-Schritts
  status          beitrag_status NOT NULL DEFAULT 'entwurf',
  freigegeben_von text,
  freigegeben_am  timestamptz,
  aenderungswunsch text,
  version         int NOT NULL DEFAULT 1,
  erstellt        timestamptz NOT NULL DEFAULT now(),
  aktualisiert    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX beitraege_status ON beitraege (mandant_id, status);

-- ---------------------------------------------------------------- Veröffentlichungen (Kalender)
CREATE TABLE veroeffentlichungen (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beitrag_id      uuid NOT NULL REFERENCES beitraege(id) ON DELETE CASCADE,
  mandant_id      text NOT NULL REFERENCES mandanten(id),
  kanal           kanal NOT NULL,
  geplant_fuer    timestamptz,
  veroeffentlicht timestamptz,
  kanal_text      text,                           -- endgültiger, kanalangepasster Text
  kanal_id        text,                           -- Post-ID / Media-ID / Artikel-ID
  url             text,
  fehler          text,
  versuche        smallint NOT NULL DEFAULT 0
);
CREATE INDEX veroeff_plan ON veroeffentlichungen (geplant_fuer) WHERE veroeffentlicht IS NULL;

-- ---------------------------------------------------------------- Metriken
CREATE TABLE metriken (
  id                  bigserial PRIMARY KEY,
  veroeffentlichung_id uuid NOT NULL REFERENCES veroeffentlichungen(id) ON DELETE CASCADE,
  erhoben             timestamptz NOT NULL DEFAULT now(),
  werte               jsonb NOT NULL              -- {reichweite, interaktionen, speicherungen, klicks, …}
);

-- ---------------------------------------------------------------- Medienarchiv
CREATE TABLE medien (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_id    text NOT NULL REFERENCES mandanten(id),
  datei         text NOT NULL,                    -- relativ zu data/media
  art           text NOT NULL,                    -- foto | grafik | video | logo | ki_bild
  alt_text      text,
  motiv         text[],                           -- Schlagworte (Vision-Modell, Stufe 5)
  personen_erkennbar boolean,
  einwilligung  einwilligung NOT NULL DEFAULT 'unbekannt',
  urheber       text,
  ki_generiert  boolean NOT NULL DEFAULT false,   -- → Kennzeichnungspflicht
  aufgenommen   date,
  erstellt      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX medien_mandant ON medien (mandant_id, einwilligung);

-- ---------------------------------------------------------------- Learnings (Analyse)
CREATE TABLE learnings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_id    text NOT NULL REFERENCES mandanten(id),
  datum         date NOT NULL DEFAULT current_date,
  text          text NOT NULL,
  beleg         jsonb,                            -- Beiträge/Zahlen, aus denen es folgt
  bestaetigt    boolean NOT NULL DEFAULT false    -- erst nach Bestätigung im Board → ins Profil
);

-- ---------------------------------------------------------------- Feed-Sichtung (Stufe 3)
-- Merkt sich, welche Items der Vereins-App-Feeds schon gesehen wurden.
CREATE TABLE feed_items (
  container     text NOT NULL,                    -- z. B. 'werkhaus-app'
  item_id       text NOT NULL,
  updated_at    timestamptz NOT NULL,
  thema_id      uuid REFERENCES themen(id),
  gesehen       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (container, item_id)
);

-- Schutz: Publishing nur mit Freigabe (wird zusätzlich im Workflow geprüft).
CREATE OR REPLACE FUNCTION pruefe_freigabe() RETURNS trigger AS $$
BEGIN
  IF NEW.veroeffentlicht IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM beitraege b WHERE b.id = NEW.beitrag_id AND b.status = 'freigegeben') THEN
      RAISE EXCEPTION 'Veröffentlichung ohne Freigabe: Beitrag % ist nicht freigegeben', NEW.beitrag_id;
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER veroeff_nur_mit_freigabe
  BEFORE INSERT OR UPDATE ON veroeffentlichungen
  FOR EACH ROW EXECUTE FUNCTION pruefe_freigabe();
