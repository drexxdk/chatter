import { fileURLToPath } from "node:url";
import sharp from "sharp";

const width = 1920;
const height = 640;
const pixels = Buffer.alloc(width * height * 4);
const leftColor = [140, 188, 161];
const rightColor = [215, 142, 198];

for (let column = 0; column < width; column++) {
  const horizontal = column / (width - 1);
  const center = height / 2 + Math.sin(horizontal * Math.PI * 2 - 1.2) * 38;
  const spread = 90 * Math.pow(1 - horizontal, 2) + 20;
  const spacing = spread / 44;
  const brightness = 0.65 + horizontal * 0.35;

  for (let row = 0; row < height; row++) {
    const distance = row - center;
    const thread = Math.round(distance / spacing);
    const threadDistance = distance - thread * spacing;
    const filaments =
      thread > 0 && thread < 44
        ? Math.exp(-Math.pow(threadDistance / 0.4, 2)) *
          Math.pow(1 - thread / 44, 1.4) *
          0.28
        : 0;
    const core = Math.exp(-Math.pow(distance / 0.85, 2));
    const bloom =
      Math.exp(-Math.pow(distance / 12, 2)) * 0.14 +
      Math.exp(-Math.pow(distance / 38, 2)) * 0.035;
    const offset = (row * width + column) * 4;
    const channels = [];
    for (let channel = 0; channel < 3; channel++) {
      const color =
        leftColor[channel] * (1 - horizontal) +
        rightColor[channel] * horizontal;
      channels[channel] = Math.min(
        255,
        color * (filaments + bloom) * brightness +
          (color * 0.45 + 140) * core * brightness,
      );
    }
    const alpha = Math.max(...channels) / 255;
    if (alpha > 0) {
      for (let channel = 0; channel < 3; channel++) {
        pixels[offset + channel] = channels[channel] / alpha;
      }
      pixels[offset + 3] = Math.round(alpha * 255);
    }
  }
}

const output = fileURLToPath(
  new URL("../public/images/lobby-light.webp", import.meta.url),
);
await sharp(pixels, { raw: { width, height, channels: 4 } })
  .webp({ quality: 86 })
  .toFile(output);
const stats = await sharp(output).stats();
if (stats.channels.every((channel) => channel.stdev < 2)) {
  throw new Error("The background wave is blank");
}
console.log(`Rendered ${width}x${height} background wave: ${output}`);
