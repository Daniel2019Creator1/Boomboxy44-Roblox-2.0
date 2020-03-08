import { importFilesUnderPath } from 'roblox-es6-migration-helper';

import pubSub from './lib/pubSub';
import kingmaker from './lib/kingmaker';

window.Roblox = window.Roblox || {};
window.Roblox.CrossTabCommunication = {
  PubSub: pubSub.default,
  Kingmaker: kingmaker.default
};
