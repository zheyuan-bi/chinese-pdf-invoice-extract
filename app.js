import { extractText } from "./pdfParser.js";
import {
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
  saveColumnVisibility,
  loadColumnVisibility,
  displayColumns,
} from "./uiManager.js";

const allFilesData = [];

loadColumnVisibility();
renderColGroup();
renderTableHeader();
initializeCheckboxes();

function initializeCheckboxes() {
  displayColumns.forEach((column, index) => {
    const label = document.createElement("label");
    label.className = "checkbox-row";
    label.addEventListener("click", (e) => {
      // If the target of the click IS NOT the checkbox, stop it
      if (e.target.type !== "checkbox") {
        e.preventDefault();
      }
    });

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = column.visible;
    if (column.name === "发票号码") checkbox.disabled = true;

    checkbox.addEventListener("change", (e) => {
      column.visible = e.target.checked;
      // Re-render the table instantly when a checkbox is toggled
      toggleColumn(index, e.target.checked);
      saveColumnVisibility();
    });

    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(" " + column.name));
    checkboxContainer.appendChild(label);
  });
}

settingsButton.addEventListener("click", () => {
  columnSelectorPanel.classList.toggle("hidden");
});

// Hide panel if user clicks outside of it
document.addEventListener("click", (e) => {
  if (!settingsButton.contains(e.target) && !columnSelectorPanel.contains(e.target)) {
    columnSelectorPanel.classList.add("hidden");
  }
});

["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
  dropArea.addEventListener(eventName, preventDefaults, false);
});

dropArea.addEventListener("dragover", () => dropArea.classList.add("highlight"));
dropArea.addEventListener("dragleave", () => dropArea.classList.remove("highlight"));
dropArea.addEventListener("drop", () => dropArea.classList.remove("highlight"));
dropArea.addEventListener("click", () => fileInput.click());
dropArea.addEventListener("drop", (event) => handleFiles(event.dataTransfer.files), false);
fileInput.addEventListener("change", () => handleFiles(fileInput.files));

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

async function handleFiles(files) {
  mainContainer.style.animationPlayState = "running";

  const selectedPDFFiles = Array.from(files).filter((file) => file.name.toLowerCase().endsWith(".pdf"));

  clearPage();
  allFilesData.length = 0;

  fileStatus.textContent = `${selectedPDFFiles.length} PDF files selected`;

  await processPDFFiles(selectedPDFFiles);

  // Let the loading animation linger 1 second after task finishes, especially nice for small tasks that end early
  setTimeout(() => {
    mainContainer.style.animationPlayState = "paused";
  }, 1000);
}

async function processPDFFiles(PDFFiles) {
  const processingPromises = PDFFiles.map(processFile);
  try {
    const results = await Promise.all(processingPromises);
    results.forEach((fileData) => {
      if (fileData) {
        allFilesData.push(fileData);
      }
    });
    renderTable(allFilesData);
    fileStatus.textContent = `${PDFFiles.length} PDF file(s) processed successfully.`;
    window.scrollTo({ left: 0, top: document.body.scrollHeight, behavior: "smooth" });
  } catch (error) {
    console.error("An error occurred during batch processing:", error);
    fileStatus.textContent = `Error: ${error.message}`;
  } finally {
    fileInput.value = null;
  }
}

function processFile(file) {
  return new Promise((resolve, reject) => {
    const fileReader = new FileReader();
    fileReader.onload = async () => {
      try {
        const typedarray = new Uint8Array(fileReader.result);
        const parsedData = await extractText(typedarray, file.name);
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

clearButton.addEventListener("click", () => {
  clearPage();
  allFilesData.length = 0;
  renderClick(clearButton);
});

copyButton.addEventListener("click", () => {
  writeDataToClipboard();
  renderClick(copyButton);
});

function writeDataToClipboard() {
  const allLines = allFilesData.flatMap((file) => file.lineItems);

  if (allLines.length === 0) {
    navigator.clipboard.writeText("https://www.nasa.gov/gallery/lunar-flyby/");
    return;
  }

  const headerString = displayColumns
    .filter((c) => c.visible)
    .map((column) => column.name)
    .join("\t");

  const lineStrings = allLines.map((lineItem) => {
    return displayColumns
      .filter((c) => c.visible)
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
