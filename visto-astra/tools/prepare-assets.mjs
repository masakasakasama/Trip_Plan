import fs from "node:fs/promises";
import vm from "node:vm";
import sharp from "sharp";
const original = await fs.readFile(
  new URL("../../visto/parts/p01.txt", import.meta.url),
  "utf8",
);
const countries = vm.runInNewContext(
  "(" + original.match(/const COUNTRY_META=(\{[\s\S]*?\n\});/)[1] + ")",
);
const cities = vm.runInNewContext(
  "(" + original.match(/const CITY_GEO=(\{[^\n]+\});/)[1] + ")",
);
await fs.writeFile(
  new URL("../assets/geography.json", import.meta.url),
  JSON.stringify({ countries, cities }),
);
for (const name of ["day", "night", "bump_roughness_clouds"]) {
  const source = new URL(`../assets/earth_${name}_4096.jpg`, import.meta.url);
  await sharp(await fs.readFile(source))
    .resize(2048, 1024)
    .webp({ quality: 88 })
    .toFile(
      new URL(
        `../assets/earth_${name}_2048.webp`,
        import.meta.url,
      ).pathname.replace(/^\/([A-Z]:)/, "$1"),
    );
}
