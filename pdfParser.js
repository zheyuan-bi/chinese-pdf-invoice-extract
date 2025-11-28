import * as pdfjsLib from "https://unpkg.com/pdfjs-dist@4.4.168/build/pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = "https://unpkg.com/pdfjs-dist@4.4.168/build/pdf.worker.mjs";

const mainLinepattern = /^\*[^*]+\*.+$/;
// There are 2 kinds of space elements in a row: meaningful and meaningless
// Meaningful space: a divider of text, takes up a fixed width, usually 4.5. e.g. iPhone 12 Pro Max
// Meaningless space: fills the gap between distinct blocks, takes up random width, e.g. iPad 2 pcs 999 1998 13% 259.74
const WIDTH_OF_MEANINGFUL_SPACE_45 = 4.5;

async function extractText(pdfData, fileName) {
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
  // For different pages of the same file, header row number and header coordinates are the same
  let headerRowNumber = 0;
  let columnHeaders;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    if (textContent.items.length === 0) continue;

    let rows = textContent.items.sort((a, b) => b.transform[5] - a.transform[5]);
    rows = groupNearbyRows(rows);
    rows.forEach((row) => row.sort((a, b) => a.transform[4] - b.transform[4]));
    const finalRows = rows.map((row) => mergeContinuousBlocks(row));

    if (invoiceNumber === "Not Found") invoiceNumber = findInvoiceNumber(finalRows);

    if (headerRowNumber === 0) {
      headerRowNumber = getHeaderRowNumber(finalRows);
      columnHeaders = getHeaderXCoordinate(finalRows[headerRowNumber]);
    }

    const lastLineItemRowNumber = getLastLineItemRowNumber(finalRows, headerRowNumber);
    const lineItemsRows = finalRows.slice(headerRowNumber + 1, lastLineItemRowNumber + 1);
    insertLineItems(lineItemsRows, combinedLineItems, columnHeaders);
  }

  combinedLineItems.forEach((item) => {
    item["发票号码"] = invoiceNumber;
  });

  return {
    fileName: fileName,
    invoiceNumber: invoiceNumber,
    lineItems: combinedLineItems,
    id: Date.now() + Math.random(),
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

/**
 * Groups nearby rows based on their vertical positions.
 * @param {Array<Object>} sortedRows - Array of text blocks sorted by y coordinate (top to bottom).
 * @returns {Array<Array<Object>>} - Array of grouped rows, each row is an array of text blocks.
 */
function groupNearbyRows(sortedRows) {
  // Set the tolerance as a linear func of character height lest tiny text gets grouped into the row above
  // Experience from test files shows that tolerance = 0.8 * height works
  // Smallest vertical gap known between 2 blocks that SHOULDN'T belong to the same row: 6.60
  // upperBlock = {height: 9, y: 240.992}, lowerBlock = {height: 5, y: 234.39}
  // Largest vertical gap known between 2 blocks that SHOULD belong to the same row: 6.93
  // upperBlock = {height: 10.99, y: 148.616}, lowerBlock = {height: 8.99, y: 141.683}
  const rows = [];
  let currentRow = [];
  if (sortedRows.length > 0) {
    let prevY = sortedRows[0].transform[5];
    for (const item of sortedRows) {
      const y = item.transform[5];
      const height = item.height;
      const tolerance = height * 0.8;
      if (height === 0 || prevY - y <= tolerance) {
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

    if (str.trim() === "" && Math.abs(width - WIDTH_OF_MEANINGFUL_SPACE_45) > 0.1) {
      return; //It's a space, but not a meaningful space, ignore
    }

    if (previousBlock && Math.abs(xStart - previousBlock.xEnd) <= tolerance) {
      previousBlock.str += str;
      // Do NOT increment from the xStart of first character because it will amplify errors
      previousBlock.xEnd = xEnd;
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
  // The row below the last valid line item row is either: "小计 ¥ xxx.xx ¥ xxx.xx" or "合计 ¥ xxx.xx ¥ xxx.xx"
  const regex = /(小.*计.*¥.+|合.*计.*¥.+)/;

  for (let i = headerRowLineNumber + 1; i < rows.length; i++) {
    const rowText = rows[i].map((block) => block.str).join("");

    if (regex.test(rowText)) {
      return i - 1;
    }
  }

  return defaultLastLineItemRowNumber;
}

function getHeaderXCoordinate(headerRow) {
  let currentItemIndex = 0;
  const columnHeaders = [
    //xStart, xEnd: x coordinate of start/end of header text, fixed
    //contentXStart, contentXEnd: x coordinate of start/end of contents, updated to indicate the largest content span
    /* Example: 项目名称 is found to be xStart: 70, xEnd: 100. One of its line items is A-long-text which will make the content span contentXStart: 50, contentXEnd: 120. Then any following items that fall between 50 and 120 should be recognized as 项目名称. contentXStart/contentXEnd will only be updated if something like A-very-long-text that spans even wider appear. */
    { name: "项目名称", xStart: null, xCenter: null, xEnd: null, contentXStart: null, contentXEnd: null },
    { name: "规格型号", xStart: null, xCenter: null, xEnd: null, contentXStart: null, contentXEnd: null },
    { name: "单位", xStart: null, xCenter: null, xEnd: null, contentXStart: null, contentXEnd: null },
    { name: "数量", xStart: null, xCenter: null, xEnd: null, contentXStart: null, contentXEnd: null },
    { name: "单价", xStart: null, xCenter: null, xEnd: null, contentXStart: null, contentXEnd: null },
    { name: "金额", xStart: null, xCenter: null, xEnd: null, contentXStart: null, contentXEnd: null },
    { name: "税率/征收率", xStart: null, xCenter: null, xEnd: null, contentXStart: null, contentXEnd: null },
    { name: "税额", xStart: null, xCenter: null, xEnd: null, contentXStart: null, contentXEnd: null },
  ];

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
        header.contentXStart = header.xStart;
      }

      if (headerBlock.str.includes(endChar)) {
        if (headerName === "税率/征收率" && !haveSeenZheng) continue;

        header.xEnd = headerBlock.xEnd;
        header.contentXEnd = header.xEnd;
        header.xCenter = (header.xStart + header.xEnd) / 2;
        currentItemIndex = i + 1; // start from the next block for the next header
        break;
      }
    }
  });

  return columnHeaders;
}

function insertLineItems(lines, linesData, columnHeaders) {
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
      const belongingColumn = getBelongingColumn(columnHeaders, block.xStart, xCenter, block.xEnd);

      if (belongingColumn) {
        // This is the key: Append the text to the correct property on the CURRENT item.
        // If the property doesn't exist yet, it initializes it with an empty string.
        currentItem[belongingColumn] = (currentItem[belongingColumn] || "") + block.str;
      }
    });
  });
}

function getBelongingColumn(columnHeaders, xStart, xCenter, xEnd, tolerance = 1) {
  for (let i = 0; i < columnHeaders.length; i++) {
    const header = columnHeaders[i];
    if (!header.xStart) continue; // Skip headers that weren't found

    //1st attempt: use header text range
    const isCenterContained = header.xStart - tolerance <= xCenter && xCenter <= header.xEnd + tolerance;
    const isRightContained = header.xStart - tolerance <= xEnd && xEnd <= header.xEnd + tolerance;
    const isLeftContained = header.xStart - tolerance <= xStart && xStart <= header.xEnd + tolerance;

    if (isCenterContained || isRightContained || isLeftContained) {
      header.contentXStart = Math.min(header.contentXStart, xStart);
      header.contentXEnd = Math.max(header.contentXEnd, xEnd);
      return header.name;
    }

    //2nd attempt: use the previously discovered largest content range
    const isCenterContainedByPrevContents =
      header.contentXStart - tolerance <= xCenter && xCenter <= header.contentXEnd + tolerance;
    if (isCenterContainedByPrevContents) {
      return header.name;
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

export { extractText };
