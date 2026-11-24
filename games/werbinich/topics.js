// games/werbinich/topics.js – Themen für den Themen-Würfel.
// Gesucht sind Themen, zu denen alle etwas sagen können: genug bekannte Figuren,
// aber nicht so speziell, dass nur Fans mitkommen. Jedes Thema: [Name, kurze Erklärung].

export const TOPIC_GROUPS = [
  {
    id: 'klassiker',
    name: 'Klassiker',
    topics: [
      ['Promis', 'Bekannte Menschen aus allen Bereichen'],
      ['Schauspieler:innen', 'Aus Film und Fernsehen'],
      ['Musiker:innen', 'Sänger:innen, Bandmitglieder, DJs'],
      ['Rapper:innen', 'Aus aller Welt'],
      ['Sportler:innen', 'Jede Sportart zählt'],
      ['Fußballer:innen', 'Aktiv oder Legende'],
      ['Historische Persönlichkeiten', 'Kaiser, Entdecker, Revolutionäre – schon lange tot und trotzdem berühmt'],
      ['Erfinder:innen und Forschende', 'Leute, denen wir eine Erfindung oder Entdeckung verdanken'],
      ['Comedians', 'Stand-up, Sketche, Satire'],
      ['Kontroverse Personen', 'Menschen, über die gestritten wird'],
      ['Milliardär:innen und Firmengründer:innen', 'Die Gesichter hinter großen Firmen'],
      ['Royals', 'Echte Könige, Königinnen, Prinzen und Prinzessinnen'],
      ['Staatsoberhäupter', 'Präsident:innen, Kanzler:innen, Premierminister:innen – heute oder früher'],
      ['Reality-TV-Stars', 'Dschungelcamp, Big Brother, Datingshows'],
      ['Berühmte Künstler:innen', 'Malerei, Bildhauerei, Street-Art'],
      ['Schriftsteller:innen', 'Von Klassikern bis Bestseller'],
    ],
  },
  {
    id: 'film',
    name: 'Film & Serie',
    topics: [
      ['Filmfiguren', 'Jede Figur aus einem Film'],
      ['Serienfiguren', 'Jede Figur aus einer Serie'],
      ['Disney-Figuren', 'Zeichentrick und Realfilm'],
      ['Pixar-Figuren', 'Von Spielzeug bis Monster'],
      ['Superheld:innen', 'Marvel, DC und alle anderen'],
      ['Filmbösewichte', 'Die Gegenspieler aus Filmen'],
      ['Zeichentrickfiguren', 'Cartoons aus allen Jahrzehnten'],
      ['Anime-Figuren', 'Aus Anime und Manga'],
      ['Sitcom-Figuren', 'Aus Comedy-Serien'],
      ['Harry-Potter-Figuren', 'Hogwarts und alles drumherum'],
      ['Star-Wars-Figuren', 'Jedi, Sith, Droiden und Co.'],
      ['Simpsons-Figuren', 'Ganz Springfield'],
      ['Horror-Ikonen', 'Monster, Mörder und Gestalten aus Horrorfilmen'],
      ['Märchenfiguren', 'Aus Märchen und Sagen'],
      ['Kinderserien-Figuren', 'Was ihr als Kinder geschaut habt'],
      ['Figuren aus Kinderbüchern', 'Bilderbuch bis Jugendroman'],
    ],
  },
  {
    id: 'gaming',
    name: 'Gaming',
    topics: [
      ['Videospielfiguren', 'Helden, Schurken und alle dazwischen'],
      ['Nintendo-Figuren', 'Alles, was bei Nintendo herumläuft'],
      ['Pokémon', 'Aus allen Generationen'],
      ['Videospiel-Bosse', 'Endgegner und Bösewichte aus Spielen'],
      ['League-of-Legends-Champions', 'Jeder Champion zählt'],
      ['Fighting-Game-Figuren', 'Street Fighter, Tekken, Smash Bros. und Co.'],
      ['Minecraft-Mobs', 'Alles, was in Minecraft lebt'],
      ['Sidekicks aus Spielen', 'Begleiter, Haustiere und Helfer'],
      ['Maskottchen von Spielen', 'Die Gesichter von Spielen, Studios und Konsolen'],
      ['Figuren aus Handyspielen', 'Was auf dem Smartphone gespielt wird'],
      ['Videospiele', 'Diesmal ist das Spiel selbst dein Zettel'],
    ],
  },
  {
    id: 'internet',
    name: 'Internet',
    topics: [
      ['YouTuber:innen', 'Aus aller Welt'],
      ['Twitch-Streamer:innen', 'Wer live streamt'],
      ['Influencer:innen', 'Instagram, TikTok und Co.'],
      ['TikToker:innen', 'Berühmt durch kurze Videos'],
      ['Meme-Gesichter', 'Menschen und Tiere, die zum Meme wurden'],
      ['Viral gegangen', 'Leute, die durch einen einzigen Moment berühmt wurden'],
    ],
  },
  {
    id: 'schraeg',
    name: 'Schräg & witzig',
    topics: [
      ['Berühmte Tiere', 'Echt oder ausgedacht'],
      ['Werbefiguren und Maskottchen', 'Gesichter aus Werbung und von Marken'],
      ['Figuren mit Hut', 'Der Hut muss zum Look gehören'],
      ['Bärte und Schnurrbärte', 'Alle auf den Zetteln tragen einen'],
      ['Glatzen', 'Echt oder fiktiv – Hauptsache Glatze'],
      ['Ikonische Frisuren', 'Man erkennt sie an den Haaren'],
      ['Blaue Figuren', 'Alles, was blau ist'],
      ['Fiktive Köch:innen', 'Aus Filmen, Serien und Spielen'],
      ['Fiktive Lehrer:innen', 'Von streng bis magisch'],
      ['Fiktive Ärzt:innen', 'Aus Serien, Filmen und Spielen'],
      ['Roboter und KIs', 'Echt oder ausgedacht'],
      ['Geister, Monster und Untote', 'Alles, was nachts herumschleicht'],
      ['Hexen, Zauberer und Magier', 'Fiktiv oder echt'],
      ['Piraten', 'Fiktiv oder echt'],
      ['Detektive', 'Fiktiv oder echt'],
      ['Götter und Sagengestalten', 'Aus allen Mythologien'],
      ['Feiertagsfiguren', 'Weihnachtsmann, Osterhase und ihre Kolleg:innen'],
      ['Hälfte eines Duos', 'Berühmte Paare – nur eine Hälfte kommt auf den Zettel'],
      ['Prinzessinnen und Prinzen', 'Aus Märchen, Filmen und Spielen'],
      ['Spielzeugfiguren', 'Puppen, Actionfiguren, Kuscheltiere mit Namen'],
      ['Kindheitshelden', 'Wen fandet ihr als Kind richtig cool?'],
      ['Figuren, die kaum sprechen', 'Stille Held:innen und wortkarge Wesen'],
    ],
  },
  {
    id: 'dinge',
    name: 'Was bin ich? (Dinge)',
    topics: [
      ['Tiere', 'Jede Tierart'],
      ['Gerichte', 'Was auf den Teller kommt'],
      ['Süßigkeiten und Snacks', 'Marken oder Sorten'],
      ['Getränke', 'Mit und ohne Alkohol'],
      ['Obst und Gemüse', 'Alles aus Garten und Feld'],
      ['Berufe', 'Was Menschen arbeiten'],
      ['Dinge im Haushalt', 'Was man zu Hause findet'],
      ['Länder', 'Aus aller Welt'],
      ['Städte', 'Aus aller Welt'],
      ['Sehenswürdigkeiten', 'Bauwerke und Orte, die man kennt'],
      ['Marken', 'Firmen und ihre Produkte'],
      ['Fahrzeuge', 'Zu Land, zu Wasser, in der Luft'],
      ['Sportarten', 'Auch die ungewöhnlichen'],
      ['Musikinstrumente', 'Vom Triangel bis zur Orgel'],
      ['Emojis', 'Was man so verschickt'],
      ['Apps und Websites', 'Was auf dem Handy und im Browser läuft'],
      ['Brett- und Kartenspiele', 'Klassiker und Partyspiele'],
      ['Superkräfte', 'Welche Kraft hast du?'],
      ['Hobbys', 'Was man in der Freizeit macht'],
      ['Kleidungsstücke', 'Vom Kopf bis zu den Füßen'],
      ['Filme', 'Diesmal ist der Film selbst dein Zettel'],
      ['Serien', 'Diesmal ist die Serie selbst dein Zettel'],
      ['Feiertage und Feste', 'Aus aller Welt'],
    ],
  },
  {
    id: 'deutsch',
    name: 'Deutschland',
    topics: [
      ['Deutsche Promis', 'Bekannt aus Deutschland'],
      ['Deutsche YouTuber:innen und Streamer:innen', 'Deutschsprachiges Internet'],
      ['Deutsche Rapper:innen', 'Deutschrap aller Jahrzehnte'],
      ['Deutsche Fußballer:innen', 'Nationalmannschaft und Bundesliga'],
      ['Deutsche Comedians', 'Bühne, TV und Internet'],
      ['Schlagerstars', 'Zum Mitsingen'],
      ['TV-Moderator:innen', 'Shows, Nachrichten, Sport'],
      ['Figuren aus dem deutschen Kinderfernsehen', 'Was im Kinderprogramm lief'],
      ['Deutsche Politiker:innen', 'Heute oder früher'],
      ['Figuren aus deutschen Filmen und Serien', 'Kino, TV und Streaming'],
    ],
  },
];

