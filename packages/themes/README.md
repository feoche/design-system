# ODS Themes

## How to update ods-icon font?

The ods-icon font is managed through icomoon.

1. Update the font files and the selection:

- go to the icomoon app: https://icomoon.io/app/#/projects
- click on `Import Project` and select the `selection.json` file located in `assets/fonts/ods-icon/icomoon`
- add/remove/update the icons you want
- click on `Generate Font` on the bottom, double-check that all icons and names are correct, then click on `Download`
- unzip the downloaded file and copy all files from its `fonts` subdirectory plus the `selection.json` into `assets/fonts/ods-icon/icomoon`

2. Build the project

Run `npm run build:prod` at the root of the project. It also rewrites the base64 copy of the font
read by `fonts-base64`, `assets/fonts/ods-icon/icomoon/_icomoon.scss`: commit it with the font
files, `lint:css` fails when it is out of date.

The new font is now available for other projects to use.

3. Update `ods-icon`

Depending on your changes, you may need to go update the `ods-icon` component constants with the updated values.

You'll find the value of each icon content in the `style.css` file in the icomoon extracted directory previously downloaded.

/!\ Some components are using icon content directly, you need to double-check if your changes did not break anything for those.
(you can found them using a search on `@include icon.ods-icon();` in the `ods-react/src/components` directory)

/!\ Please check also the icon tags list on the storybook icon story (`storybook/src/constants/iconTags.ts`).

## How to update the theme values?

The white label (`src/white-label`) holds every semantic token: each role a component reads (surfaces, content, borders, interactions, statuses and component tokens) is declared in its `light.scss` and `dark.scss`, on the palette of `_palette.scss` and `_variables.scss`. A value changed in the white label reaches every theme that does not override it.

Aluminium (`src/aluminium`) and Blue Jeans (`src/blue-jeans`) are built on it. A theme is its `_shared.scss` plus one file per mode, and each mode file holds only the deltas from the white label of that mode:

- `light.scss` uses `../white-label/light`, then `_shared.scss`, then its own light deltas.
- `dark.scss` uses `../white-label/dark`, then `_shared.scss`, then its own dark deltas.

`_shared.scss` holds the palette re-aims and the deltas that are identical in light and dark. A mode-specific value belongs in that mode's file, since a theme may set the same ramp differently per mode. To change a value of a theme for one mode, edit that mode's file; to change it for both, edit `_shared.scss`; to change it for every theme, edit the white label.

Dark deltas sit on top of `white-label/dark`, so they also inherit its dark values. To drop a white-label dark value that a theme does not want, re-declare the value the theme wants in its `dark.scss`.

Some deltas resolve to the same colour as the white label, and they are kept on purpose. The published `tokens.json` keeps the alias (`refs`) of each token, the palette step the value names, such as `navy-900`. A delta that names the theme's own step keeps that alias even when the white label gives the same colour, so removing it would change the published alias without changing any rendered colour.

Before a change that should not alter any build, save the current build, change the sources, then compare:

1. Save the build of the current branch: `pnpm --filter @ovhcloud/ods-themes run build:prod`, then copy `packages/themes/dist` to a directory outside the repository.
2. Change the sources and rebuild with `pnpm --filter @ovhcloud/ods-themes run build:prod`.
3. Run `pnpm --filter @ovhcloud/ods-themes run compare:builds <saved-dist-dir>`. It prints every token that changed, went missing or was added, and exits 1 on any change that is not allowed. Lines marked `added` are allowed and do not fail: the new ODS palette slate tokens in the root scope, and new `white-label/` files. The exit code is the gate, so a refactor should exit 0.

To see where each theme differs from the white label of its mode, run `pnpm --filter @ovhcloud/ods-themes run tokens:diff`. It prints each differing token as `<theme> <token>: <white-label value> → <theme value>`, grouped by theme with a count per theme. It is a report and always exits 0.

`pnpm build:prod` compiles each mode to a single stylesheet (`dist/<theme>/<mode>.css`, the two modes merged into one `:root` by `scripts/bake-themes.js`) and regenerates its `<mode>.tokens.json`. `pnpm tokens:resolve` prints what each token resolves to.

## How to create a theme

A theme is a folder `src/<name>/` plus its exports. To create `<name>` on the white label:

1. Create `src/<name>/_shared.scss`, `light.scss` and `dark.scss`. Each mode file starts with `@use ../white-label/light;` (or `dark`) and `@use ./shared;`, then holds only its deltas. Add `_palette.scss` or `_variables.scss` only for palette values that differ from the white label, as Aluminium and Blue Jeans do.
2. Add the exports to `package.json`: `./<name>/css` and `./<name>/tokens` for light, `./<name>-dark/css` and `./<name>-dark/tokens` for dark. `scripts/themes.js` discovers themes only from these exports, and `tokens:diff` reads the `-dark` suffix to pick the white label of the mode.
3. Run `pnpm --filter @ovhcloud/ods-themes run build:prod`. `tokens:diff` and `check:contrast` read the `dist/*.tokens.json` files, so run them after the build.
4. Run `pnpm --filter @ovhcloud/ods-themes run tokens:diff` to review every value that differs from the white label, and `node scripts/check-contrast.js dist/<name>/light.tokens.json dist/<name>/dark.tokens.json` (or `pnpm check:contrast` with the same files) to check the contrast of the pairs.

## The white label theme

`src/white-label` is a neutral theme with no OVHcloud brand colour, in light (`white-label/css`) and dark (`white-label-dark/css`). It declares every semantic token, so a product using only it renders every ODS component. Its look is graphite on slate: the primary (`brand`) is near-black in light and near-white in dark, the neutrals (page, text, borders, header, selection) carry a faint blue-gray tint, and the status colours are those of Aluminium. The focus ring is blue, `blue-600` in light and `blue-400` in dark, so it stays visible next to a graphite primary.

Two choices differ from the other themes:

- The `slate` family is new, added to the palette of the white label only. The accent ramp points at it.
- The `brand` ramp re-indexes the `gray` family: `brand-500` is `gray-800` (`#333333`), and `brand-600` and `brand-700` are `gray-900`. So the roles that read `brand-500` get graphite. A theme whose brand ramp points at a family where the 500 step is the main colour, such as blue, keeps a primary of its own colour.

The contrast of the text, control and accent pairs is checked by `pnpm check:contrast`, which reads the `tokens.json` of a theme and prints the ratio of each pair:

```bash
pnpm check:contrast dist/white-label/light.tokens.json dist/white-label/dark.tokens.json
```

It exits with 1 when a pair fails its minimum (4.5:1 for text, 3:1 for control borders and non-text) or when a token is missing.
