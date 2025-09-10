import * as pdfjsLib from "https://unpkg.com/pdfjs-dist@4.4.168/build/pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = "https://unpkg.com/pdfjs-dist@4.4.168/build/pdf.worker.mjs";

// --- DOM ELEMENTS AND GLOBAL STATE ---
const fileInput = document.getElementById("file-input");
const fileStatus = document.getElementById("file-status");
const outputTable = document.getElementById("output-table");
const dropArea = document.getElementById("drop-area");
const copyButton = document.getElementById("copy-button");
const clearButton = document.getElementById("clear-button");
const allLineItems = [];
const mainLinepattern = /^\*[^*]+\*.+$/;
// There are 2 kinds of space elements in a row: meaningful and meaningless
// Meaningful space: a divider of text, takes up a fixed width, usually 4.5. e.g. iPhone 12 Pro Max
// Meaningless space: fills the gap between distinct blocks, takes up random width, e.g. iPad 2 pcs 999 1998 13% 259.74
const WIDTH_OF_MEANINGFUL_SPACE = 4.5;

const columnHeaders = [
  // LeftBounded: contents of this column cannot go further left than xStart. Contents are either left aligned or all short and centered
  // Both leftBounded and rightBounded: contents are all short, can be either center, left or right
  // Neither side bounded: contents are definitely centered, there EXISTS long rows
  { name: "项目名称", xStart: null, xCenter: null, xEnd: null, leftBounded: false, rightBounded: false },
  { name: "规格型号", xStart: null, xCenter: null, xEnd: null, leftBounded: true, rightBounded: false },
  { name: "单位", xStart: null, xCenter: null, xEnd: null, leftBounded: true, rightBounded: true },
  { name: "数量", xStart: null, xCenter: null, xEnd: null, leftBounded: false, rightBounded: true },
  { name: "单价", xStart: null, xCenter: null, xEnd: null, leftBounded: false, rightBounded: true },
  { name: "金额", xStart: null, xCenter: null, xEnd: null, leftBounded: false, rightBounded: true },
  { name: "税率/征收率", xStart: null, xCenter: null, xEnd: null, leftBounded: true, rightBounded: true },
  { name: "税额", xStart: null, xCenter: null, xEnd: null, leftBounded: false, rightBounded: true },
];

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

// --- EVENT LISTENERS (No Changes) ---
["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
  dropArea.addEventListener(eventName, preventDefaults, false);
});
function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

dropArea.addEventListener("dragover", () => dropArea.classList.add("highlight"));
dropArea.addEventListener("dragleave", () => dropArea.classList.remove("highlight"));
dropArea.addEventListener("drop", () => dropArea.classList.remove("highlight"));
dropArea.addEventListener("click", () => fileInput.click());
dropArea.addEventListener("drop", (event) => handleFiles(event.dataTransfer.files), false);
fileInput.addEventListener("change", () => handleFiles(fileInput.files));

// --- FILE HANDLING LOGIC (No Changes) ---
function handleFiles(files) {
  const selectedPDFFiles = Array.from(files).filter((file) => file.name.toLowerCase().endsWith(".pdf"));
  clearPage();
  fileStatus.textContent = `${selectedPDFFiles.length} PDF files selected`;
  setTimeout(() => {
    processPDFFiles(selectedPDFFiles);
  }, 500);
}

async function processPDFFiles(PDFFiles) {
  const processingPromises = PDFFiles.map(processFile);
  try {
    const results = await Promise.all(processingPromises);
    results.forEach((parsedData) => {
      if (parsedData && parsedData.lineItems) {
        parsedData.lineItems.forEach((item) => {
          allLineItems.push({
            发票号码: parsedData["发票号码"],
            ...item,
          });
        });
      }
    });
    renderTable(allLineItems);
    fileStatus.textContent = `${PDFFiles.length} PDF file(s) processed successfully.`;
  } catch (error) {
    console.error("An error occurred during batch processing:", error);
    fileStatus.textContent = `Error: ${error.message}`;
  } finally {
    fileInput.value = null;
  }
}

