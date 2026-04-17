function legoMergerApp() {
  return {
    inputLists: [],
    activeInputListId: null,
    mergedItems: [],
    errors: [],
    commentsByElementId: {},
    sortBy: 'elementId',
    sortDirection: 'asc',

    get activeInputList() {
      return this.inputLists.find((list) => list.id === this.activeInputListId) || null;
    },

    async handleFileSelection(event) {
      const files = Array.from(event.target.files || []);
      if (!files.length) {
        return;
      }

      this.errors = [];

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        await this.loadFile(file, index);
      }

      if (!this.activeInputListId && this.inputLists.length > 0) {
        this.activeInputListId = this.inputLists[0].id;
      }

      this.rebuildMergedItems();
      event.target.value = '';
    },

    async loadFile(file, index) {
      const extension = file.name.split('.').pop().toLowerCase();
      const listId = this.buildUniqueListId(file.name, index);

      if (!['csv', 'json'].includes(extension)) {
        this.errors.push('Unsupported file type: ' + file.name);
        return;
      }

      try {
        const text = await file.text();
        const rawItems = extension === 'csv' ? this.parseCsv(text) : this.parseJson(text);
        const normalizedItems = rawItems
          .map((raw) => this.normalizeItem(raw))
          .filter((item) => item !== null);

        this.inputLists.push({
          id: listId,
          label: file.name,
          items: normalizedItems
        });
      } catch (error) {
        this.errors.push('Failed to parse ' + file.name + ': ' + error.message);
      }
    },

    buildUniqueListId(fileName, index) {
      let base = fileName.replace(/\.[^/.]+$/, '') || ('List ' + (this.inputLists.length + index + 1));
      base = base.replace(/\s+/g, '-').toLowerCase();
      let candidate = base;
      let suffix = 2;

      while (this.inputLists.some((list) => list.id === candidate)) {
        candidate = base + '-' + suffix;
        suffix += 1;
      }

      return candidate;
    },

    parseJson(text) {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (error) {
        throw new Error('Invalid JSON');
      }

      if (!Array.isArray(parsed)) {
        throw new Error('JSON root must be an array');
      }

      return parsed;
    },

    parseCsv(text) {
      const lines = text
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .filter((line) => line.trim().length > 0);

      if (lines.length === 0) {
        return [];
      }

      const headers = this.parseCsvRow(lines[0]).map((header) => header.trim());
      const expectedHeaders = ['name', 'elementId', 'quantity', 'image'];

      const hasKnownHeaders = expectedHeaders.every((header) => headers.includes(header))
        || (headers.includes('elementId') && headers.includes('quantity'));

      if (!hasKnownHeaders) {
        throw new Error('CSV must include at least elementId and quantity headers');
      }

      const rows = [];
      for (let i = 1; i < lines.length; i += 1) {
        const rowValues = this.parseCsvRow(lines[i]);
        const rowObject = {};
        headers.forEach((header, idx) => {
          rowObject[header] = rowValues[idx] !== undefined ? rowValues[idx] : '';
        });
        rows.push(rowObject);
      }

      return rows;
    },

    parseCsvRow(line) {
      const values = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        const next = line[i + 1];

        if (char === '"') {
          if (inQuotes && next === '"') {
            current += '"';
            i += 1;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          values.push(current);
          current = '';
        } else {
          current += char;
        }
      }

      values.push(current);
      return values;
    },

    normalizeItem(rawItem) {
      if (!rawItem || typeof rawItem !== 'object') {
        return null;
      }

      const elementId = String(rawItem.elementId || '').trim();
      const quantity = Number(rawItem.quantity);

      if (!elementId) {
        return null;
      }

      if (!Number.isFinite(quantity) || quantity <= 0) {
        return null;
      }

      const name = rawItem.name ? String(rawItem.name).trim() : '';
      const comment = rawItem.comment ? String(rawItem.comment).trim() : '';
      const inheritedPerListQuantities = this.extractInheritedPerListQuantities(rawItem);
      const normalized = {
        elementId,
        name,
        quantity,
        image: this.normalizeImage(rawItem.image, elementId),
        comment,
        inheritedPerListQuantities
      };

      return normalized;
    },

    normalizePerListQuantities(rawPerListQuantities) {
      if (!rawPerListQuantities) {
        return {};
      }

      if (typeof rawPerListQuantities === 'string') {
        return this.parsePerListQuantitiesString(rawPerListQuantities);
      }

      if (typeof rawPerListQuantities !== 'object' || Array.isArray(rawPerListQuantities)) {
        return {};
      }

      // Supports nested objects from previous merged exports.
      if (
        rawPerListQuantities.mergedFromLoadedLists
        || rawPerListQuantities.passthroughFromInputs
        || rawPerListQuantities.merged
        || rawPerListQuantities.inherited
      ) {
        const merged = this.normalizePerListQuantities(
          rawPerListQuantities.mergedFromLoadedLists || rawPerListQuantities.merged
        );
        const inherited = this.normalizePerListQuantities(
          rawPerListQuantities.passthroughFromInputs || rawPerListQuantities.inherited
        );
        return this.mergeQuantityMaps(merged, inherited);
      }

      return this.normalizePositiveQuantityObject(rawPerListQuantities);
    },

    normalizePositiveQuantityObject(rawQuantities) {
      return Object.entries(rawQuantities || {}).reduce((acc, [label, qty]) => {
        const normalizedLabel = String(label || '').trim();
        const normalizedQty = Number(qty);

        if (!normalizedLabel || !Number.isFinite(normalizedQty) || normalizedQty <= 0) {
          return acc;
        }

        acc[normalizedLabel] = (acc[normalizedLabel] || 0) + normalizedQty;
        return acc;
      }, {});
    },

    normalizePerListQuantitiesByGroup(rawPerListQuantitiesByGroup) {
      if (!rawPerListQuantitiesByGroup || typeof rawPerListQuantitiesByGroup !== 'object' || Array.isArray(rawPerListQuantitiesByGroup)) {
        return {};
      }

      return Object.values(rawPerListQuantitiesByGroup).reduce((acc, groupValues) => {
        return this.mergeQuantityMaps(acc, this.normalizePerListQuantities(groupValues));
      }, {});
    },

    extractInheritedPerListQuantities(rawItem) {
      if (!rawItem || typeof rawItem !== 'object') {
        return {};
      }

      if (rawItem.inheritedPerListQuantitiesByInputList) {
        return this.normalizePerListQuantitiesByGroup(rawItem.inheritedPerListQuantitiesByInputList);
      }

      const breakdown = rawItem.perListQuantitiesBreakdown;
      if (breakdown && typeof breakdown === 'object') {
        if (breakdown.inheritedByInputList) {
          return this.normalizePerListQuantitiesByGroup(breakdown.inheritedByInputList);
        }

        if (breakdown.inherited || breakdown.passthroughFromInputs) {
          return this.normalizePerListQuantities(
            breakdown.inherited || breakdown.passthroughFromInputs
          );
        }
      }

      if (rawItem.inheritedPerListQuantities) {
        return this.normalizePerListQuantities(rawItem.inheritedPerListQuantities);
      }

      if (rawItem.perListQuantities) {
        return this.normalizePerListQuantities(rawItem.perListQuantities);
      }

      return {};
    },

    parsePerListQuantitiesString(rawPerListQuantities) {
      const text = String(rawPerListQuantities || '').trim();
      if (!text) {
        return {};
      }

      const normalized = {};
      text
        .split(/\s*,\s*/)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
        .forEach((entry) => {
          const separatorIndex = entry.lastIndexOf(':');
          if (separatorIndex === -1) {
            return;
          }

          const label = entry.slice(0, separatorIndex).trim();
          const qty = Number(entry.slice(separatorIndex + 1).trim());

          if (!label || !Number.isFinite(qty) || qty <= 0) {
            return;
          }

          normalized[label] = (normalized[label] || 0) + qty;
        });

      return normalized;
    },

    mergeQuantityMaps(leftMap, rightMap) {
      const merged = { ...(leftMap || {}) };
      Object.entries(rightMap || {}).forEach(([label, qty]) => {
        merged[label] = (merged[label] || 0) + qty;
      });
      return merged;
    },

    mergeQuantityMapsByList(leftByList, rightByList) {
      const mergedByList = { ...(leftByList || {}) };

      Object.entries(rightByList || {}).forEach(([listId, quantities]) => {
        mergedByList[listId] = this.mergeQuantityMaps(mergedByList[listId], quantities);
      });

      return mergedByList;
    },

    normalizeImage(rawImage, elementId) {
      const fallback = 'https://www.lego.com/cdn/product-assets/element.img.photoreal.192x192/' + elementId + '.jpg';
      if (!rawImage) {
        return fallback;
      }

      const image = String(rawImage).trim();
      if (!image) {
        return fallback;
      }

      if (/^https?:\/\//i.test(image)) {
        return image;
      }

      return fallback;
    },

    rebuildMergedItems() {
      const mergedMap = new Map();

      for (const list of this.inputLists) {
        for (const item of list.items) {
          const existing = mergedMap.get(item.elementId);

          if (!existing) {
            const initialComment = this.commentsByElementId[item.elementId] || item.comment || '';
            if (initialComment && !this.commentsByElementId[item.elementId]) {
              this.commentsByElementId[item.elementId] = initialComment;
            }

            mergedMap.set(item.elementId, {
              elementId: item.elementId,
              name: item.name,
              image: item.image,
              totalQuantity: item.quantity,
              perListQuantities: { [list.id]: item.quantity },
              inheritedPerListQuantitiesByInputList: { [list.id]: { ...item.inheritedPerListQuantities } },
              comment: initialComment
            });
            continue;
          }

          existing.totalQuantity += item.quantity;
          existing.perListQuantities[list.id] = (existing.perListQuantities[list.id] || 0) + item.quantity;
          existing.inheritedPerListQuantitiesByInputList = this.mergeQuantityMapsByList(
            existing.inheritedPerListQuantitiesByInputList,
            { [list.id]: item.inheritedPerListQuantities }
          );

          if (!existing.comment && item.comment) {
            existing.comment = item.comment;
            if (!this.commentsByElementId[item.elementId]) {
              this.commentsByElementId[item.elementId] = item.comment;
            }
          }

          if (!existing.name && item.name) {
            existing.name = item.name;
          }

          if (!existing.image) {
            existing.image = item.image;
          }
        }
      }

      this.mergedItems = Array.from(mergedMap.values());
    },

    sortedMergedItems() {
      const sorted = [...this.mergedItems];
      const multiplier = this.sortDirection === 'asc' ? 1 : -1;

      sorted.sort((a, b) => {
        let left;
        let right;

        if (this.sortBy === 'elementId') {
          left = a.elementId;
          right = b.elementId;
        } else if (this.sortBy === 'name') {
          left = (a.name || '').toLowerCase();
          right = (b.name || '').toLowerCase();
        } else {
          left = a.elementId;
          right = b.elementId;
        }

        if (left < right) {
          return -1 * multiplier;
        }
        if (left > right) {
          return 1 * multiplier;
        }
        return 0;
      });

      return sorted;
    },

    toggleSort(column) {
      if (this.sortBy === column) {
        this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        return;
      }

      this.sortBy = column;
      this.sortDirection = 'asc';
    },

    sortIndicator(column) {
      if (this.sortBy !== column) {
        return '';
      }
      return this.sortDirection === 'asc' ? '▲' : '▼';
    },

    getListLabel(listId) {
      const list = this.inputLists.find((entry) => entry.id === listId);
      return list ? list.label : listId;
    },

    getPositiveQuantityEntries(perListQuantities) {
      return Object.entries(perListQuantities || {}).filter(([_, qty]) => qty > 0);
    },

    formatPerListQuantities(perListQuantities) {
      return this.getPositiveQuantityEntries(perListQuantities)
        .map(([listId, qty]) => this.getListLabel(listId) + ': ' + qty)
        .join(', ');
    },

    buildPerListQuantitiesByLabel(perListQuantities) {
      return this.formatPerListQuantities(perListQuantities);
    },

    buildQuantitiesObjectByLabel(perListQuantities) {
      return this.getPositiveQuantityEntries(perListQuantities)
        .reduce((acc, [listId, qty]) => {
          const label = this.getListLabel(listId);
          acc[label] = (acc[label] || 0) + qty;
          return acc;
        }, {});
    },

    buildPerListQuantitiesDisplay(item) {
      const mergedEntries = this.getPositiveQuantityEntries(item.perListQuantities);
      const inheritedByList = item.inheritedPerListQuantitiesByInputList || {};

      if (mergedEntries.length === 0) {
        return '';
      }

      const mergeEntryToText = ([listId, qty]) => {
        const label = this.getListLabel(listId);
        const inheritedValues = this.buildPerListQuantitiesByLabel(inheritedByList[listId] || {});

        if (!inheritedValues) {
          return label + ': ' + qty;
        }

        return label + ': ' + qty + ' [' + inheritedValues + ']';
      };

      return mergedEntries.map(mergeEntryToText).join(', ');
    },

    buildInheritedByInputListWithLabels(inheritedPerListQuantitiesByInputList) {
      return Object.entries(inheritedPerListQuantitiesByInputList || {}).reduce((acc, [listId, quantities]) => {
        const key = this.getListLabel(listId);
        acc[key] = this.buildQuantitiesObjectByLabel(quantities || {});
        return acc;
      }, {});
    },

    buildCombinedInheritedQuantities(inheritedPerListQuantitiesByInputList) {
      return Object.values(inheritedPerListQuantitiesByInputList || {}).reduce((acc, quantities) => {
        return this.mergeQuantityMaps(acc, quantities || {});
      }, {});
    },

    buildExportRows() {
      return this.sortedMergedItems().map((item) => {
        const mergedByLabel = this.buildQuantitiesObjectByLabel(item.perListQuantities);
        const inheritedByInputList = this.buildInheritedByInputListWithLabels(item.inheritedPerListQuantitiesByInputList);
        const inheritedCombined = this.buildCombinedInheritedQuantities(item.inheritedPerListQuantitiesByInputList);
        const row = {
          elementId: item.elementId,
          quantity: item.totalQuantity,
          comment: item.comment || '',
          perListQuantities: this.buildPerListQuantitiesByLabel(item.perListQuantities),
          inheritedPerListQuantities: this.buildPerListQuantitiesByLabel(inheritedCombined),
          perListQuantitiesBreakdown: {
            merged: mergedByLabel,
            inherited: inheritedCombined,
            inheritedByInputList
          }
        };

        if (item.name) {
          row.name = item.name;
        }
        if (item.image) {
          row.image = item.image;
        }

        return row;
      });
    },

    exportMergedJson() {
      const rows = this.buildExportRows();
      this.downloadFile(
        JSON.stringify(rows, null, 2),
        'pickabrick-merged-' + this.nowStamp() + '.json',
        'application/json'
      );
    },

    exportMergedCsv() {
      const rows = this.sortedMergedItems();
      const header = ['name', 'elementId', 'quantity', 'image', 'perListQuantities', 'inheritedPerListQuantities', 'inheritedPerListQuantitiesByInputList', 'comment'];
      const csvLines = [header.join(',')];

      for (const item of rows) {
        const line = [
          item.name || '',
          item.elementId,
          item.totalQuantity,
          item.image || this.normalizeImage('', item.elementId),
          this.buildPerListQuantitiesByLabel(item.perListQuantities),
          this.buildPerListQuantitiesByLabel(this.buildCombinedInheritedQuantities(item.inheritedPerListQuantitiesByInputList)),
          JSON.stringify(this.buildInheritedByInputListWithLabels(item.inheritedPerListQuantitiesByInputList)),
          item.comment || ''
        ].map((value) => this.escapeCsvValue(value));

        csvLines.push(line.join(','));
      }

      this.downloadFile(
        csvLines.join('\n'),
        'pickabrick-merged-' + this.nowStamp() + '.csv',
        'text/csv;charset=utf-8;'
      );
    },

    escapeCsvValue(value) {
      const text = String(value ?? '');
      if (/[",\n]/.test(text)) {
        return '"' + text.replace(/"/g, '""') + '"';
      }
      return text;
    },

    nowStamp() {
      return new Date().toISOString().replace(/[:.]/g, '-');
    },

    downloadFile(content, fileName, mimeType) {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    }
  };
}

window.legoMergerApp = legoMergerApp;
