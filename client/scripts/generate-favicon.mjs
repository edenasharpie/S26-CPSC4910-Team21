import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { Resvg } from "@resvg/resvg-js";
import pngToIco from "png-to-ico";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveClientPath(...segments) {
  return path.resolve(__dirname, "..", ...segments);
}

function toPositiveInt(value) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseSizesArg(argValue) {
  if (!argValue) return [16, 32, 48];
  const parts = String(argValue)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  const sizes = parts
    .map((part) => toPositiveInt(part))
    .filter((value) => typeof value === "number");

  return sizes.length > 0 ? Array.from(new Set(sizes)) : [16, 32, 48];
}

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

const inputSvg = getArgValue("--input") ?? resolveClientPath("public", "favicon.svg");
const outputIco = getArgValue("--output") ?? resolveClientPath("public", "favicon.ico");
const sizes = parseSizesArg(getArgValue("--sizes"));

if (!fs.existsSync(inputSvg)) {
  console.error(`Input SVG not found: ${inputSvg}`);
  process.exit(1);
}

const svgSource = fs.readFileSync(inputSvg, "utf8");

const pngBuffers = sizes.map((size) => {
  const resvg = new Resvg(svgSource, {
    fitTo: {
      mode: "width",
      value: size,
    },
  });

  const pngData = resvg.render();
  return pngData.asPng();
});

const icoBuffer = await pngToIco(pngBuffers);
fs.writeFileSync(outputIco, icoBuffer);

console.log(
  `Generated ${path.relative(resolveClientPath("."), outputIco)} (${sizes.join(",")} px) from ${path.relative(
    resolveClientPath("."),
    inputSvg
  )}`
);
