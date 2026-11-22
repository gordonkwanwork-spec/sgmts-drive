import {MUSIC_TRACKS, RADIO_STATIONS, musicChoice, stationById, tuneRadio} from '../music-catalog.js';

const logo = id => import.meta.env.BASE_URL + 'branding/radio/' + id + '.webp';
const tracks = new Map(MUSIC_TRACKS.map(track => [track.id, track]));

export function createCarRadio(hud, state, play) {
  const radio = document.createElement('details');
  radio.id = 'car-radio';
  radio.innerHTML = `<summary id="radio-toggle" aria-label="Radio · 收音機" aria-describedby="radio-station-name radio-song-title">
    <img alt="" hidden><span class="car-radio-info"><b>RADIO · 收音機</b><strong id="radio-station-name"></strong><span id="radio-song-title" aria-live="polite"></span></span><i aria-hidden="true">▾</i>
    </summary><div class="car-radio-controls">
    <div class="car-radio-presets" role="group" aria-label="Radio stations"></div>
    <div class="car-radio-actions"><button data-mode="auto">Auto</button><button data-mode="off">Off</button>
    <button data-skip="-1" aria-label="Previous song" title="Previous song · Shift+,">◀</button><button data-skip="1" aria-label="Next song" title="Next song · ,">▶</button></div></div>`;
  hud.append(radio);
  const image = radio.querySelector('summary img'), name = radio.querySelector('strong');
  const song = radio.querySelector('.car-radio-info > span'), presets = radio.querySelector('.car-radio-presets');
  for (const station of RADIO_STATIONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.station = station.id;
    button.title = station.name;
    button.setAttribute('aria-label', station.name);
    button.innerHTML = `<img src="${logo(station.id)}" alt="">`;
    presets.append(button);
  }
  const buttons = [...radio.querySelectorAll('button')];
  function change(selection) {
    Object.assign(state, selection);
    play();
    refresh();
  }
  function step(control, direction) {
    change(tuneRadio(state, control, direction));
  }
  let lastTrack, lastChoice, lastMuted;
  function refresh() {
    const host = state.mode === 'control' ? document.querySelector('.occ-top') :
      state.avatar === 'car' || document.body.dataset.town === 'on' ? document.querySelector('#town-bar') : hud;
    if (host && radio.parentNode !== host) {
      radio.open = false;
      host.prepend(radio);
    }
    const {id} = musicChoice(state), choice = state.gameMusic;
    if (id === lastTrack && choice === lastChoice && state.muted === lastMuted) return;
    lastTrack = id; lastChoice = choice; lastMuted = state.muted;
    const track = tracks.get(id), station = stationById.get(choice) || stationById.get(track?.category);
    image.hidden = !station;
    if (station) image.src = logo(station.id);
    else image.removeAttribute('src');
    name.textContent = station?.name || (choice === 'off' ? 'Radio off · 已關閉' : 'Automatic · 自動');
    song.textContent = state.muted ? 'Sound muted · 靜音' : track?.title || 'Choose a station · 選擇電台';
    for (const b of buttons) {
      if (b.dataset.skip === undefined) b.setAttribute('aria-pressed', String((b.dataset.station ?? b.dataset.mode) === choice));
    }
  }
  radio.addEventListener('click', e => {
    const button = e.target.closest('button');
    if (!button) return;
    if (button.dataset.skip) step('song', Number(button.dataset.skip));
    else change({gameMusic: button.dataset.station ?? button.dataset.mode, radioTrack: null});
  });
  radio.addEventListener('mousedown', e => e.preventDefault());
  document.addEventListener('pointerdown', e => { if (radio.open && !radio.contains(e.target)) radio.open = false; });
  return {step, refresh, close() { radio.open = false; }};
}
