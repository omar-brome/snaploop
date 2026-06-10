// Converts the captured webm into docs/media assets:
//   demo.mp4  — full walkthrough (h264, plays everywhere)
//   demo.gif  — README hero GIF, cut from feed -> story -> explore segment
import { spawnSync } from 'child_process';
import ffmpeg from 'ffmpeg-static';
import fs from 'fs';
import path from 'path';

const OUT = path.resolve('out');
const MEDIA = path.resolve('..', '..', 'docs', 'media');
fs.mkdirSync(MEDIA, { recursive: true });

const input = path.join(OUT, 'mobile-demo.webm');
const timings = JSON.parse(fs.readFileSync(path.join(OUT, 'timings.json'), 'utf8'));

function run(args) {
  console.log('ffmpeg', args.join(' '));
  const res = spawnSync(ffmpeg, args, { stdio: ['ignore', 'inherit', 'inherit'] });
  if (res.status !== 0) throw new Error(`ffmpeg failed (${res.status})`);
}

// 1) Full demo video as mp4
run([
  '-y', '-i', input,
  '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '26',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an',
  path.join(MEDIA, 'demo.mp4'),
]);

// 2) README GIF: the feed -> story viewer -> explore stretch, sped up 1.5x
const gifStart = Math.max(0, timings.feed - 0.5);
const gifEnd = timings.reels ?? gifStart + 24;
const duration = Math.min(gifEnd - gifStart, 26);
const palette = path.join(OUT, 'palette.png');
const speed = 1.5;

run([
  '-y', '-ss', String(gifStart), '-t', String(duration), '-i', input,
  '-vf', `setpts=PTS/${speed},fps=11,scale=340:-1:flags=lanczos,palettegen=stats_mode=diff`,
  palette,
]);
run([
  '-y', '-ss', String(gifStart), '-t', String(duration), '-i', input, '-i', palette,
  '-lavfi', `setpts=PTS/${speed},fps=11,scale=340:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
  path.join(MEDIA, 'demo.gif'),
]);

// 3) Copy screenshots
const shotsDir = path.join(OUT, 'shots');
for (const f of fs.readdirSync(shotsDir)) {
  fs.copyFileSync(path.join(shotsDir, f), path.join(MEDIA, f));
}

const sizes = fs
  .readdirSync(MEDIA)
  .map((f) => `${f}: ${(fs.statSync(path.join(MEDIA, f)).size / 1024 / 1024).toFixed(2)} MB`);
console.log('\ndocs/media assets:\n' + sizes.join('\n'));
