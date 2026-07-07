import { Scenes } from 'telegraf';
import { clientScenes } from './clientScene.js';
import { masterScenes } from './masterScene.js';
import { handleAssistant, handleStart, handleSettings } from '../handlers/commands.js';
import { showClientBookings } from '../handlers/bookings.js';

export const stage = new Scenes.Stage([...clientScenes, ...masterScenes]);

stage.command('start', handleStart);
stage.command('assistant', handleAssistant);
stage.command('settings', handleSettings);
stage.command('my_bookings', showClientBookings);
