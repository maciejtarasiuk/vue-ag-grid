<script>
import { AgGridVue } from "ag-grid-vue3";
import { ref, onMounted, onUnmounted, watch } from "vue";

export default {
  name: "App",
  components: {
    AgGridVue,
  },
  setup() {
    // Row Data with always one empty row at the end
    const rowData = ref([
      { make: "Tesla", model: "Model Y", price: 64950, electric: true },
      { make: "Ford", model: "F-Series", price: 33850, electric: false },
      { make: "Toyota", model: "Corolla", price: 29600, electric: false },
      { make: "", model: "", price: null, electric: false }, // Empty row
    ]);

    // Selection state
    const selectedCells = ref(new Set());
    const isSelecting = ref(false);
    const startCell = ref(null);
    const gridApi = ref(null);
    const clipboard = ref([]);

    // Column fields for easier reference
    const columnFields = ["make", "model", "price", "electric"];

    // Ensure there's always one empty row at the end
    const ensureEmptyRow = () => {
      const lastRow = rowData.value[rowData.value.length - 1];
      const isEmpty = !lastRow.make && !lastRow.model && !lastRow.price && !lastRow.electric;
      
      if (!isEmpty) {
        rowData.value.push({ make: "", model: "", price: null, electric: false });
      }
    };

    // Watch for changes in data to maintain empty row
    watch(rowData, () => {
      ensureEmptyRow();
    }, { deep: true });

    // Get cell identifier
    const getCellId = (rowIndex, colField) => `${rowIndex}-${colField}`;

    // Check if cell is selected - using AG Grid's built-in focus style
    const isCellSelected = (params) => {
      const cellId = getCellId(params.node.rowIndex, params.colDef.field);
      return selectedCells.value.has(cellId);
    };

    // Clear selection
    const clearSelection = () => {
      selectedCells.value.clear();
      if (gridApi.value) {
        gridApi.value.refreshCells({ force: true });
      }
    };

    // Handle mouse down - start selection
    const onCellMouseDown = (event) => {
      const rowIndex = event.node.rowIndex;
      const colField = event.colDef.field;
      const colIndex = columnFields.indexOf(colField);
      
      console.log('Mouse down:', rowIndex, colField);
      
      if (event.event.ctrlKey || event.event.metaKey) {
        // Multi-select with Cmd/Ctrl
        const cellId = getCellId(rowIndex, colField);
        if (selectedCells.value.has(cellId)) {
          selectedCells.value.delete(cellId);
        } else {
          selectedCells.value.add(cellId);
        }
      } else if (event.event.shiftKey && startCell.value) {
        // Range select
        selectRange(startCell.value.row, startCell.value.col, rowIndex, colIndex);
      } else {
        // Start new selection
        selectedCells.value.clear();
        const cellId = getCellId(rowIndex, colField);
        selectedCells.value.add(cellId);
        startCell.value = { row: rowIndex, col: colIndex };
        isSelecting.value = true;
      }
      
      if (gridApi.value) {
        gridApi.value.refreshCells({ force: true });
      }
    };

    // Handle mouse over during selection
    const onCellMouseOver = (event) => {
      if (!isSelecting.value || !startCell.value) return;
      
      const rowIndex = event.node.rowIndex;
      const colIndex = columnFields.indexOf(event.colDef.field);
      
      // Select range from start to current cell
      selectRange(startCell.value.row, startCell.value.col, rowIndex, colIndex);
      
      if (gridApi.value) {
        gridApi.value.refreshCells({ force: true });
      }
    };

    // Select range of cells
    const selectRange = (startRow, startCol, endRow, endCol) => {
      selectedCells.value.clear();
      
      const minRow = Math.min(startRow, endRow);
      const maxRow = Math.max(startRow, endRow);
      const minCol = Math.min(startCol, endCol);
      const maxCol = Math.max(startCol, endCol);
      
      for (let row = minRow; row <= maxRow; row++) {
        for (let col = minCol; col <= maxCol; col++) {
          if (col < columnFields.length) {
            const cellId = getCellId(row, columnFields[col]);
            selectedCells.value.add(cellId);
          }
        }
      }
    };

    // Handle mouse up - end selection
    const onMouseUp = () => {
      isSelecting.value = false;
    };

    // Copy selected cells in proper table format
    const copySelectedCells = () => {
      if (selectedCells.value.size === 0) {
        showNotification("Nie ma zaznaczonych komórek");
        return;
      }

      // Find bounds of selection
      const positions = [];
      for (const cellId of selectedCells.value) {
        const [rowIndex, colField] = cellId.split('-');
        const row = parseInt(rowIndex);
        const col = columnFields.indexOf(colField);
        positions.push({ row, col, value: rowData.value[row][colField] });
      }
      
      const minRow = Math.min(...positions.map(p => p.row));
      const maxRow = Math.max(...positions.map(p => p.row));
      const minCol = Math.min(...positions.map(p => p.col));
      const maxCol = Math.max(...positions.map(p => p.col));
      
      // Create 2D array
      const cellData = [];
      for (let row = minRow; row <= maxRow; row++) {
        const rowData_copy = [];
        for (let col = minCol; col <= maxCol; col++) {
          const pos = positions.find(p => p.row === row && p.col === col);
          rowData_copy.push(pos ? pos.value : '');
        }
        cellData.push(rowData_copy);
      }
      
      clipboard.value = cellData;
      
      const textData = cellData.map(row => row.join('\t')).join('\n');
      navigator.clipboard.writeText(textData).catch(() => {
        console.log('Could not copy to system clipboard');
      });
      
      showNotification(`✅ Skopiowano ${cellData.length}x${cellData[0]?.length || 0} komórek`);
    };

    // Paste data starting from first selected cell or top-left
    const pasteData = () => {
      if (!clipboard.value.length) {
        showNotification("❌ Clipboard jest pusty");
        return;
      }
      
      // Find the starting position (first selected cell or 0,0)
      let startRow = 0;
      let startCol = 0;
      
      if (selectedCells.value.size > 0) {
        const firstCellId = Array.from(selectedCells.value)[0];
        const [rowIndex, colField] = firstCellId.split('-');
        startRow = parseInt(rowIndex);
        startCol = columnFields.indexOf(colField);
      }
      
      // Ensure we have enough rows
      const neededRows = startRow + clipboard.value.length;
      while (rowData.value.length < neededRows) {
        rowData.value.push({ make: "", model: "", price: null, electric: false });
      }
      
      // Paste data
      clipboard.value.forEach((rowArray, rowOffset) => {
        const targetRowIndex = startRow + rowOffset;
        
        rowArray.forEach((value, colOffset) => {
          const targetColIndex = startCol + colOffset;
          
          if (targetColIndex < columnFields.length && targetRowIndex < rowData.value.length) {
            const field = columnFields[targetColIndex];
            
            if (field === 'price') {
              rowData.value[targetRowIndex][field] = value ? parseFloat(value) : null;
            } else if (field === 'electric') {
              rowData.value[targetRowIndex][field] = Boolean(value);
            } else {
              rowData.value[targetRowIndex][field] = value || '';
            }
          }
        });
      });
      
      ensureEmptyRow();
      clearSelection();
      
      showNotification(`✅ Wklejono ${clipboard.value.length}x${clipboard.value[0]?.length || 0} komórek`);
    };

    // Show notification
    const showNotification = (message) => {
      console.log(message);
      
      const toast = document.createElement('div');
      toast.textContent = message;
      toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #2c3e50;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        font-weight: 500;
      `;
      
      document.body.appendChild(toast);
      
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 2000);
    };

    // Delete selected cells
    const deleteSelectedCells = () => {
      if (selectedCells.value.size === 0) {
        showNotification("❌ Nie ma zaznaczonych komórek");
        return;
      }
      
      for (const cellId of selectedCells.value) {
        const [rowIndex, colField] = cellId.split('-');
        const row = parseInt(rowIndex);
        
        if (colField === 'price') {
          rowData.value[row][colField] = null;
        } else if (colField === 'electric') {
          rowData.value[row][colField] = false;
        } else {
          rowData.value[row][colField] = "";
        }
      }
      
      showNotification(`✅ Wyczyszczono ${selectedCells.value.size} komórek`);
    };

    // Clear all data
    const clearAllData = () => {
      rowData.value = [{ make: "", model: "", price: null, electric: false }];
      clearSelection();
      showNotification("✅ Wyczyszczono wszystkie dane");
    };

    // Column definitions - SIMPLE
    const colDefs = ref([
      {
        field: "make",
        headerName: "Marka",
        editable: true,
        flex: 1,
        cellClassRules: {
          'ag-cell-range-selected': isCellSelected
        },
      },
      {
        field: "model",
        headerName: "Model",
        editable: true,
        flex: 1,
        cellClassRules: {
          'ag-cell-range-selected': isCellSelected
        },
      },
      {
        field: "price",
        headerName: "Cena",
        editable: true,
        cellDataType: "number",
        flex: 1,
        cellClassRules: {
          'ag-cell-range-selected': isCellSelected
        },
        valueFormatter: (params) => {
          if (params.value == null) return "";
          return new Intl.NumberFormat('pl-PL', {
            style: 'currency',
            currency: 'PLN'
          }).format(params.value);
        }
      },
      {
        field: "electric",
        headerName: "Elektryczny",
        editable: true,
        cellDataType: "boolean",
        flex: 1,
        cellClassRules: {
          'ag-cell-range-selected': isCellSelected
        },
      },
    ]);

    // Track current focused cell for arrow navigation
    const currentFocusedCell = ref(null);

    // Handle arrow key navigation with selection
    const handleArrowNavigation = (direction, shiftPressed) => {
      if (!currentFocusedCell.value) return;
      
      const { row, col } = currentFocusedCell.value;
      let newRow = row;
      let newCol = col;
      
      switch (direction) {
        case 'ArrowUp':
          newRow = Math.max(0, row - 1);
          break;
        case 'ArrowDown':
          newRow = Math.min(rowData.value.length - 1, row + 1);
          break;
        case 'ArrowLeft':
          newCol = Math.max(0, col - 1);
          break;
        case 'ArrowRight':
          newCol = Math.min(columnFields.length - 1, col + 1);
          break;
      }
      
      // Update focused cell
      currentFocusedCell.value = { row: newRow, col: newCol };
      
      if (shiftPressed) {
        // Extend selection
        if (!startCell.value) {
          startCell.value = { row, col };
        }
        selectRange(startCell.value.row, startCell.value.col, newRow, newCol);
      } else {
        // Move selection
        selectedCells.value.clear();
        const cellId = getCellId(newRow, columnFields[newCol]);
        selectedCells.value.add(cellId);
        startCell.value = { row: newRow, col: newCol };
      }
      
      if (gridApi.value) {
        gridApi.value.refreshCells({ force: true });
      }
    };

    // Check if user is currently editing a cell
    const isEditing = ref(false);

    // Keyboard handlers
    const handleKeyDown = (event) => {
      // Don't interfere if user is editing a cell
      if (isEditing.value) {
        return;
      }
      
      // Don't interfere if user is typing in an input or textarea
      if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
        return;
      }
      
      // Handle arrow keys only if not editing
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault();
        handleArrowNavigation(event.key, event.shiftKey);
        return;
      }
      
      // Handle special keys
      if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
        event.preventDefault();
        copySelectedCells();
      } else if ((event.ctrlKey || event.metaKey) && event.key === 'v') {
        event.preventDefault();
        pasteData();
      } else if (event.key === 'Delete') {
        event.preventDefault();
        deleteSelectedCells();
      } else if (event.key === 'Escape') {
        clearSelection();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        startEditingCurrentCell();
      } else if ((event.ctrlKey || event.metaKey) && event.key === 'a') {
        event.preventDefault();
        selectedCells.value.clear();
        for (let row = 0; row < rowData.value.length - 1; row++) {
          for (let col = 0; col < columnFields.length; col++) {
            const cellId = getCellId(row, columnFields[col]);
            selectedCells.value.add(cellId);
          }
        }
        if (gridApi.value) {
          gridApi.value.refreshCells({ force: true });
        }
      } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
        // User started typing - start editing current cell
        startEditingCurrentCell();
      }
    };

    // Start editing the currently focused cell
    const startEditingCurrentCell = () => {
      if (!currentFocusedCell.value || !gridApi.value) return;
      
      const { row, col } = currentFocusedCell.value;
      const colField = columnFields[col];
      
      // Find the node and start editing
      gridApi.value.forEachNode((node) => {
        if (node.rowIndex === row) {
          gridApi.value.startEditingCell({
            rowIndex: row,
            colKey: colField
          });
          isEditing.value = true;
        }
      });
    };

    // Get cell coordinates from DOM element
    const getCellCoords = (element) => {
      const cell = element.closest('.ag-cell');
      if (!cell) return null;
      
      const row = cell.closest('.ag-row');
      if (!row) return null;
      
      const rowIndex = parseInt(row.getAttribute('row-index'));
      const colId = cell.getAttribute('col-id');
      const colIndex = columnFields.indexOf(colId);
      
      if (rowIndex >= 0 && colIndex >= 0) {
        return { rowIndex, colIndex, colId };
      }
      return null;
    };

    // Handle mouse down - start selection
    const handleGridMouseDown = (event) => {
      const coords = getCellCoords(event.target);
      if (!coords) return;
      
      console.log('🎯 Mouse down:', coords.rowIndex, coords.colId);
      
      if (event.ctrlKey || event.metaKey) {
        // Multi-select with Cmd/Ctrl
        const cellId = getCellId(coords.rowIndex, coords.colId);
        if (selectedCells.value.has(cellId)) {
          selectedCells.value.delete(cellId);
        } else {
          selectedCells.value.add(cellId);
        }
      } else if (event.shiftKey && startCell.value) {
        // Range select with Shift
        selectRange(startCell.value.row, startCell.value.col, coords.rowIndex, coords.colIndex);
      } else {
        // Start new selection
        selectedCells.value.clear();
        const cellId = getCellId(coords.rowIndex, coords.colId);
        selectedCells.value.add(cellId);
        startCell.value = { row: coords.rowIndex, col: coords.colIndex };
        currentFocusedCell.value = { row: coords.rowIndex, col: coords.colIndex };
        isSelecting.value = true;
      }
      
      if (gridApi.value) {
        gridApi.value.refreshCells({ force: true });
      }
      
      event.preventDefault();
    };

    // Handle mouse over during selection
    const handleGridMouseOver = (event) => {
      if (!isSelecting.value || !startCell.value) return;
      
      const coords = getCellCoords(event.target);
      if (!coords) return;
      
      // Select range from start to current cell
      selectRange(startCell.value.row, startCell.value.col, coords.rowIndex, coords.colIndex);
      
      if (gridApi.value) {
        gridApi.value.refreshCells({ force: true });
      }
    };

    // Grid ready
    const onGridReady = (params) => {
      gridApi.value = params.api;
      console.log('✅ Grid ready');
      
      // Initialize focus on first cell
      currentFocusedCell.value = { row: 0, col: 0 };
      const cellId = getCellId(0, columnFields[0]);
      selectedCells.value.add(cellId);
      startCell.value = { row: 0, col: 0 };
      
      // Add mouse event listeners for drag selection
      setTimeout(() => {
        const gridElement = document.querySelector('.ag-theme-quartz');
        if (gridElement) {
          gridElement.addEventListener('mousedown', handleGridMouseDown);
          gridElement.addEventListener('mouseover', handleGridMouseOver);
          console.log('✅ Mouse listeners added for drag selection');
        }
        
        // Refresh to show initial selection
        if (gridApi.value) {
          gridApi.value.refreshCells({ force: true });
        }
      }, 100);
    };

    // Lifecycle
    onMounted(() => {
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('mouseup', onMouseUp);
      ensureEmptyRow();
    });

    onUnmounted(() => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mouseup', onMouseUp);
    });

    return {
      rowData,
      colDefs,
      selectedCells,
      clipboard,
      isEditing,
      onGridReady,
      copySelectedCells,
      pasteData,
      deleteSelectedCells,
      clearAllData,
      clearSelection,
    };
  },
};
</script>

<template>
  <div class="app-container">
    <div class="header">
      <h1>🚗 Excel-like Grid - SIMPLE VERSION</h1>
      <p>Kliknij i przeciągnij = zakres • Cmd+klik = multi-select • Shift+klik = rozszerz • Cmd+C/V</p>
    </div>

    <div class="controls">
      <button @click="copySelectedCells" class="btn btn-success">
        📋 Kopiuj (Cmd+C)
      </button>
      <button @click="pasteData" class="btn btn-primary">
        📥 Wklej (Cmd+V)
      </button>
      <button @click="deleteSelectedCells" class="btn btn-warning">
        🗑️ Usuń (Delete)
      </button>
      <button @click="clearSelection" class="btn btn-secondary">
        ❌ Anuluj (Esc)
      </button>
      <button @click="clearAllData" class="btn btn-danger">
        🧹 Wyczyść wszystko
      </button>
    </div>

    <div class="selection-info" v-if="selectedCells.size > 0">
      <span class="info-badge">
        Zaznaczono: {{ selectedCells.size }} komórek
      </span>
    </div>

    <div class="grid-container">
      <ag-grid-vue
        :rowData="rowData"
        :columnDefs="colDefs"
        :enableClipboard="false"
        :undoRedoCellEditing="true"
        :undoRedoCellEditingLimit="20"
        :enableCellTextSelection="false"
        :suppressFocusAfterRefresh="true"
        @grid-ready="onGridReady"
        @cell-editing-started="() => { isEditing = true }"
        @cell-editing-stopped="() => { isEditing = false }"
        theme="legacy"
        class="ag-theme-quartz simple-grid"
        style="height: 400px; width: 100%;"
        tabindex="0"
      >
      </ag-grid-vue>
    </div>

    <div class="instructions">
      <h3>🎯 Proste instrukcje:</h3>
      <ul>
        <li><strong>Strzałki</strong> - nawiguj po komórkach</li>
        <li><strong>Shift + strzałki</strong> - zaznacz zakres nawigując</li>
        <li><strong>Enter lub zacznij pisać</strong> - edytuj komórkę</li>
        <li><strong>Podwójne kliknięcie</strong> - edytuj komórkę</li>
        <li><strong>Kliknij i przeciągnij</strong> - zaznacz zakres myszką</li>
        <li><strong>Cmd+klik</strong> - multi-select (dodaj/usuń komórki)</li>
        <li><strong>Shift+klik</strong> - rozszerz zaznaczenie do komórki</li>
        <li><strong>Cmd+C</strong> - kopiuj zaznaczone</li>
        <li><strong>Cmd+V</strong> - wklej (zachowuje strukturę tabeli)</li>
        <li><strong>Delete</strong> - usuń zawartość zaznaczonych komórek</li>
        <li><strong>Escape</strong> - anuluj zaznaczenie</li>
        <li><strong>Cmd+A</strong> - zaznacz wszystko</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.app-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.header {
  text-align: center;
  margin-bottom: 30px;
}

.header h1 {
  color: #2c3e50;
  margin-bottom: 10px;
}

.header p {
  color: #7f8c8d;
  font-size: 14px;
}

.controls {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  font-size: 14px;
  transition: all 0.2s ease;
}

.btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.btn-success { background-color: #27ae60; color: white; }
.btn-primary { background-color: #3498db; color: white; }
.btn-warning { background-color: #f39c12; color: white; }
.btn-secondary { background-color: #95a5a6; color: white; }
.btn-danger { background-color: #e74c3c; color: white; }

.selection-info {
  margin-bottom: 15px;
}

.info-badge {
  background-color: #3498db;
  color: white;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
}

.grid-container {
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0,0,0,0.1);
  margin-bottom: 30px;
}

.instructions {
  background-color: #f8f9fa;
  padding: 20px;
  border-radius: 8px;
  border-left: 4px solid #3498db;
}

.instructions h3 {
  margin-top: 0;
  color: #2c3e50;
}

.instructions ul {
  margin: 0;
  padding-left: 20px;
}

.instructions li {
  margin-bottom: 8px;
  line-height: 1.5;
}

/* Make cells more responsive to selection */
:deep(.ag-cell) {
  user-select: none;
}

/* Fallback: if AG Grid classes don't work, add subtle style */
:deep(.ag-cell-range-selected) {
  background-color: rgba(66, 133, 244, 0.1) !important;
  border: 1px solid #4285f4 !important;
}

:deep(.ag-cell) {
  cursor: pointer !important;
}

:deep(.ag-cell:hover) {
  background-color: #ecf0f1 !important;
}

:deep(.ag-header-cell) {
  background-color: #34495e !important;
  color: white !important;
  font-weight: 600;
}

:deep(.ag-row:hover) {
  background-color: #e8f4fd !important;
}
</style>