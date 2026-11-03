<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { advance, aim, create, drop, heldX, jiggle, JAR, markJiggle, snapshot, SPAWN_TIERS, type Game, type Merge } from "./lib/engine/game.ts";
  import { askMotion, shaker } from "./lib/shake.ts";
  import { icon, preview, render, theme, VIEW, MARGIN, BURST_LIFE, type Burst, type Theme } from "./lib/draw.ts";
  import { faces as makeFaces } from "./lib/faces.ts";
  import { SKINS, skinById } from "./lib/skins/index.ts";
  import { dims, type Skin } from "./lib/skins/types.ts";
  import { readSlot, writeSlot } from "./lib/storage.ts";
  import { readSize, sizeLabel, sizeWord, snapSize, SIZE_MAX, SIZE_MIN, SIZE_STEP } from "./lib/sizes.ts";
  import { readSpeed, snapSpeed, speedLabel, speedWord, SPEED_MAX, SPEED_MIN, SPEED_STEP } from "./lib/speeds.ts";
  import { bestAt, parseBests, withBest, type Bests } from "./lib/best.ts";
  import { sample } from "./lib/sample.ts";
  import { installControl } from "./install.ts";
  import { updateControl, type UpdateCheck } from "./pwa.ts";
  import { createSound } from "./lib/sound.ts";
  // the drawn name: chunky outlined letters and tiny bubbles growing into the two o's.
  // shapes only, no font; a light halo under the ink keeps it reading on a dark card
  import wordmark from "./lib/wordmark.svg?raw";

  const ETHOS =
    "no ads, no lives, no timers, nothing to buy, no accounts, no cookies, nothing sold or shared.";
  // the look: saved, restored on reload. sizes differ per look, so a change
  // mid-game waits for the next game; an empty or finished jar switches at once.
  const LOOK = "bloop:look";
  const firstSkin = skinById(readSlot(LOOK));
  // raw: a look is fixed data, compared by identity, never a reactive copy
  let skin = $state.raw<Skin>(firstSkin);
  let pending = $state.raw<Skin | null>(null);
  const tiers = $derived(skin.tiers);
  const faces = makeFaces();
  // the piece size and the speed: a number each, off a slider, for every look.
  // like a look, a change mid-game waits for the next game, and the pick is saved.
  // an old size name (small, medium, big) reads as the size it was.
  const SIZE = "bloop:size";
  const SPEED = "bloop:speed";
  const firstSize = readSize(readSlot(SIZE));
  const firstSpeed = readSpeed(readSlot(SPEED));
  let size = $state(firstSize);
  let pendingSize = $state<number | null>(null);
  let speed = $state(firstSpeed);
  let pendingSpeed = $state<number | null>(null);
  // where the sliders sit while a finger is on them: the picture follows at once,
  // the pick is made when the finger lets go
  let sizeDrag = $state(firstSize);
  let speedDrag = $state(firstSpeed);

  // ?seed=123 plays that exact deal every game, so a run can be shared and replayed
  const q = new URLSearchParams(location.search);
  const fixedSeed = /^\d{1,9}$/.test(q.get("seed") ?? "") ? Number(q.get("seed")) : null;
  const freshSeed = () => fixedSeed ?? crypto.getRandomValues(new Uint32Array(1))[0];

  // a best per size and speed, each with whether jiggle was on for it, all one
  // record written in one go, so a failed write can never keep a score and lose
  // its mark. older saves move to the settings they were played at (best.ts).
  const BEST = "bloop:best";
  let bests = $state.raw<Bests>(parseBests(readSlot(BEST), () => readSlot("bloop:best-jiggled") === "1"));
  const best = $derived(bestAt(bests, size, speed).score);
  const bestJiggled = $derived(bestAt(bests, size, speed).jiggled);
  /** how a size and speed read, short, in the hud, the card and the about sheet */
  const settingsLine = (z: number, v: number) => `size ${sizeLabel(z)} · speed ${speedLabel(v)}`;
  let saved = $state(true);
  // jiggle: off by default, a fun extra. a run played with it on is marked, and
  // so is a best made in one, so everyone can see it was jiggled.
  const JIGGLE = "bloop:jiggle";
  const jiggleSaved = readSlot(JIGGLE) === "1";
  let jiggleOn = $state(jiggleSaved);
  let jiggleNote = $state("");
  let jiggled = $state(jiggleSaved);
  // sound: on unless someone turned it off. it starts on the first tap or key
  const SOUND = "bloop:sound";
  const soundSaved = readSlot(SOUND) !== "off";
  let soundOn = $state(soundSaved);
  const sfx = createSound(soundSaved);
  function toggleSound() {
    soundOn = !soundOn;
    writeSlot(SOUND, soundOn ? "on" : "off");
    sfx.setSound(soundOn);
  }

  let game: Game = create(freshSeed(), dims(firstSkin, firstSize), firstSpeed);
  // the sizes this game was made with, for the preview
  let radii = $state.raw(game.radii);
  if (jiggleSaved) markJiggle(game);
  // the game mutates in place; these are what the screen watches
  let score = $state(0);
  let over = $state(false);
  let danger = $state(false);
  let next = $state(game.next);
  let flair = $state("");
  let flairKey = $state(0);
  let sheet = $state<"" | "about" | "ios" | "restart" | "looks" | "settings">("");

  let jarEl = $state<HTMLCanvasElement>();
  let nextEl = $state<HTMLCanvasElement>();
  let surfaceEl = $state<HTMLDivElement>();
  let dialog = $state<HTMLDialogElement>();
  $effect(() => {
    if (dialog && !dialog.open) dialog.showModal();
  });

  // a read-only window onto the game, for tests and the curious
  (window as unknown as { __bloop: unknown }).__bloop = {
    state: () => snapshot(game),
    look: () => ({ now: skin.id, next: pending?.id ?? null }),
    size: () => ({ now: size, next: pendingSize }),
    speed: () => ({ now: speed, next: pendingSpeed }),
    faces: () => faces.report(game),
    sound: () => sfx.report(),
  };

  function sync() {
    if (score !== game.score) {
      score = game.score;
      if (score > best) {
        // this game was made at the size and speed on screen: they change only between games
        bests = withBest(bests, size, speed, { score, jiggled: game.jiggled });
        saved = writeSlot(BEST, JSON.stringify(bests));
      }
    }
    jiggled = game.jiggled;
    over = game.over;
    danger = game.danger > 0 && !game.over;
    next = game.next;
  }

  let bursts: Burst[] = [];
  let flairTimer: ReturnType<typeof setTimeout>;
  function celebrate(m: Merge, now: number) {
    const t = tiers[m.tier];
    bursts.push({ x: m.x, y: m.y, r: game.radii[m.tier], colour: t.colour, at: now });
    let line = "";
    if (m.vanish) line = `two ${t.name}s! bloop! +${m.points}`;
    else if (m.first && m.tier >= SPAWN_TIERS) line = `nice! ${t.name} made!`;
    if (line) {
      flair = line;
      flairKey++;
      clearTimeout(flairTimer);
      flairTimer = setTimeout(() => (flair = ""), 1800);
    }
  }

  // a game underway asks first, the world holds still while it asks. an empty
  // jar or a finished one starts over in one tap.
  function askRestart() {
    if (game.drops > 0 && !game.over) sheet = "restart";
    else restart();
  }

  function restart() {
    if (pending) {
      skin = pending;
      pending = null;
    }
    if (pendingSize !== null) {
      size = pendingSize;
      pendingSize = null;
    }
    if (pendingSpeed !== null) {
      speed = pendingSpeed;
      pendingSpeed = null;
    }
    game = create(freshSeed(), dims(skin, size), speed);
    radii = game.radii;
    if (jiggleOn) markJiggle(game);
    faces.reset();
    bursts = [];
    flair = "";
    pointer = null;
    sync();
  }

  /** pick a look: now if the jar is empty or finished, otherwise with the next game */
  function pickLook(s: Skin) {
    writeSlot(LOOK, s.id);
    if (game.drops === 0 || game.over) {
      skin = s;
      pending = null;
      restart();
    } else pending = s === skin ? null : s;
  }

  /** pick a piece size: now if the jar is empty or finished, otherwise with the next game */
  function pickSize(v: number) {
    const s = snapSize(v);
    sizeDrag = s;
    writeSlot(SIZE, sizeLabel(s));
    if (game.drops === 0 || game.over) {
      size = s;
      pendingSize = null;
      restart();
    } else pendingSize = s === size ? null : s;
  }

  /** pick a speed: now if the jar is empty or finished, otherwise with the next game */
  function pickSpeed(v: number) {
    const s = snapSpeed(v);
    speedDrag = s;
    writeSlot(SPEED, speedLabel(s));
    if (game.drops === 0 || game.over) {
      speed = s;
      pendingSpeed = null;
      restart();
    } else pendingSpeed = s === speed ? null : s;
  }

  function openSettings() {
    sizeDrag = pendingSize ?? size;
    speedDrag = pendingSpeed ?? speed;
    sheet = "settings";
  }
  // the size slider's picture, redrawn as the slider moves
  let sampleEl = $state<HTMLCanvasElement>();
  $effect(() => {
    if (!sampleEl) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const box = sampleEl.getBoundingClientRect();
    sampleEl.width = Math.round(box.width * dpr);
    sampleEl.height = Math.round(box.height * dpr);
    sample(sampleEl.getContext("2d")!, skin, sizeDrag);
  });

  // the canvas fills the space it is given, at the screen's real pixel density
  let look: Theme;
  let scale = 1;
  function fit() {
    if (!jarEl || !surfaceEl) return;
    const box = surfaceEl.getBoundingClientRect();
    const aspect = VIEW.width / VIEW.height;
    const w = Math.max(1, Math.floor(Math.min(box.width, box.height * aspect)));
    const h = Math.floor(w / aspect);
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    jarEl.style.width = `${w}px`;
    jarEl.style.height = `${h}px`;
    // the jar sits centred in the space; the warning hangs from its rim, not the space's top
    surfaceEl.style.setProperty("--jar-top", `${Math.max(0, (box.height - h) / 2)}px`);
    jarEl.width = Math.round(w * dpr);
    jarEl.height = Math.round(h * dpr);
    scale = jarEl.width / VIEW.width;
  }
  $effect(() => {
    if (!nextEl) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    nextEl.width = nextEl.height = Math.round(48 * dpr);
    preview(nextEl.getContext("2d")!, skin, radii, next);
  });
  // a small picture of a tier, for the ladder and the looks
  // fill: how much of the box the piece takes (the size picker shows them growing)
  function tierIcon(el: HTMLCanvasElement, [look, tier, px, fill]: [Skin, number, number, number?]) {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    el.width = el.height = Math.round(px * dpr);
    icon(el.getContext("2d")!, look, tier, fill);
  }

  // real time in, fixed 1/60 s steps out (the engine keeps the accumulator).
  // a hidden page, an open sheet or a finished game holds the world still.
  let raf = 0;
  let last = 0;
  function frame(now: number) {
    const dt = last ? (now - last) / 1000 : 0;
    last = now;
    if (!game.over && !sheet && !document.hidden) {
      const made = advance(game, dt);
      for (const m of made) celebrate(m, now);
      sfx.merges(made.map((m) => ({ ...m, big: m.tier >= SPAWN_TIERS })));
      sync();
    }
    bursts = bursts.filter((b) => now - b.at < BURST_LIFE);
    const ctx = jarEl?.getContext("2d");
    if (ctx && look) render(ctx, game, skin, look, scale, bursts, now, faces, still?.matches ?? false);
    raf = requestAnimationFrame(frame);
  }
  let visible = $state(true);
  const visibility = () => {
    last = 0;
    visible = !document.hidden;
    if (document.hidden) sfx.quiet();
    else sfx.resume();
  };
  // a departing page goes quiet at that moment; a page back from the cache picks up
  const pagehide = () => sfx.quiet();
  const pageshow = () => sfx.resume();
  /** drop the held piece, with a plop */
  function dropHeld() {
    const tier = game.held;
    if (drop(game)) sfx.drop(tier);
  }

  // turning jiggle on is the tap iOS needs to ask for motion; no answer, no jiggle
  async function toggleJiggle() {
    if (jiggleOn) {
      jiggleOn = false;
      jiggleNote = "";
      writeSlot(JIGGLE, "0");
      return;
    }
    const answer = await askMotion();
    if (answer !== "granted") {
      jiggleNote = answer === "denied" ? "motion was not allowed, so jiggle stays off" : "this device can't jiggle";
      return;
    }
    jiggleOn = true;
    jiggleNote = "";
    writeSlot(JIGGLE, "1");
    markJiggle(game);
    sync();
  }
  // listen for shakes only while it is on and a game is being played in view
  $effect(() => {
    if (!jiggleOn || over || sheet || !visible) return;
    const onMotion = shaker((strength) => {
      if (jiggle(game, strength)) sync();
    });
    addEventListener("devicemotion", onMotion);
    return () => removeEventListener("devicemotion", onMotion);
  });

  // one thumb: drag anywhere under the hud to aim, let go to drop. a tap drops
  // where it lands. one finger only; buttons never start a drop.
  let pointer: number | null = null;
  const playable = () => !game.over && !sheet;
  function aimAt(clientX: number) {
    if (!jarEl) return;
    const box = jarEl.getBoundingClientRect();
    aim(game, (clientX - box.left) / (box.width / VIEW.width) - MARGIN);
  }
  function down(e: PointerEvent) {
    if (pointer !== null || !playable() || (e.target as Element).closest?.("button")) return;
    pointer = e.pointerId;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    aimAt(e.clientX);
  }
  function move(e: PointerEvent) {
    if (e.pointerId === pointer) aimAt(e.clientX);
  }
  function up(e: PointerEvent) {
    if (e.pointerId !== pointer) return;
    pointer = null;
    if (!playable()) return;
    aimAt(e.clientX);
    dropHeld();
  }
  function cancel(e: PointerEvent) {
    if (e.pointerId === pointer) pointer = null;
  }

  function key(e: KeyboardEvent) {
    sfx.wake();
    if (sheet || game.over) return;
    // space and enter belong to a focused button; the button does its own job
    if ((e.key === " " || e.key === "Enter") && (e.target as Element | null)?.closest?.("button, a, input, select, textarea")) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      aim(game, heldX(game) + (e.key === "ArrowLeft" ? -1 : 1) * JAR.width * 0.04);
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      dropHeld();
    }
  }

  let installVisible = $state(false);
  let updateReady = $state(false);
  let updateNote = $state("");
  let install: ReturnType<typeof installControl>;
  let updates: ReturnType<typeof updateControl>;
  async function checkUpdate() {
    updateNote = "checking...";
    const result: UpdateCheck = await updates.check();
    updateNote = result === "current" ? "you have the newest bloop" : result === "newer" ? "a new version is ready" : "could not check right now";
  }
  async function applyUpdate() {
    try {
      await updates.apply();
    } catch {
      updateNote = "the update did not finish. try again in a moment";
    }
  }

  let observer: ResizeObserver | undefined;
  let dark: MediaQueryList | undefined;
  // prefers-reduced-motion: faces hold still (no blink, no glance), no pop, no ring
  let still: MediaQueryList | undefined;
  const repaint = () => (look = theme());
  onMount(() => {
    install = installControl((v) => (installVisible = v), () => (sheet = "ios"));
    updates = updateControl(() => (updateReady = true));
    addEventListener("keydown", key);
    document.addEventListener("visibilitychange", visibility);
    addEventListener("pagehide", pagehide);
    addEventListener("pageshow", pageshow);
    still = matchMedia("(prefers-reduced-motion: reduce)");
    dark = matchMedia("(prefers-color-scheme: dark)");
    dark.addEventListener("change", repaint);
    repaint();
    observer = new ResizeObserver(fit);
    if (surfaceEl) observer.observe(surfaceEl);
    fit();
    raf = requestAnimationFrame(frame);
  });
  onDestroy(() => {
    install?.dispose();
    updates?.dispose();
    observer?.disconnect();
    dark?.removeEventListener("change", repaint);
    cancelAnimationFrame(raf);
    clearTimeout(flairTimer);
    if (typeof removeEventListener === "function") {
      removeEventListener("keydown", key);
      document.removeEventListener("visibilitychange", visibility);
      removeEventListener("pagehide", pagehide);
      removeEventListener("pageshow", pageshow);
    }
  });
