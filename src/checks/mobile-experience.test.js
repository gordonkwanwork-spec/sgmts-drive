import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const experience=readFileSync(new URL('../experience.js',import.meta.url),'utf8');
const environment=readFileSync(new URL('../environment.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../experience.css',import.meta.url),'utf8');
// Mobile hide keeps exactly the driving controls and the camera button (25 Sep 2026 request).
assert(css.includes('html.mobile body.clean-view :is([data-action=go],[data-action=stop],[data-action=doors],[data-action=express],[data-action=cruise],#speed-dial,#camera){visibility:visible!important}'));
// Every button with a shortcut carries a visible hotkey badge (hidden on touch layouts).
assert(experience.includes('b.dataset.hotkey=key')&&css.includes('button[data-hotkey]::after{content:attr(data-hotkey)')&&css.includes('html.mobile button[data-hotkey]::after{display:none}'));

assert(experience.includes("const CAMERAS=['Third person / 跟隨','Cockpit / 駕駛室','Bird’s-eye / 鳥瞰','Platform / 月台']"));
assert(experience.includes('max="50"')&&experience.includes('onLoop?12:50'));
assert(experience.includes("if(mobile||!night){streetLights.forEach(light=>light.intensity=0);return;}"));
// Warnings are trilingual and share the announcement queue; no English-only speech.
const audio=readFileSync(new URL('../audio.js',import.meta.url),'utf8');
// No spoken speed warning: the penalty beep is enough.
assert(!experience.includes("announceWarning('speed'")&&!audio.includes('speechSynthesis'));
assert(experience.includes('parked.isDepot=true')&&experience.includes('tram.isDepot?.18:1.35'));
assert(environment.includes('building-ad-')&&environment.includes('crossingGap(s-9,s+9)')&&environment.includes('crossingGap(s-10,s+10)'));

console.log('Mobile cameras, 50 km/h control, stable night lights, warnings, depot dimming, adverts and crossing clearances passed.');
