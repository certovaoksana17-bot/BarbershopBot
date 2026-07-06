import { Scenes } from 'telegraf';
import { clientScenes } from './clientScene.js';
import { masterScenes } from './masterScene.js';
import { handleStart, handleSettings } from '../handlers/commands.js';

export const stage = new Scenes.Stage([...clientScenes, ...masterScenes]);

// Commands must work during active booking scenes (not only outside scenes).
stage.command('start', handleStart);
stage.command('settings', handleSettings);
