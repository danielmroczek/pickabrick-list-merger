# Pick-a-brick list merger

A lightweight static web tool to load, inspect, merge, annotate, sort, and export LEGO Pick-a-Brick part lists.

Built with plain HTML + Alpine.js, with no backend and no build step.

## Demo

Try it here: https://danielmroczek.github.io/pickabrick-list-merger/

## Overview

This project helps combine multiple Pick-a-Brick exports (`.csv` and `.json`) into one merged list based on `elementId`.

For each merged item, the app:
- sums total quantity,
- keeps source breakdown per input list (with quantities),
- preserves inherited (passthrough) source quantities from previously merged files,
- sums passthrough quantities when merged outputs are re-merged,
- allows adding a custom `comment`,
- exports the final result back to JSON and CSV.

## Features

- Multi-file import (`CSV` and `JSON`) via browser file picker.
- Input list preview with image, name, element ID, and quantity.
- Merge by `elementId` with total quantity aggregation.
- Source tracking per item (for example: `list1.csv: 1, merged-list2.json: 3`).
- Passthrough summing: when an input already contains per-list history from earlier merges, inherited quantities are carried forward and summed.
- Editable comments per merged item.
- Sorting in merged table by:
  - `name`
  - `elementId`
- Export merged result to:
  - JSON (`elementId`, `quantity`, optional `name`, `image`, `comment`, `perListQuantities`, `inheritedPerListQuantities`, and `perListQuantitiesBreakdown`)
  - CSV (`name,elementId,quantity,image,perListQuantities,inheritedPerListQuantities,inheritedPerListQuantitiesByInputList,comment`)
- Fallback image URL generation when image is missing or relative.

## Getting Started

### Prerequisites

- Any modern browser (Chrome, Edge, Firefox).

### Run locally

1. Clone or download this repository.
2. Open `index.html` directly in your browser.
3. Load one or more list files from your own Pick-a-brick exports.

> [!TIP]
> No install, no npm, and no server are required for basic usage.

## Supported Input Formats

### JSON

- Array of objects.
- Minimum fields: `elementId`, `quantity`.
- Optional fields: `name`, `image`.

Example:

```json
[
  {
    "name": "FLAT TILE 1X1",
    "elementId": "307021",
    "quantity": 2,
    "image": "https://www.lego.com/cdn/product-assets/element.img.photoreal.192x192/307021.jpg"
  },
  {
    "elementId": "300121",
    "quantity": 10
  }
]
```

### CSV

- Header-based CSV.
- Required headers: at least `elementId` and `quantity`.
- Common headers: `name,elementId,quantity,image`.

## Export Formats

### JSON export

Each merged item includes:
- `elementId`
- `quantity` (total)
- optional `name`
- optional `image`
- `comment`
- `perListQuantities` (string with direct per-input-list quantities)
- `inheritedPerListQuantities` (string with passthrough quantities inherited from earlier merges)
- `perListQuantitiesBreakdown` with:
  - `merged` (direct quantities by source label)
  - `inherited` (combined passthrough quantities by source label)
  - `inheritedByInputList` (passthrough quantities grouped by currently loaded input list)

Example:

```json
{
  "elementId": "307021",
  "quantity": 4,
  "name": "FLAT TILE 1X1",
  "image": "https://www.lego.com/cdn/product-assets/element.img.photoreal.192x192/307021.jpg",
  "comment": "Need extra for roof",
  "perListQuantities": "piecesExport-small.csv: 1, piecesExport-2026-04-07T074641426Z.csv: 3",
  "inheritedPerListQuantities": "older-merge.json: 2",
  "perListQuantitiesBreakdown": {
    "merged": {
      "piecesExport-small.csv": 1,
      "piecesExport-2026-04-07T074641426Z.csv": 3
    },
    "inherited": {
      "older-merge.json": 2
    },
    "inheritedByInputList": {
      "piecesExport-2026-04-07T074641426Z.csv": {
        "older-merge.json": 2
      }
    }
  }
}
```

### CSV export

Header:

```csv
name,elementId,quantity,image,perListQuantities,inheritedPerListQuantities,inheritedPerListQuantitiesByInputList,comment
```

## Project Structure

```text
.
├── index.html
├── css/
│   └── styles.css
└── js/
    └── app.js
```

## How It Works

1. Import files in the UI.
2. Each file is parsed based on extension (`.csv` / `.json`).
3. Items are normalized:
   - `elementId` as string,
   - numeric `quantity`,
  - image URL normalized to LEGO CDN fallback when needed,
  - inherited per-list quantities extracted from prior merged exports when present.
4. Items are merged by `elementId`.
5. Passthrough source histories are summed across all loaded inputs.
6. Result table supports sorting and comment editing.
7. Export uses browser `Blob` downloads.

> [!IMPORTANT]
> Parsing errors are shown in the UI under **Parsing issues**. Invalid rows (for example missing `elementId` or non-positive quantity) are ignored during normalization.

## Notes

- The app is intentionally framework-light: Alpine.js for state and interactions, Pico.css for minimal styling.
- This project is intended for local/browser usage and does not send data to any server.
