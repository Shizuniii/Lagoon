// core/backend.js – alles, was mit Firebase redet.
// Plattform und Spiele sprechen nur über diese Klasse mit dem Server.

import {
  initializeApp,
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  signInAnonymously,
  getDatabase,
  ref,
  onValue,
  get,
  set,
  update,
  remove,
  runTransaction,
  onDisconnect,
  serverTimestamp,
} from '../vendor/firebase.js';

export function isConfigured(cfg) {
  if (!cfg) return false;
  const needed = ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'appId'];
  return needed.every((k) => typeof cfg[k] === 'string' && cfg[k] && !/DEINE?[_-]/.test(cfg[k]));
}

export function isPermissionError(err) {
  const text = String((err && (err.code || '')) + ' ' + (err && (err.message || ''))).toLowerCase();
  return text.includes('permission');
}

const strip = (value) => (value === undefined ? null : JSON.parse(JSON.stringify(value)));
const median = (list) => {
  const s = list.slice().sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

export class Backend {
  constructor(config) {
    this.config = config;
    this.uid = null;
    this.offset = 0;
    this.rtt = null;
    this._rtts = [];
    this._presence = null;
    this._pingTimer = null;
  }

  /** Anmelden (anonym, ohne Konto). Die Kennung bleibt auf dem Gerät gespeichert. */
  async start() {
    this.app = initializeApp(this.config);
    this.auth = initializeAuth(this.app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
    this.db = getDatabase(this.app);
    await this.auth.authStateReady();
    const user = this.auth.currentUser || (await signInAnonymously(this.auth)).user;
    this.uid = user.uid;
    onValue(ref(this.db, '.info/serverTimeOffset'), (snap) => {
      this.offset = Number(snap.val()) || 0;
    });
    return this.uid;
  }

  /** Serverzeit in Millisekunden – damit alle Geräte gleich zählen. */
  now() {
    return Date.now() + this.offset;
  }

  onConnection(cb) {
    return onValue(ref(this.db, '.info/connected'), (snap) => cb(snap.val() === true));
  }

  watch(path, cb, onError) {
    return onValue(
      ref(this.db, path),
      (snap) => cb(snap.val()),
      (err) => onError && onError(err)
    );
  }

  async read(path) {
    const snap = await get(ref(this.db, path));
    return snap.val();
  }

  write(path, value) {
    return set(ref(this.db, path), strip(value));
  }

  patch(path, values) {
    return update(ref(this.db, path), strip(values));
  }

  // ---------- Gruppe ----------

  async groupOwner() {
    return this.read('config/owner');
  }

  /** Eigener Mitglieds-Eintrag oder null, wenn man (noch) nicht in der Gruppe ist. */
  async myMembership() {
    try {
      return await this.read(`members/${this.uid}`);
    } catch (err) {
      if (isPermissionError(err)) return null;
      throw err;
    }
  }

  async setupGroup(code, name) {
    try {
      await set(ref(this.db, 'config'), { code, owner: this.uid });
    } catch (err) {
      if (isPermissionError(err)) throw Object.assign(new Error('Gruppe existiert schon'), { kind: 'exists' });
      throw err;
    }
    await this.joinGroup(code, name);
  }

  async joinGroup(code, name) {
    try {
      await set(ref(this.db, `joins/${this.uid}`), code);
    } catch (err) {
      if (isPermissionError(err)) throw Object.assign(new Error('Falscher Code'), { kind: 'wrong-code' });
      throw err;
    }
    await set(ref(this.db, `members/${this.uid}`), { name, joinedAt: serverTimestamp() });
  }

  async rename(name) {
    await update(ref(this.db, `members/${this.uid}`), { name });
  }

  async leaveGroup() {
    this.stopPresence();
    await remove(ref(this.db, `status/${this.uid}`)).catch(() => {});
    await remove(ref(this.db, `joins/${this.uid}`)).catch(() => {});
    await remove(ref(this.db, `members/${this.uid}`));
  }

  async getCode() {
    return this.read('config/code');
  }

  async changeCode(code) {
    await set(ref(this.db, 'config/code'), code);
    await set(ref(this.db, `joins/${this.uid}`), code);
  }

  async removeMember(uid) {
    await remove(ref(this.db, `members/${uid}`));
  }

  // ---------- Online-Status & Ping ----------

  /**
   * Jedes offene App-Fenster trägt sich unter status/<uid>/conns/<id> ein und verschwindet
   * beim Trennen von selbst. Online = mindestens ein Eintrag.
   * Dazu misst die App alle 10 Sekunden, wie lange ein Schreibvorgang zum Server und zurück
   * dauert (Ping), und veröffentlicht den Median. Das Quiz nutzt ihn für den Buzzer-Ausgleich.
   */
  startPresence() {
    if (this._presence) return;
    const connId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const mine = ref(this.db, `status/${this.uid}/conns/${connId}`);
    const seen = ref(this.db, `status/${this.uid}/lastSeen`);
    this._conn = mine;
    this._presence = onValue(ref(this.db, '.info/connected'), async (snap) => {
      if (snap.val() !== true) return;
      try {
        await onDisconnect(mine).remove();
        await onDisconnect(seen).set(serverTimestamp());
        await set(mine, true);
        await set(seen, serverTimestamp());
        this.measurePing();
      } catch (err) {
        console.warn('Online-Status konnte nicht gesetzt werden', err);
      }
    });
    this._pingTimer = setInterval(() => this.measurePing(), 10000);
  }

  async measurePing() {
    if (this._measuring) return;
    this._measuring = true;
    try {
      const t0 = performance.now();
      await set(ref(this.db, `status/${this.uid}/ping`), serverTimestamp());
      const rtt = Math.round(performance.now() - t0);
      this._rtts.push(rtt);
      if (this._rtts.length > 5) this._rtts.shift();
      this.rtt = median(this._rtts);
      await set(ref(this.db, `status/${this.uid}/rtt`), this.rtt);
    } catch {
      /* offline – nächster Versuch in 10 s */
    } finally {
      this._measuring = false;
    }
  }

  stopPresence() {
    if (this._presence) {
      this._presence();
      this._presence = null;
    }
    clearInterval(this._pingTimer);
    if (this._conn) {
      remove(this._conn).catch(() => {});
      this._conn = null;
    }
  }

  // ---------- Räume ----------

  /**
   * Ändert einen Raum atomar: fn bekommt den aktuellen Stand und gibt den neuen zurück.
   * Tippen mehrere Leute gleichzeitig, wiederholt Firebase die Funktion mit dem frischen Stand.
   */
  async roomTx(roomId, fn) {
    const result = await runTransaction(ref(this.db, `rooms/${roomId}`), (current) => {
      const next = fn(current);
      if (next === current && current !== null) return undefined; // nichts zu tun
      return strip(next);
    });
    return { committed: result.committed, value: result.snapshot ? result.snapshot.val() : null };
  }

  async deleteRoom(roomId) {
    await remove(ref(this.db, `rooms/${roomId}`));
    await remove(ref(this.db, `inputs/${roomId}`)).catch(() => {});
    await remove(ref(this.db, `secrets/${roomId}`)).catch(() => {});
    await remove(ref(this.db, `media/${roomId}`)).catch(() => {});
  }

  // ---------- Eingaben (Quiz: Buzzer, Antworten, Auswahl) ----------

  sendInput(roomId, kind, data) {
    return set(ref(this.db, `inputs/${roomId}/${this.uid}/${kind}`), { ...strip(data), at: serverTimestamp() });
  }

  // ---------- Geheime Zettel (Wer bin ich) ----------

  async writeCharacter(roomId, rid, target, data) {
    await set(ref(this.db, `secrets/${roomId}/${rid}/${target}`), { ...data, by: this.uid, at: serverTimestamp() });
  }

  watchCharacter(roomId, rid, uid, cb, onError) {
    return this.watch(`secrets/${roomId}/${rid}/${uid}`, cb, onError);
  }

  async clearCharacters(roomId, rid) {
    if (!roomId || !rid) return;
    await remove(ref(this.db, `secrets/${roomId}/${rid}`)).catch((err) => console.warn('Aufräumen fehlgeschlagen', err));
  }
}
