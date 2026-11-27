import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardPath, dataDir, openCommand, openHint, snapshotDir } from '../src/paths.js';

test('everything this tool writes stays under one directory', () => {
  const home = '/home/me';
  for (const p of [snapshotDir(home), cardPath(home)]) {
    assert.ok(p.startsWith(dataDir(home)), `${p} must live under ${dataDir(home)}`);
  }
});

test('nothing is written under ~/.claude — its cleanup would delete our history', () => {
  for (const p of [dataDir('/home/me'), snapshotDir('/home/me'), cardPath('/home/me')]) {
    assert.ok(!p.includes('.claude'), `${p} must not sit under .claude`);
  }
});

test('the card has a predictable, memorable path', () => {
  assert.match(cardPath('/home/me'), /\.agent-wrapped[\\/]card\.html$/);
});

test('the open hint matches the platform', () => {
  assert.equal(openCommand('darwin'), 'open');
  assert.equal(openCommand('win32'), 'start');
  assert.equal(openCommand('linux'), 'xdg-open');
});

test('the open hint leaves a path with no space unquoted', () => {
  assert.equal(openHint('/home/me/.agent-wrapped/card.html', 'darwin'), 'open /home/me/.agent-wrapped/card.html');
  assert.equal(openHint('/home/me/.agent-wrapped/card.html', 'linux'), 'xdg-open /home/me/.agent-wrapped/card.html');
  assert.equal(openHint('C:\\Users\\me\\.agent-wrapped\\card.html', 'win32'), 'start C:\\Users\\me\\.agent-wrapped\\card.html');
});

test('the open hint quotes a path with a space for the platform shell', () => {
  assert.equal(openHint('/Users/My Name/.agent-wrapped/card.html', 'darwin'), "open '/Users/My Name/.agent-wrapped/card.html'");
  assert.equal(openHint('/home/my name/.agent-wrapped/card.html', 'linux'), "xdg-open '/home/my name/.agent-wrapped/card.html'");
  assert.equal(openHint("/home/O'Brien X/card.html", 'linux'), "xdg-open '/home/O'\\''Brien X/card.html'");
  assert.equal(
    openHint('C:\\Users\\My Name\\.agent-wrapped\\card.html', 'win32'),
    'start "" "C:\\Users\\My Name\\.agent-wrapped\\card.html"',
  );
});