function processFile(file) {
  // console.log(`---   ${file.name}   ---`);
  return new Promise((resolve, reject) => {
    const fileReader = new FileReader();
    fileReader.onload = async () => {
      try {
        const typedarray = new Uint8Array(fileReader.result);
        const parsedData = await extractText(typedarray);
        // console.log(`--- Parsed Data for ${file.name} ---`, parsedData);
        resolve(parsedData);
      } catch (error) {
        console.error(`Failed to process ${file.name}:`, error);
        reject(new Error(`Failed to process ${file.name}`));
      }
    };
    fileReader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    fileReader.readAsArrayBuffer(file);
  });
}

async function extractText(pdfData) {
  const CMAP_URL = "https://unpkg.com/pdfjs-dist@4.4.168/cmaps/";
  const CMAP_PACKED = true;
  const loadingTask = pdfjsLib.getDocument({
    data: pdfData,
    cMapUrl: CMAP_URL,
    cMapPacked: CMAP_PACKED,
  });
  const pdf = await loadingTask.promise;

  let combinedLineItems = [];
  let invoiceNumber = "Not Found";
  // For different pages of the same file, header row number is the same
  let headerRowNumber = 0;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    // console.log(textContent);
    let rows = textContent.items.sort((a, b) => b.transform[5] - a.transform[5]);
    rows = mergeNearbyRows(rows);
    rows.forEach((row) => row.sort((a, b) => a.transform[4] - b.transform[4]));
    const finalRows = rows.map((row) => mergeContinuousBlocks(row));
    // console.log(finalRows);
    if (invoiceNumber === "Not Found") invoiceNumber = findInvoiceNumber(finalRows);

    if (headerRowNumber === 0) {
      headerRowNumber = getHeaderRowNumber(finalRows);
      setHeaderCoordinate(finalRows[headerRowNumber]);
    }

    const lastLineItemRowNumber = getLastLineItemRowNumber(finalRows, headerRowNumber);
    const lineItemsRows = finalRows.slice(headerRowNumber + 1, lastLineItemRowNumber + 1);
    insertLineItems(lineItemsRows, combinedLineItems);
  }

  return {
    发票号码: invoiceNumber,
    lineItems: combinedLineItems,
  };
}

function findInvoiceNumber(rows) {
  for (const row of rows) {
    const rowText = row.map((block) => block.str).join("");
    if (rowText.includes("发票号码：") || rowText.includes("发票号码:")) {
      const match = rowText.match(/\b\d{20}\b/);
      if (match) {
        return match[0];
      } else {
        return `No invoice number found on the same line as "发票号码："`;
      }
    }
  }
  return "发票号码 is not found";
}

function mergeNearbyRows(sortedRows, tolerance = 7) {
  // a character is at least 9 in height, plus some margin, vertical tolerance should be around 9
  // However, sometimes the first line item can get intrude column header's vertical range, closing the gap to around 8
  // Also, the value of 小计/合计 can sometimes be 6 or 7 higher than the text 小计/合计
  // So items that should be on the same line can sometimes be far apart, while items that should be on differnt lines can sometimes be really close. Tolerance is tricky
  const rows = [];
  let currentRow = [];
  if (sortedRows.length > 0) {
    let prevY = sortedRows[0].transform[5];
    for (const item of sortedRows) {
      const y = item.transform[5];
      if (prevY - y <= tolerance) {
        currentRow.push(item);
      } else {
        rows.push(currentRow);
        currentRow = [item];
        prevY = y;
      }
    }
    rows.push(currentRow);
  }
  return rows;
}

