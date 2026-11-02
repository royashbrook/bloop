<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { advance, aim, create, drop, heldX, JAR, snapshot, SPAWN_TIERS, type Game, type Merge } from "./lib/engine/game.ts";
  import { preview, render, theme, VIEW, MARGIN, BURST_LIFE, type Burst, type Theme } from "./lib/draw.ts";
  import { DEFAULT_SKIN } from "./lib/skins/index.ts";
  import { dims } from "./lib/skins/types.ts";
  import { readSlot, writeSlot } from "./lib/storage.ts";
  import { installControl } from "./install.ts";
  import { updateControl, type UpdateCheck } from "./pwa.ts";

  const ETHOS =
    "no ads, no lives, no timers, nothing to buy, no accounts, no cookies, nothing sold or shared.";
  const skin = DEFAULT_SKIN;
  const tiers = skin.tiers;

  // ?seed=123 plays that exact deal every game, so a run can be shared and replayed
  const q = new URLSearchParams(location.search);
  const fixedSeed = /^\d{1,9}$/.test(q.get("seed") ?? "") ? Number(q.get("seed")) : null;
  const freshSeed = () => fixedSeed ?? crypto.getRandomValues(new Uint32Array(1))[0];

  const BEST = "bloop:best";
  const stored = Number(readSlot(BEST));
  let best = $state(Number.isSafeInteger(stored) && stored > 0 ? stored : 0);
  let saved = $state(true);

  let game: Game = create(freshSeed(), dims(skin));
  // the game mutates in place; these are what the screen watches
  let score = $state(0);
  let over = $state(false);
  let danger = $state(false);
  let next = $state(game.next);
  let flair = $state("");
  let flairKey = $state(0);
  let sheet = $state<"" | "about" | "ios" | "restart">("");

  let jarEl = $state<HTMLCanvasElement>();
  let nextEl = $state<HTMLCanvasElement>();
  let surfaceEl = $state<HTMLDivElement>();
  let dialog = $state<HTMLDialogElement>();
  $effect(() => {
    if (dialog && !dialog.open) dialog.showModal();
  });

  // a read-only window onto the game, for tests and the curious
  (window as unknown as { __bloop: unknown }).__bloop = { state: () => snapshot(game) };

  function sync() {
    if (score !== game.score) {
      score = game.score;
      if (score > best) {
        best = score;
        saved = writeSlot(BEST, String(best));
      }
    }
    over = game.over;
    danger = game.danger > 0 && !game.over;
    next = game.next;
  }

  let bursts: Burst[] = [];
  let flairTimer: ReturnType<typeof setTimeout>;
  function celebrate(m: Merge, now: number) {
    const t = tiers[m.tier];
    bursts.push({ x: m.x, y: m.y, r: t.radius * JAR.width, colour: t.colour, at: now });
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
    game = create(freshSeed(), dims(skin));
    bursts = [];
    flair = "";
    pointer = null;
    sync();
  }

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
    jarEl.width = Math.round(w * dpr);
    jarEl.height = Math.round(h * dpr);
    scale = jarEl.width / VIEW.width;
  }
  $effect(() => {
    if (!nextEl) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    nextEl.width = nextEl.height = Math.round(48 * dpr);
    preview(nextEl.getContext("2d")!, skin, next);
  });
  // a small picture of a tier, for the ladder in the about sheet
  function tierIcon(el: HTMLCanvasElement, tier: number) {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    el.width = el.height = Math.round(40 * dpr);
    const ctx = el.getContext("2d")!;
    const r = tiers[tier].radius * JAR.width;
    const s = (el.width * 0.36) / r;
    ctx.setTransform(s, 0, 0, s, el.width / 2, el.height / 2);
    tiers[tier].draw(ctx, 0, 0, r);
  }

  // real time in, fixed 1/60 s steps out (the engine keeps the accumulator).
  // a hidden page, an open sheet or a finished game holds the world still.
  let raf = 0;
  let last = 0;
  function frame(now: number) {
    const dt = last ? (now - last) / 1000 : 0;
    last = now;
    if (!game.over && !sheet && !document.hidden) {
      for (const m of advance(game, dt)) celebrate(m, now);
      sync();
    }
    bursts = bursts.filter((b) => now - b.at < BURST_LIFE);
    const ctx = jarEl?.getContext("2d");
    if (ctx && look) render(ctx, game, skin, look, scale, bursts, now);
    raf = requestAnimationFrame(frame);
  }
  const visibility = () => (last = 0);

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
    drop(game);
  }
  function cancel(e: PointerEvent) {
    if (e.pointerId === pointer) pointer = null;
  }

  function key(e: KeyboardEvent) {
    if (sheet || game.over) return;
    // space and enter belong to a focused button; the button does its own job
    if ((e.key === " " || e.key === "Enter") && (e.target as Element | null)?.closest?.("button, a, input, select, textarea")) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      aim(game, heldX(game) + (e.key === "ArrowLeft" ? -1 : 1) * JAR.width * 0.04);
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      drop(game);
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
  const repaint = () => (look = theme());
  onMount(() => {
    install = installControl((v) => (installVisible = v), () => (sheet = "ios"));
    updates = updateControl(() => (updateReady = true));
    addEventListener("keydown", key);
    document.addEventListener("visibilitychange", visibility);
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
    }
  });
</script>

<main class="play">
  <header class="hud">
    <button id="about" class="icon" aria-label="about bloop" onclick={() => (sheet = "about")}>☰</button>
    <div class="stat" id="score"><span>score</span><b>{score}</b></div>
    <div class="stat" id="best"><span>best</span><b>{best}</b></div>
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
        <button id="again" class="big" onclick={restart}>play again</button>
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
        <h2>bloop</h2>
        <p>drag along the jar to aim, let go to drop. two the same touch and <b>bloop</b> into the next one up.</p>
        <p>keep the jar under the dashed line. if something sits above it too long, the jar is full.</p>
        <ul class="ladder" aria-label="atom to whale">
          {#each tiers as t, i}
            <li><canvas use:tierIcon={i}></canvas>{t.name}</li>
          {/each}
        </ul>
        <p class="ethos">{ETHOS}</p>
        <p class="version">version {__APP_VERSION__}</p>
        <div class="row">
          <button onclick={checkUpdate}>check for update</button>
          {#if installVisible}<button id="install" onclick={() => install.prompt()}>install</button>{/if}
        </div>
        {#if updateNote}<p role="status">{updateNote}</p>{/if}
        <p><a class="licences" href="/licenses.md" target="_blank" rel="noopener">licences</a></p>
        <div class="maker">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21 3 12C-4 4 6-3 12 5 18-3 28 4 21 12Z" /></svg>
          made with love by
          <a href="https://royashbrook.com" target="_blank" rel="noopener">roy</a>
          +
          <a href="https://royashbrook.com/agents" target="_blank" rel="noopener">ai</a>
          ·
          <a href="https://github.com/sponsors/royashbrook" target="_blank" rel="noopener">sponsor me</a>
        </div>
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
