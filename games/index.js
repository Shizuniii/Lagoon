// games/index.js – hier melden sich alle Spiele an.
// Ein neues Spiel = ein Ordner unter games/ mit einer game.js, die hier eingetragen wird.
import werbinich from './werbinich/game.js';
import quiz from './quiz/game.js';

export const GAMES = [werbinich, quiz];
export const gameById = (id) => GAMES.find((g) => g.id === id) || null;
