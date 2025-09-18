const displayColumns = [
  { name: "发票号码", alignment: "center" },
  { name: "项目名称", alignment: "center" },
  { name: "规格型号", alignment: "left" },
  { name: "单位", alignment: "center" },
  { name: "数量", alignment: "right" },
  { name: "单价", alignment: "right" },
  { name: "金额", alignment: "right" },
  { name: "税率/征收率", alignment: "center" },
  { name: "税额", alignment: "right" },
];

const mainContainer = document.getElementById("main-container");
const fileInput = document.getElementById("file-input");
const fileStatus = document.getElementById("file-status");
const tableBody = document.getElementById("table-body");
const dropArea = document.getElementById("drop-area");
const copyButton = document.getElementById("copy-button");
const clearButton = document.getElementById("clear-button");

function renderTable(files) {
  if (files.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.textContent = "No pdf file detected";
    cell.colSpan = displayColumns.length;
    cell.classList.add("no-pdf-files");
    row.appendChild(cell);
    tableBody.appendChild(row);
    return;
  }

  files.forEach((file) => {
    if (file.lineItems && file.lineItems.length > 0) {
      file.lineItems.forEach((item, index) => {
        const row = document.createElement("tr");
        row.setAttribute("data-tooltip", file.fileName);
        displayColumns.forEach((column) => {
          const cell = document.createElement("td");
          const value = item[column.name];
          cell.textContent = value !== undefined ? value : "";
          cell.classList.add(column.alignment);

          // Mark the start of a file's data
          if (index === 0 && column.name === "发票号码") {
            cell.classList.add("new-invoice");
          }
          row.appendChild(cell);
        });
        tableBody.appendChild(row);
      });
    } else {
      // This file had no line items, so we render a status row
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      row.setAttribute("data-tooltip", file.fileName);
      // colspan makes this cell span the entire width of the table
      cell.colSpan = displayColumns.length;
      cell.textContent = `File: "${file.fileName}" - No line items found or file is not a valid invoice.`;
      cell.style.textAlign = "left";
      cell.style.color = "#777";
      cell.classList.add("new-invoice");

      row.appendChild(cell);
      tableBody.appendChild(row);
    }
  });
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
  renderTable,
  clearPage,
  renderClick,
  displayColumns,
};
