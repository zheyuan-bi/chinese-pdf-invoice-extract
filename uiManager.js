const displayColumns = [
  { name: "发票号码", alignment: "center", level: "header-info", visible: true },
  { name: "开票日期", alignment: "center", level: "header-info", visible: false },
  { name: "买方名称", alignment: "center", level: "header-info", visible: false },
  { name: "买方税号", alignment: "left", level: "header-info", visible: false },
  { name: "卖方名称", alignment: "center", level: "header-info", visible: false },
  { name: "卖方税号", alignment: "left", level: "header-info", visible: false },
  { name: "项目名称", alignment: "center", level: "line-info", visible: true },
  { name: "规格型号", alignment: "left", level: "line-info", visible: true },
  { name: "单位", alignment: "center", level: "line", visible: true },
  { name: "数量", alignment: "right", level: "line-info", visible: true },
  { name: "单价", alignment: "right", level: "line-info", visible: true },
  { name: "金额", alignment: "right", level: "line-info", visible: true },
  { name: "税率/征收率", alignment: "center", level: "line-info", visible: true },
  { name: "税额", alignment: "right", level: "line-info", visible: true },
];

const mainContainer = document.getElementById("main-container");
const fileInput = document.getElementById("file-input");
const fileStatus = document.getElementById("file-status");
const tableBody = document.getElementById("table-body");
const headerRow = document.getElementById("header-row");
const dropArea = document.getElementById("drop-area");
const copyButton = document.getElementById("copy-button");
const clearButton = document.getElementById("clear-button");
const settingsButton = document.getElementById("settings-button");
const columnSelectorPanel = document.getElementById("column-selector-panel");
const checkboxContainer = document.getElementById("checkbox-container");
const colGroup = document.getElementById("table-colgroup");

function renderColGroup() {
  colGroup.innerHTML = "";

  displayColumns.forEach((column) => {
    const col = document.createElement("col");

    if (!column.visible) col.style.visibility = "collapse";

    colGroup.appendChild(col);
  });
}

function renderTableHeader() {
  headerRow.innerHTML = "";
  displayColumns.forEach((column) => {
    const th = document.createElement("th");
    th.textContent = column.name;
    th.classList.add(column.level);
    headerRow.appendChild(th);
  });
}

function toggleColumn(index, visible) {
  const col = colGroup.children[index];
  if (!col) return;

  col.style.visibility = visible ? "" : "collapse";
}

function renderTable(files) {
  tableBody.innerHTML = ""; // Clear existing

  // The Ghost Container: This makes rendering 1000s of rows incredibly fast!
  const fragment = document.createDocumentFragment();

  if (files.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.textContent = "No pdf file detected";
    cell.colSpan = displayColumns.length;
    cell.classList.add("no-pdf-files");
    row.appendChild(cell);
    fragment.appendChild(row);
  } else {
    files.forEach((file) => {
      if (file.lineItems && file.lineItems.length > 0) {
        file.lineItems.forEach((item, index) => {
          const row = document.createElement("tr");
          row.setAttribute("data-tooltip", file.fileName);

          displayColumns.forEach((column) => {
            const cell = document.createElement("td");
            const value = item[column.name];
            const displayValue = value !== undefined ? value : "";
            cell.classList.add(column.alignment);
            cell.classList.add(column.level);
            cell.textContent = displayValue;
            if (displayValue !== "") {
              cell.setAttribute("title", displayValue);
            }

            // Mark the start of a file's data
            if (index === 0 && column.name === "发票号码") {
              cell.classList.add("new-invoice");
            }
            row.appendChild(cell);
          });
          fragment.appendChild(row);
        });
      } else {
        // Handle files with no line items
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        row.setAttribute("data-tooltip", file.fileName);
        cell.colSpan = displayColumns.length;
        cell.textContent = `File: "${file.fileName}" - No line items found or file is not a valid invoice.`;
        cell.style.textAlign = "left";
        cell.style.color = "#777";
        cell.style.fontFamily = "helvetica";
        cell.style.fontStyle = "italic";
        cell.style.fontSize = "13px";
        cell.classList.add("new-invoice");
        row.appendChild(cell);
        fragment.appendChild(row);
      }
    });
  }

  // Inject the ghost container into the real DOM all at once
  tableBody.appendChild(fragment);
}

function clearPage() {
  fileInput.value = null;
  tableBody.innerText = "";
  fileStatus.textContent = "0 PDF files selected";
}

function renderClick(button) {
  const originalHTML = button.innerHTML;
  button.textContent = "✔";
  button.disabled = true;
  setTimeout(() => {
    button.innerHTML = originalHTML;
    button.disabled = false;
  }, 2000);
}

export {
  mainContainer,
  fileInput,
  fileStatus,
  dropArea,
  copyButton,
  clearButton,
  settingsButton,
  columnSelectorPanel,
  checkboxContainer,
  renderTable,
  renderTableHeader,
  toggleColumn,
  renderColGroup,
  clearPage,
  renderClick,
  displayColumns,
};