function mergeContinuousBlocks(row, tolerance = 1) {
  const result = [];

  row.forEach((block) => {
    const { width, str } = block;
    const xStart = block.transform[4];
    const xEnd = xStart + width;

    const previousBlock = result[result.length - 1];

    if (previousBlock && Math.abs(xStart - previousBlock.xEnd) <= tolerance) {
      if (str !== " ") {
        previousBlock.str += str;
        // Do NOT increment from the xStart of first character because it will amplify errors
        previousBlock.xEnd = xEnd;
      } else {
        // Only append the content of meaningful spaces
        if (Math.abs(width - WIDTH_OF_MEANINGFUL_SPACE) < 0.1) {
          previousBlock.str += " ";
        }
        // Spaces will fill the gap between blocks, do NOT update xEnd, otherwise non-continuous blocks will be merged
      }
    } else {
      const newBlock = { xStart, xEnd, str };
      result.push(newBlock);
    }
  });

  return result;
}

function getHeaderRowNumber(rows) {
  const defaultHeaderRowNumber = 0;

  for (let i = 0; i < rows.length; i++) {
    const rowText = rows[i].map((block) => block.str).join("");

    if (rowText.includes("项目名称") && rowText.includes("规格型号")) {
      return i;
    }
  }

  return defaultHeaderRowNumber;
}

function getLastLineItemRowNumber(rows, headerRowLineNumber) {
  const defaultLastLineItemRowNumber = rows.length - 1;
  const regex = /(小.*计.*¥.+|合.*计.*¥.+)/; // This is the line immediately after the last line item

  for (let i = headerRowLineNumber + 1; i < rows.length; i++) {
    const rowText = rows[i].map((block) => block.str).join("");

    if (regex.test(rowText)) {
      return i - 1;
    }
  }

  return defaultLastLineItemRowNumber;
}

function setHeaderCoordinate(headerRow) {
  let currentItemIndex = 0;

  columnHeaders.forEach((header) => {
    const headerName = header.name;
    const startChar = headerName.charAt(0);
    const endChar = headerName.charAt(headerName.length - 1);
    // Possible forms of headerRow: [...税率/征收率...], [...税率, /, 征收率...], [...税, 率, /, 征, 税, 率...]
    // For the header 税率/征收率, if we grab the first and last character as usual, we might grab the first 率,
    // whose xEnd is incorrect. we need to grab the second 率 achieved by recording whether we've seen 征
    let haveSeenZheng = false;

    for (let i = currentItemIndex; i < headerRow.length; i++) {
      const headerBlock = headerRow[i];

      if (headerName === "税率/征收率" && headerBlock.str.includes("征")) haveSeenZheng = true;

      if (header.xStart === null && headerBlock.str.includes(startChar)) {
        header.xStart = headerBlock.xStart;
      }

      if (headerBlock.str.includes(endChar)) {
        if (headerName === "税率/征收率" && !haveSeenZheng) continue;

        header.xEnd = headerBlock.xEnd;
        header.xCenter = (header.xStart + header.xEnd) / 2;
        currentItemIndex = i + 1; // start from the next block for the next header
        break;
      }
    }
  });
  // console.log(columnHeaders);
}

function insertLineItems(lines, linesData) {
  lines.forEach((line) => {
    const lineText = line.map((block) => block.str).join("");
    const isMainLine = mainLinepattern.test(lineText);

    // If this is the start of a new invoice item, create a new empty object for it.
    if (isMainLine) {
      linesData.push({});
    }

    // Get a reference to the current item we're working on (the last one).
    // This could be the one we just created, or the one from the previous row if this is wrapped text.
    const currentItem = linesData[linesData.length - 1];

    // If there's no current item to add to (e.g., the first line isn't a main line), skip.
    if (!currentItem) return;

    // Process each block of text in the current row.
    line.forEach((block) => {
      if (block.str.trim() === "") return;

      const xCenter = (block.xStart + block.xEnd) / 2;
      const belongingColumn = getBelongingColumn(block.xStart, xCenter, block.xEnd);

      if (belongingColumn) {
        // This is the key: Append the text to the correct property on the CURRENT item.
        // If the property doesn't exist yet, it initializes it with an empty string.
        currentItem[belongingColumn] = (currentItem[belongingColumn] || "") + block.str;
      }
    });
  });
}

