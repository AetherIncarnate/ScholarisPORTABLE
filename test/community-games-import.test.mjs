import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCommunityConfig} from '../community-games-import.mjs';

test('community source configuration is pinned, licensed and path-safe',()=>{
  assert.equal(validateCommunityConfig(),true);
});

test('rejects an unpinned source and unsafe launcher path',()=>{
  const base={maxGameBytes:12_000_000,sources:[{repository:'https://github.com/example/game.git',commit:'a'.repeat(40),licenseFile:'LICENSE',licenseId:'MIT',games:[{slug:'sample-game',name:'Sample Game',sourcePath:'.',launchPath:'index.html',genre:'Arcade',device:'pc'}]}]};
  assert.equal(validateCommunityConfig(base),true);
  assert.throws(()=>validateCommunityConfig({...base,sources:[{...base.sources[0],commit:'main'}]}),/Invalid pinned commit/);
  assert.throws(()=>validateCommunityConfig({...base,sources:[{...base.sources[0],games:[{...base.sources[0].games[0],launchPath:'../../outside.html'}]}]}),/Unsafe community-game path/);
});
