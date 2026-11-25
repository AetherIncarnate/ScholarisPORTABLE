import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGameCards,classifyGame,inferDevice} from '../seraph-import.mjs';

test('parses a Seraph game card into a safe relative launcher and thumbnail',()=>{
  const page=`<a target="_blank" href="papa's-puzzle/index.html"><div class="button" style="background-image: url('../images/thumbnails/puzzle.webp');" data-genre="puzzle"><h2>Papa's Puzzle &amp; Quest</h2><span>play</span></div></a>`;
  const [game]=parseGameCards(page);
  assert.equal(game.name,"Papa's Puzzle & Quest");
  assert.equal(game.folder,"papa's-puzzle");
  assert.equal(game.genre,'puzzle');
  assert.equal(game.href,"papa's-puzzle/index.html");
  assert.equal(game.image,"../images/thumbnails/puzzle.webp");
});

test('ignores non-game links and unsafe paths',()=>{
  const page=`<a href="../index.html"><div class="button"><h2>Home</h2></div></a><a href="../../outside/index.html"><div class="button"><h2>Escape</h2></div></a><a href="https://example.com"><div class="button"><h2>External</h2></div></a>`;
  assert.deepEqual(parseGameCards(page),[]);
});

test('classifies console-emulator, Unity, Flash and browser launchers',()=>{
  assert.equal(classifyGame({html:'<script>var EJS_player="#game";</script>',files:[]}), 'console-emulator');
  assert.equal(classifyGame({html:'<script>createUnityInstance(canvas, cfg)</script>',files:[]}), 'unity');
  assert.equal(classifyGame({html:'<embed src="game.swf">',files:['games/flash/game.swf']}), 'flash');
  assert.equal(classifyGame({html:'<script src="game.js"></script>',files:['games/browser/game.js']}), 'browser');
});

test('reports mobile support only when touch evidence is present',()=>{
  assert.equal(inferDevice('<meta name="viewport" content="width=device-width">','Puzzle'), 'pc');
  assert.equal(inferDevice('<meta name="viewport" content="width=device-width"><script>addEventListener("touchstart", play)</script>','Puzzle'), 'mobile+pc');
});