// ---------- Aktuelle Liste: eigene aus der Datenbank oder die eingebaute ----------

export const CATALOG_LIMITS = { groups: 30, topics: 200, name: 60, hint: 120, groupName: 40 };

const clean = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Eingebaute Liste in der Form, die auch gespeichert wird. */
export const DEFAULT_CATALOG = TOPIC_GROUPS.map((g) => ({ id: g.id, name: g.name, topics: g.topics.map(([name, hint]) => ({ name, hint })) }));

/** Bringt eine Liste (z. B. aus der Datenbank) in eine sichere Form. Gibt null zurück, wenn nichts Brauchbares drin ist. */
export function normalizeCatalog(raw) {
  let data = raw;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  const groups = data && Array.isArray(data.groups) ? data.groups : null;
  if (!groups) return null;
  const used = new Set();
  const out = [];
  groups.slice(0, CATALOG_LIMITS.groups).forEach((g, i) => {
    if (!g || typeof g !== 'object') return;
    const name = clean(g.name, CATALOG_LIMITS.groupName) || `Bereich ${i + 1}`;
    let id = String(g.id || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30) || 'b' + i;
    while (used.has(id)) id += 'x';
    used.add(id);
    const seen = new Set();
    const topics = (Array.isArray(g.topics) ? g.topics : [])
      .map((t) => (Array.isArray(t) ? { name: t[0], hint: t[1] } : t))
      .filter((t) => t && typeof t === 'object')
      .map((t) => ({ name: clean(t.name, CATALOG_LIMITS.name), hint: clean(t.hint, CATALOG_LIMITS.hint) }))
      .filter((t) => t.name && !seen.has(t.name.toLowerCase()) && seen.add(t.name.toLowerCase()))
      .slice(0, CATALOG_LIMITS.topics);
    out.push({ id, name, topics });
  });
  return out.length ? out : null;
}

