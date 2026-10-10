// Generates the app icon set from the logo mark. Run: node scripts/make-icons.mjs
import sharp from "sharp";
import { writeFileSync, readFileSync } from "node:fs";

const PRIMARY = "#0E7C66";
const AMBER = "#F2A33A";

// Portions mark: a plate cut into shares, one share handed over.
const pieces = (fg) => `
  <g transform="translate(-10 10)">
    <path d="M256 256 L106 256 A150 150 0 0 1 256 106 Z" fill="${fg}" transform="translate(-7 -7)"/>
    <path d="M256 256 L256 406 A150 150 0 0 1 106 256 Z" fill="${fg}" transform="translate(-7 7)"/>
    <path d="M256 256 L406 256 A150 150 0 0 1 256 406 Z" fill="${fg}" transform="translate(7 7)"/>
    <path d="M256 256 L256 106 A150 150 0 0 1 406 256 Z" fill="${AMBER}" transform="translate(30 -30)"/>
  </g>`;

const tile = (rx = 116) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${rx}" fill="${PRIMARY}"/>${pieces("#ffffff")}
</svg>`;

// Maskable: full-bleed background, mark scaled into the 80% safe zone
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${PRIMARY}"/>
  <g transform="translate(51 51) scale(0.8)">${pieces("#ffffff")}</g>
</svg>`;

// Bare mark for light / dark backgrounds
const bare = (fg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="60 60 400 400">${pieces(fg)}</svg>`;

writeFileSync("src/app/icon.svg", tile());
writeFileSync("public/brand/app-icon.svg", tile());
writeFileSync("public/brand/mark-on-light.svg", bare(PRIMARY));
writeFileSync("public/brand/mark-on-dark.svg", bare("#ffffff"));
writeFileSync("public/icons/maskable.svg", maskable);

const png = (svg, size, out) => sharp(Buffer.from(svg)).resize(size, size).png().toFile(out);
await Promise.all([
  png(tile(), 192, "public/icons/icon-192.png"),
  png(tile(), 512, "public/icons/icon-512.png"),
  png(maskable, 512, "public/icons/maskable-512.png"),
  png(tile(0), 180, "src/app/apple-icon.png"),
  png(tile(), 1024, "public/brand/app-icon-1024.png"),
]);
console.log("icons done");