</script>

<main class="play" onpointerdowncapture={sfx.wake} onpointerupcapture={sfx.wake}>
  <header class="hud">
    <button id="about" class="icon" aria-label="about bloop" onclick={() => (sheet = "about")}>☰</button>
    <div class="stat" id="score"><span>score</span><b>{score}</b></div>
    <div class="stat" id="best">
      <span class="best-label">best <span id="best-size" class="best-size" aria-label={settingsLine(size, speed)}>{sizeLabel(size)} · {speedLabel(speed)}×</span></span>
      <b>{best}{#if bestJiggled}<svg class="shake-mark" viewBox="0 0 24 24" role="img" aria-label="made with jiggle on"><title>made with jiggle on</title><rect x="8" y="4" width="8" height="16" rx="2" /><path d="M4.5 8q-2 4 0 8M19.5 8q2 4 0 8" /></svg>{/if}</b>
    </div>
    <div class="next" id="next" aria-label={`next: ${tiers[next].name}`}><canvas bind:this={nextEl}></canvas></div>
    <button id="restart" class="icon" aria-label="start over" onclick={askRestart}>↻</button>
  </header>
  <div
    class="surface"
    role="application"
    aria-label="the jar: drag to aim, let go to drop. arrow keys aim, space drops."
    bind:this={surfaceEl}
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={cancel}
    onlostpointercapture={cancel}
  >
    <canvas id="jar" bind:this={jarEl}></canvas>
    {#if danger}<div class="careful" role="status">careful! too high</div>{/if}
    {#key flairKey}{#if flair}<div class="flair" role="status">{flair}</div>{/if}{/key}
    {#if over}
      <div class="over" id="over">
        <h2>jar's full!</h2>
        <p>score <b>{score}</b></p>
        <p>best <b>{best}</b></p>
        <p class="over-settings" id="over-settings-line">{settingsLine(size, speed)}</p>
        {#if jiggled}<p class="jiggled"><svg class="shake-mark" viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="4" width="8" height="16" rx="2" /><path d="M4.5 8q-2 4 0 8M19.5 8q2 4 0 8" /></svg>jiggle on</p>{/if}
        <button id="again" class="big" onclick={restart}>play again</button>
        <div class="row">
          <button id="over-looks" onclick={() => (sheet = "looks")}>looks</button>
          <button id="over-settings" onclick={openSettings}>size & speed</button>
        </div>
      </div>
    {/if}
  </div>
  <footer class="foot">
    <span>{#if !saved}<span class="warn">this browser is not saving your best</span>{:else}two the same make a bigger one{/if}</span>
    <span class="corner">v{__APP_VERSION__}</span>
  </footer>
</main>

{#if updateReady}<button class="update" onclick={applyUpdate}>new version, tap to load</button>{/if}

{#if sheet}
  <dialog bind:this={dialog} class="sheet" onclose={() => (sheet = "")}>
    <div class="card">
      {#if sheet === "about"}
        <h2 class="title">{@html wordmark}</h2>
        <p>drag along the jar to aim, let go to drop. two the same touch and <b>bloop</b> into the next one up.</p>
        <p>keep the jar under the dashed line. if something sits above it too long, the jar is full.</p>
        <button id="looks" onclick={() => (sheet = "looks")}>looks: {skin.name}{pending ? ` (next game: ${pending.name})` : ""}</button>
        <button id="settings" onclick={openSettings}>{settingsLine(size, speed)}{pendingSize !== null || pendingSpeed !== null ? ` (next game: ${settingsLine(pendingSize ?? size, pendingSpeed ?? speed)})` : ""}</button>
        <button id="sound" role="switch" aria-checked={soundOn} onclick={toggleSound}>sound: {soundOn ? "on" : "off"}</button>
        <button id="jiggle" role="switch" aria-checked={jiggleOn} onclick={toggleJiggle}>jiggle: {jiggleOn ? "on" : "off"}</button>
        <p class="hint">shake your phone to jiggle the jar. a score made with jiggle on gets a little mark.</p>
        {#if jiggleNote}<p class="jiggle-note" role="status">{jiggleNote}</p>{/if}
        {#key skin.id}
          <ul class="ladder" aria-label={`${tiers[0].name} to ${tiers[tiers.length - 1].name}`}>
            {#each tiers as t, i}
              <li><canvas use:tierIcon={[skin, i, 40]}></canvas>{t.name}</li>
            {/each}
          </ul>
        {/key}
        <p class="ethos">{ETHOS}</p>
        <p class="version">version {__APP_VERSION__}</p>
        <div class="row">
          <button onclick={checkUpdate}>check for update</button>
          {#if installVisible}<button id="install" onclick={() => install.prompt()}>install</button>{/if}
        </div>
        {#if updateNote}<p role="status">{updateNote}</p>{/if}
        <p><a class="licences" href="/licenses.md" target="_blank" rel="noopener">licences</a></p>
        <p class="maker">made with <svg aria-hidden="true" class="mark-heart" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg><span class="sr">love</span> by
          <a href="https://royashbrook.com" target="_blank" rel="noopener">roy</a> +
          <a href="https://royashbrook.com/agents" target="_blank" rel="noopener">ai</a>
          <span class="mark-tail"><span aria-hidden="true" class="mark-dot">·</span>
          <a href="https://github.com/sponsors/royashbrook" target="_blank" rel="noopener">sponsor me</a></span></p>
      {:else if sheet === "looks"}
        <h2>looks</h2>
        <ul class="looks">
          {#each SKINS as s (s.id)}
            <li>
              <button
                id={`look-${s.id}`}
                class="look"
                class:now={s === skin}
                class:next={s === pending}
                aria-pressed={(pending ?? skin) === s}
                onclick={() => pickLook(s)}
              >
                <span class="look-name">{s.name}</span>
                <span class="look-pieces" aria-hidden="true">
                  {#each [0, 2, 4, 7] as i (i)}<canvas use:tierIcon={[s, i, 34]}></canvas>{/each}
                </span>
                {#if s === pending}<span class="look-tag">next game</span>{:else if s === skin && !pending}<span class="look-tag">on</span>{:else if s === skin}<span class="look-tag">this game</span>{/if}
              </button>
            </li>
          {/each}
        </ul>
        {#if pending}<p class="look-note" role="status">{pending.name} starts with your next game. this jar keeps going.</p>{/if}
      {:else if sheet === "settings"}
        <h2>size & speed</h2>
        <div class="setting">
          <label for="size-slider">piece size</label>
          <output id="size-value" for="size-slider">{sizeWord(sizeDrag)} · {sizeLabel(sizeDrag)}</output>
          <input
            id="size-slider"
            type="range"
            min={SIZE_MIN}
            max={SIZE_MAX}
            step={SIZE_STEP}
            value={sizeDrag}
            aria-valuetext={`${sizeLabel(sizeDrag)}, ${sizeWord(sizeDrag)}`}
            oninput={(e) => (sizeDrag = snapSize(Number(e.currentTarget.value)))}
            onchange={(e) => pickSize(Number(e.currentTarget.value))}
          />
          <canvas id="size-preview" class="size-preview" bind:this={sampleEl} aria-hidden="true"></canvas>
          {#if pendingSize !== null}<span class="look-tag" id="size-tag">next game</span>{/if}
        </div>
        <div class="setting">
          <label for="speed-slider">speed</label>
          <output id="speed-value" for="speed-slider">{speedWord(speedDrag)} · {speedLabel(speedDrag)}×</output>
          <input
            id="speed-slider"
            type="range"
            min={SPEED_MIN}
            max={SPEED_MAX}
            step={SPEED_STEP}
            value={speedDrag}
            aria-valuetext={`${speedLabel(speedDrag)} times, ${speedWord(speedDrag)}`}
            oninput={(e) => (speedDrag = snapSpeed(Number(e.currentTarget.value)))}
            onchange={(e) => pickSpeed(Number(e.currentTarget.value))}
          />
          {#if pendingSpeed !== null}<span class="look-tag" id="speed-tag">next game</span>{/if}
        </div>
        <p class="hint">bigger pieces fill the jar faster, so bigger is harder. every size and speed keeps its own best.</p>
        {#if pendingSize !== null || pendingSpeed !== null}<p class="look-note" role="status">{settingsLine(pendingSize ?? size, pendingSpeed ?? speed)} starts with your next game. this jar keeps going.</p>{/if}
      {:else if sheet === "restart"}
        <h2>start over?</h2>
        <p>this jar goes away. your best score stays.</p>
        <button id="confirm-restart" class="big" onclick={() => { sheet = ""; restart(); }}>start over</button>
      {:else if sheet === "ios"}
        <h2>install bloop</h2>
        <p>in safari, tap the <b>share</b> button, then <b>add to home screen</b>.</p>
      {/if}
      <button id="close" class="big" onclick={() => (sheet = "")}>{sheet === "restart" ? "keep playing" : "back"}</button>
    </div>
  </dialog>
{/if}