let current = null;

/** Eigene Liste setzen (null = eingebaute Liste). */
export function setCatalog(raw) {
  current = raw ? normalizeCatalog(raw) : null;
}

export const catalog = () => current || DEFAULT_CATALOG;
export const isCustomCatalog = () => !!current;

export const allTopics = () => catalog().flatMap((g) => g.topics.map((t) => ({ name: t.name, hint: t.hint, group: g.id })));

/** Ein zufälliges Thema aus den gewählten Bereichen; die zuletzt gezogenen (und `avoid`) kommen nicht gleich wieder. */
export function rollTopic(groups, recent = [], rng = Math.random, avoid = []) {
  const all = allTopics();
  const pool = all.filter((t) => !groups || !groups.length || groups.includes(t.group));
  const base = pool.length ? pool : all;
  if (!base.length) return null;
  const skip = new Set([...recent, ...avoid]);
  const fresh = base.filter((t) => !skip.has(t.name));
  const fresher = fresh.length ? fresh : base.filter((t) => !avoid.includes(t.name));
  const from = fresher.length ? fresher : base;
  return from[Math.floor(rng() * from.length)];
}

export const topicByName = (name) => {
  const n = String(name || '').trim().toLowerCase();
  return (n && allTopics().find((t) => t.name.toLowerCase() === n)) || null;
};