function getBelongingColumn(xStart, xCenter, xEnd, tolerance = 1) {
  for (let i = 0; i < columnHeaders.length; i++) {
    const header = columnHeaders[i];
    if (!header.xStart) continue; // Skip headers that weren't found
    const isCentered = header.xStart - tolerance <= xCenter && xCenter <= header.xEnd + tolerance;
    const isRightAligned = Math.abs(xEnd - header.xEnd) <= tolerance;
    const isLeftAligned = Math.abs(xStart - header.xStart) <= tolerance;
    if (isCentered || isRightAligned || isLeftAligned) {
      return header.name;
    }

    const nextHeader = i + 1 < columnHeaders.length ? columnHeaders[i + 1] : null;
    const previousHeader = i - 1 > -1 ? columnHeaders[i - 1] : null;

    if (nextHeader && header.xEnd + tolerance < xCenter) {
      const endsBeforeNextColumn = xEnd + tolerance < nextHeader.xStart;
      if (nextHeader.leftBounded && endsBeforeNextColumn) return header.name;
    }

    if (previousHeader && xCenter < header.xStart - tolerance) {
      const startsAfterPreviousColumn = previousHeader.xEnd + tolerance < xStart;
      if (previousHeader.rightBounded && startsAfterPreviousColumn) return header.name;
    }
  }
  // Fallback: find the closest header by center point
  let closestHeader = null;
  let minDistance = Infinity;
  for (const header of columnHeaders) {
    if (!header.xCenter) continue;
    const distance = Math.abs(xCenter - header.xCenter);
    if (distance < minDistance) {
      minDistance = distance;
      closestHeader = header.name;
    }
  }
  return closestHeader;
}

function renderTable(data) {
  if (data.length === 0) {
    outputTable.textContent = "No line items found.";
    return;
  }
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");
  const headerRow = document.createElement("tr");

  displayColumns.forEach((column) => {
    const th = document.createElement("th");
    th.textContent = column.name;
    th.classList.add(column.alignment);
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  let previousInvoiceNumber = "";

  data.forEach((item) => {
    const row = document.createElement("tr");
    displayColumns.forEach((column) => {
      const cell = document.createElement("td");
      const value = item[column.name];
      cell.textContent = value !== null && value !== undefined ? value : "";
      cell.classList.add(column.alignment);
      if (column.name === "发票号码" && value !== previousInvoiceNumber) {
        // Indicate the start of a new document
        cell.classList.add("new-invoice");
        previousInvoiceNumber = value;
      }
      row.appendChild(cell);
    });
    tbody.appendChild(row);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  outputTable.appendChild(table);
}

function clearPage() {
  fileInput.value = null;
  outputTable.innerHTML = "";

  const overlayDiv = document.createElement("div");
  overlayDiv.id = "table-overlay";
  outputTable.appendChild(overlayDiv);

  fileStatus.textContent = "0 PDF files selected";
  allLineItems.length = 0;
}

clearButton.addEventListener("click", () => {
  clearPage();
  renderClick(clearButton);
});

copyButton.addEventListener("click", () => {
  writeDataToClipboard();
  renderClick(copyButton);
});

function renderClick(button) {
  const originalTextContent = button.textContent;
  button.textContent = "✔";
  button.disabled = true;
  setTimeout(() => {
    button.textContent = originalTextContent;
    button.disabled = false;
  }, 2000);
}

function writeDataToClipboard() {
  if (allLineItems.length === 0) {
    navigator.clipboard.writeText("https://www.goldennumber.net/wp-content/uploads/pepsi-arnell-021109.pdf");
    return;
  }

  const headerString = displayColumns.map((column) => column.name).join("\t");

  const lineStrings = allLineItems.map((lineItem) => {
    return displayColumns
      .map((column) => {
        let value = lineItem[column.name];
        if (column.name === "发票号码") {
          // When pasted into Excel, can be treated as text instead of big number
          value = `\'${value}`;
        }
        return value !== null && value !== undefined ? value : "";
      })
      .join("\t");
  });

  const tsv = [headerString, ...lineStrings].join("\n");
  navigator.clipboard.writeText(tsv);
}
